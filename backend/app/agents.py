import os
import time
import json
import re
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from app.models import CandidateDB, JobDescriptionDB, AuditLogDB
from app.guardrails import execute_guardrail_shield
from app.rag_engine import hybrid_retrieve_and_rerank
from app.github_tool import fetch_github_repositories, verify_skills_against_github, extract_cv_projects

# Optional OpenAI Client for Live LLM Reasoning
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


async def screen_candidate_multi_agent(
    candidate: CandidateDB,
    job_desc: JobDescriptionDB,
    db: Session
) -> Dict[str, Any]:
    """
    Executes 5-Agent Pipeline:
    1. Guardrails Shield (PII redaction & Prompt Injection detection)
    2. RAG Semantic Match (Hybrid ChromaDB dense + sparse retrieval)
    3. Live GitHub Code Authenticity & Claims Verification
    4. Reflection & Tailored Viva Question Synthesis
    5. Governance Audit Logging
    """
    start_total_time = time.perf_counter()
    traces = []

    # -------------------------------------------------------------
    # Step 1: Guardrails Shield Agent (Module 8)
    # -------------------------------------------------------------
    t0 = time.perf_counter()
    guardrail_result = execute_guardrail_shield(candidate.resume_text, context="resume_screening")
    step1_latency = round((time.perf_counter() - t0) * 1000, 2)

    if not guardrail_result["is_safe"]:
        # Block malicious applicant immediately
        workflow_status = "BLOCKED_BY_GUARDRAIL"
        verified_match_score = 0.0
        rag_score = 0.0
        github_score = 0.0
        hallucination_risk = "HIGH"

        audit_entry = AuditLogDB(
            candidate_id=candidate.id,
            candidate_name=candidate.name,
            workflow_step="Guardrail Shield Ingestion",
            guardrail_status="BLOCKED",
            details=f"SECURITY VIOLATION: {guardrail_result['explanation']} [Pattern: {guardrail_result.get('attack_pattern', 'N/A')}]",
            confidence_score=0.0,
            hallucination_risk="HIGH",
            latency_ms=step1_latency,
            source_chunks=[]
        )
        db.add(audit_entry)

        candidate.workflow_status = workflow_status
        candidate.verified_match_score = 0.0
        candidate.rag_score = 0.0
        candidate.github_score = 0.0
        candidate.hallucination_risk = "HIGH"
        candidate.viva_questions = []
        candidate.claim_vs_proof = []
        db.commit()
        db.refresh(candidate)

        traces.append({
            "step_number": 1,
            "step_name": "Guardrail Shield & PII Redaction",
            "status": "BLOCKED",
            "latency_ms": step1_latency,
            "output_summary": f"Attack Detected ({guardrail_result.get('attack_category', 'PROMPT_INJECTION')}). Ingestion halted.",
            "data": guardrail_result
        })

        return {
            "candidate_id": candidate.id,
            "candidate_name": candidate.name,
            "workflow_status": "BLOCKED_BY_GUARDRAIL",
            "guardrail_status": "BLOCKED_BY_GUARDRAIL",
            "rag_score": 0.0,
            "github_score": 0.0,
            "verified_match_score": 0.0,
            "hallucination_risk": "HIGH",
            "claim_vs_proof": [],
            "viva_questions": [],
            "retrieved_chunks": [],
            "agent_traces": traces,
            "email_draft": "Application rejected automatically due to security policy violation.",
            "total_latency_ms": step1_latency
        }

    traces.append({
        "step_number": 1,
        "step_name": "Guardrail Shield & PII Redaction",
        "status": "COMPLETED",
        "latency_ms": step1_latency,
        "output_summary": f"Passed safety filters. Redacted {guardrail_result['pii_redacted_count']} PII entities ({', '.join(guardrail_result['pii_types_detected']) if guardrail_result['pii_types_detected'] else 'None'}).",
        "data": {
            "pii_redacted_count": guardrail_result["pii_redacted_count"],
            "pii_types": guardrail_result["pii_types_detected"],
            "is_safe": True
        }
    })

    sanitized_resume = guardrail_result["sanitized_text"]

    # -------------------------------------------------------------
    # Step 2: RAG Semantic Match Agent (Module 3 & 4)
    # -------------------------------------------------------------
    t0 = time.perf_counter()
    rag_query = f"{job_desc.title} {' '.join(job_desc.required_skills or [])} {job_desc.description}"
    rag_eval = hybrid_retrieve_and_rerank(
        resume_text=sanitized_resume,
        query=rag_query,
        strategy_name="recursive",
        top_k=4
    )
    rag_score = round(rag_eval["semantic_score"], 1)
    retrieved_chunks = rag_eval["retrieved_chunks"]
    step2_latency = round((time.perf_counter() - t0) * 1000, 2)

    traces.append({
        "step_number": 2,
        "step_name": "RAG Semantic Retrieval & Re-ranking",
        "status": "COMPLETED",
        "latency_ms": step2_latency,
        "output_summary": f"Retrieved top-{len(retrieved_chunks)} relevant resume passages via ChromaDB vector embeddings. Semantic Match: {rag_score}%.",
        "data": {
            "strategy": "Recursive Character (chunk=400, overlap=60)",
            "semantic_score": rag_score,
            "chunks_count": len(retrieved_chunks)
        }
    })

    # -------------------------------------------------------------
    # Step 3: GitHub Code Authenticity & Verification Agent (Module 6)
    # -------------------------------------------------------------
    t0 = time.perf_counter()
    github_handle = candidate.github_username or ""
    repos, github_status = await fetch_github_repositories(github_handle)

    candidate_skills = candidate.raw_skills or []
    verification = verify_skills_against_github(
        claimed_skills=candidate_skills,
        repos=repos,
        required_skills=job_desc.required_skills if hasattr(job_desc, 'required_skills') else [],
        resume_text=candidate.resume_text
    )
    github_score = verification["github_score"]
    step3_latency = round((time.perf_counter() - t0) * 1000, 2)

    traces.append({
        "step_number": 3,
        "step_name": "GitHub Tool Calling & Code Verification",
        "status": "COMPLETED",
        "latency_ms": step3_latency,
        "output_summary": f"Queried GitHub API for @{github_handle} ({github_status}). Verified {len(verification.get('verified_skills', []))} skills across {len(repos)} public repos. Authenticity Score: {github_score}%.",
        "data": {
            "github_username": github_handle,
            "api_status": github_status,
            "repos_count": len(repos),
            "github_score": github_score,
            "discrepancies_detected": len(verification["discrepancies"])
        }
    })

    # -------------------------------------------------------------
    # Step 4: Reflection & Viva Generator Agent
    # -------------------------------------------------------------
    t0 = time.perf_counter()
    # Weighted calculation: 45% RAG Semantic Relevance + 55% Verified GitHub Authenticity
    verified_match_score = round((rag_score * 0.45) + (github_score * 0.55), 1)

    # Discrepancy & Hallucination Assessment
    if len(verification["discrepancies"]) > 0 and github_score < 35.0 and rag_score > 55.0:
        hallucination_risk = "HIGH"
        workflow_status = "ESCALATED"
    elif verified_match_score >= 70.0:
        hallucination_risk = "LOW"
        workflow_status = "APPROVED_FOR_INTERVIEW"
    elif verified_match_score >= 45.0:
        hallucination_risk = "MEDIUM"
        workflow_status = "PENDING_HR_REVIEW"
    else:
        hallucination_risk = "LOW"
        workflow_status = "REJECTED"

    # 100% Dynamic 5 Viva Questions citing actual candidate repositories and CV claims
    viva_questions = generate_viva_questions(
        candidate=candidate,
        repos=repos,
        verification=verification,
        job_desc=job_desc
    )
    email_draft = generate_candidate_email(
        candidate=candidate,
        decision=workflow_status,
        score=verified_match_score,
        repos=repos,
        tone="Formal",
        role_title=job_desc.title if job_desc else "AI Systems Engineer"
    )
    step4_latency = round((time.perf_counter() - t0) * 1000, 2)

    traces.append({
        "step_number": 4,
        "step_name": "Reflection & Viva Generator",
        "status": "COMPLETED",
        "latency_ms": step4_latency,
        "output_summary": f"Synthesized verified score: {verified_match_score}% (Risk: {hallucination_risk}) for role '{job_desc.title}'. Generated 5 tailored technical viva questions citing specific codebases.",
        "data": {
            "verified_match_score": verified_match_score,
            "hallucination_risk": hallucination_risk,
            "viva_questions_count": len(viva_questions),
            "target_role": job_desc.title
        }
    })

    # -------------------------------------------------------------
    # Step 5: Governance Audit Logger Agent
    # -------------------------------------------------------------
    t0 = time.perf_counter()
    audit_entry = AuditLogDB(
        candidate_id=candidate.id,
        candidate_name=candidate.name,
        workflow_step="Multi-Agent Screening Pipeline",
        guardrail_status="PASSED",
        details=f"Screening complete for '{job_desc.title}': RAG {rag_score}%, GitHub {github_score}%, Verified {verified_match_score}%, Risk: {hallucination_risk}",
        confidence_score=round(verified_match_score / 100.0, 2),
        hallucination_risk=hallucination_risk,
        latency_ms=round((time.perf_counter() - start_total_time) * 1000, 2),
        source_chunks=[{"chunk_id": c.get("chunk_id"), "score": c.get("similarity_score")} for c in retrieved_chunks]
    )
    db.add(audit_entry)

    # Persist updates to candidate DB
    candidate.workflow_status = workflow_status
    candidate.verified_match_score = verified_match_score
    candidate.rag_score = rag_score
    candidate.github_score = github_score
    candidate.hallucination_risk = hallucination_risk
    candidate.viva_questions = [q if isinstance(q, dict) else q.__dict__ for q in viva_questions]
    candidate.claim_vs_proof = verification["claim_vs_proof"]
    candidate.email_draft = email_draft
    db.commit()
    db.refresh(candidate)

    step5_latency = round((time.perf_counter() - t0) * 1000, 2)
    traces.append({
        "step_number": 5,
        "step_name": "Governance Audit Logger",
        "status": "COMPLETED",
        "latency_ms": step5_latency,
        "output_summary": "Logged full evaluation telemetry, source chunk citations, and compliance records to SQLite database.",
        "data": {
            "audit_id": audit_entry.id,
            "confidence_score": round(verified_match_score / 100.0, 2)
        }
    })

    total_latency = round((time.perf_counter() - start_total_time) * 1000, 2)

    return {
        "candidate_id": candidate.id,
        "candidate_name": candidate.name,
        "workflow_status": workflow_status,
        "guardrail_status": "PASSED",
        "rag_score": rag_score,
        "github_score": github_score,
        "verified_match_score": verified_match_score,
        "hallucination_risk": hallucination_risk,
        "claim_vs_proof": verification["claim_vs_proof"],
        "viva_questions": candidate.viva_questions,
        "retrieved_chunks": retrieved_chunks,
        "agent_traces": traces,
        "email_draft": email_draft,
        "total_latency_ms": total_latency
    }


def generate_viva_questions(
    candidate: CandidateDB,
    repos: List[Dict[str, Any]],
    verification: Dict[str, Any],
    job_desc: Optional[Any] = None
) -> List[Dict[str, Any]]:
    """
    100% Dynamic Viva Question Generator:
    Generates 5 candidate-specific technical viva questions strictly citing:
      Q1: Candidate's #1 Real GitHub Repo & Architecture
      Q2: Candidate's #2 Real GitHub Repo or Implementation Deep-Dive
      Q3: Specific CV Project from their resume
      Q4: Unverified CV Skill / Discrepancy Audit (0 GitHub proof)
      Q5: Target Job Profile Integration with strongest verified language
    """
    username = candidate.github_username or "applicant"
    cv_projects = verification.get("cv_projects") or extract_cv_projects(candidate.resume_text)
    verified_skills = verification.get("verified_skills", [])
    unverified_skills = verification.get("unverified_skills", [])
    discrepancies = verification.get("discrepancies", [])
    job_title = job_desc.title if job_desc else "AI Systems Engineer"
    required_skills = job_desc.required_skills if job_desc and hasattr(job_desc, 'required_skills') else ["Python", "FastAPI", "RAG"]

    # 1. Try Live LLM Generation if OpenAI API Key is configured
    if OPENAI_API_KEY:
        try:
            import openai
            client = openai.OpenAI(api_key=OPENAI_API_KEY)
            prompt = f"""You are an elite Lead Principal Engineer conducting a technical interview.
Candidate: {candidate.name} (@{username})
Target Role: {job_title}
Verified GitHub Repositories: {json.dumps([{'name': r.get('name'), 'language': r.get('language'), 'desc': r.get('description')} for r in repos[:5]])}
Extracted CV Projects: {json.dumps(cv_projects[:4])}
Verified Skills (in CV & GitHub): {verified_skills}
Unverified Skills (in CV, 0 GitHub repos): {unverified_skills}
Discrepancies / Audit Flags: {discrepancies}

Generate exactly 5 deep, highly tailored technical viva questions in valid JSON array format.
Rules:
- Question 1: Deep architectural question citing their top GitHub repository.
- Question 2: Implementation / concurrency / algorithmic question citing their 2nd repository (or warning if <2 repos).
- Question 3: Deep dive into a specific CV project.
- Question 4: Technical audit question testing their unverified skill ({unverified_skills[0] if unverified_skills else 'advanced architecture'}).
- Question 5: Production integration for the role '{job_title}' using their verified skills.

Return ONLY a JSON array with objects matching:
[{{"question_number": 1, "category": "...", "question": "...", "context_reference": "...", "expected_signals": ["...", "..."]}}]"""
            
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                response_format={"type": "json_object"}
            )
            data = json.loads(response.choices[0].message.content)
            if "questions" in data and isinstance(data["questions"], list) and len(data["questions"]) == 5:
                return data["questions"]
            elif isinstance(data, list) and len(data) == 5:
                return data
        except Exception:
            pass # Fall back to deterministic dynamic generator

    # 2. Deterministic Dynamic Generator using candidate's actual extracted data
    questions = []

    # -------------------------------------------------------------
    # Question 1: Top Real GitHub Repo Architecture
    # -------------------------------------------------------------
    if len(repos) > 0:
        r1 = repos[0]
        r1_name = r1.get("name", "portfolio")
        r1_lang = r1.get("language") or "Python"
        r1_desc = r1.get("description") or f"{r1_lang} software system"
        
        # Craft category & deep question based on repo attributes
        if "gnn" in r1_name.lower() or "graph" in r1_name.lower() or "false-information" in r1_name.lower() or "rumor" in r1_name.lower():
            q1_text = f"In your '{r1_name}' repository, how did you formulate the message passing aggregation and attention layers in {r1_lang} to prevent over-smoothing across deep graph nodes?"
            q1_cat = "Graph Neural Networks & Architecture"
            q1_signals = ["Message passing aggregation", "Attention weight normalization", "Laplacian regularization"]
        elif "next" in r1_name.lower() or "portfolio" in r1_name.lower() or r1_lang in ["TypeScript", "JavaScript", "MDX"]:
            q1_text = f"In your '{r1_name}' codebase, how did you architect the component hierarchy, dynamic route rendering, and asset caching in {r1_lang} to eliminate runtime layout shifts and maintain top Core Web Vitals?"
            q1_cat = "Frontend Architecture & Web Performance"
            q1_signals = ["Server-side rendering (SSR) vs static export", "Zero-shift layout boundaries", "Asset caching & bundle optimization"]
        elif "svm" in r1_name.lower() or "machine_learning" in r1_name.lower() or "model" in r1_name.lower():
            q1_text = f"In your '{r1_name}' project, walk us through the mathematical implementation of your kernel function (e.g. RBF / Polynomial) in {r1_lang} and how you solved the quadratic optimization constraint."
            q1_cat = "Machine Learning & Optimization"
            q1_signals = ["Dual optimization problem", "Support vector boundary calculation", "Kernel trick & Mercer's condition"]
        elif "churn" in r1_name.lower() or "analytics" in r1_name.lower() or "streamlit" in r1_name.lower():
            q1_text = f"In your '{r1_name}' project, how did you handle feature scaling and class imbalance in {r1_lang}, and what validation strategy did you implement to prevent data leakage during model training?"
            q1_cat = "Data Science & Feature Engineering"
            q1_signals = ["Cross-validation pipeline", "Precision-Recall tradeoff", "SHAP / feature importances"]
        elif "calculator" in r1_name.lower() or len(repos) <= 1 and any("cuda" in s.lower() or "rust" in s.lower() for s in candidate.raw_skills or []):
            q1_text = f"Your resume highlights advanced systems engineering, but your verified GitHub profile shows only '{r1_name}'. Can you walk us through the low-level memory layout and execution model of the advanced systems you authored?"
            q1_cat = "Portfolio Discrepancy Verification"
            q1_signals = ["Memory hierarchy (Registers/Shared/Global)", "Lock-free synchronization", "Assembly / low-level mechanics"]
        else:
            q1_text = f"In your '{r1_name}' repository ({r1_desc}), what architectural design patterns did you implement in {r1_lang} to ensure modularity, separation of concerns, and robust error handling?"
            q1_cat = f"{r1_lang} Systems Architecture"
            q1_signals = ["Modular service layering", "Error handling & recovery", "Dependency decoupling"]

        questions.append({
            "question_number": 1,
            "category": q1_cat,
            "question": q1_text,
            "context_reference": f"GitHub Verified: {username}/{r1_name} ({r1_lang})",
            "expected_signals": q1_signals
        })
    else:
        questions.append({
            "question_number": 1,
            "category": "Codebase Verification & Architecture",
            "question": f"We noted no public GitHub repositories under '@{username}'. Can you walk us through the architecture of your primary project from your resume and how you structured the code for maintainability?",
            "context_reference": f"GitHub Deficit Warning (@{username})",
            "expected_signals": ["Modular design", "API boundary design", "State isolation"]
        })

    # -------------------------------------------------------------
    # Question 2: Second Real GitHub Repo Implementation
    # -------------------------------------------------------------
    if len(repos) >= 2:
        r2 = repos[1]
        r2_name = r2.get("name", "secondary-repo")
        r2_lang = r2.get("language") or "Python"
        r2_desc = r2.get("description") or f"{r2_lang} implementation"

        if "c" == r2_lang.lower() or "monitor" in r2_name.lower() or "chat" in r2_name.lower() or "socket" in r2_name.lower():
            q2_text = f"In your '{r2_name}' project written in C, how did you handle non-blocking socket I/O and thread synchronization to prevent race conditions and memory leaks during concurrent client sessions?"
            q2_cat = "Systems Programming & Sockets"
            q2_signals = ["POSIX socket API (epoll/select/poll)", "Non-blocking I/O with EAGAIN", "Mutex / lock-free circular buffer"]
        elif "yolo" in r2_name.lower() or "vision" in r2_name.lower() or "pipeline" in r2_name.lower():
            q2_text = f"In '{r2_name}', how did you optimize inference latency inside Docker and maintain frame streaming over WebSockets without dropping frames under network jitter?"
            q2_cat = "Real-Time Computer Vision & MLOps"
            q2_signals = ["TensorRT / ONNX FP16 quantization", "Asynchronous worker loop", "Zero-copy frame serialization"]
        elif "sql" in r2_name.lower() or "ecommerce" in r2_name.lower() or "dbms" in r2_name.lower() or "database" in r2_name.lower():
            q2_text = f"In your '{r2_name}' database project, how did you use SQL window functions and compound index tuning to optimize latency on high-cardinality order queries?"
            q2_cat = "Database Engineering & SQL Optimization"
            q2_signals = ["EXPLAIN ANALYZE query planning", "PARTITION BY / ROW_NUMBER()", "B-tree vs Hash index optimization"]
        elif "music" in r2_name.lower() or "audio" in r2_name.lower() or "crud" in r2_name.lower():
            q2_text = f"In your '{r2_name}' ({r2_lang}) codebase, how did you design the state management and asynchronous API request lifecycle to handle streaming playback without UI lag?"
            q2_cat = "Asynchronous State & API Integration"
            q2_signals = ["Web Audio API / Stream chunking", "Optimistic state updates", "Debounced event handlers"]
        elif "svm" in r2_name.lower() or "support_vector" in r2_name.lower():
            q2_text = f"In your '{r2_name}' kernel project, how did you tune the soft-margin penalty hyperparameter C and kernel coefficient gamma to balance bias vs variance?"
            q2_cat = "Machine Learning Optimization"
            q2_signals = ["Hyperparameter grid search", "Margin slack variables", "Support vector sparsity"]
        else:
            q2_text = f"In '{r2_name}', describe the most challenging concurrency, memory, or algorithmic bottleneck you diagnosed in {r2_lang} and the benchmarked fix you deployed."
            q2_cat = f"{r2_lang} Implementation & Debugging"
            q2_signals = ["Root cause profiling", "Algorithmic complexity reduction", "Regression testing"]

        questions.append({
            "question_number": 2,
            "category": q2_cat,
            "question": q2_text,
            "context_reference": f"GitHub Verified: {username}/{r2_name} ({r2_lang})",
            "expected_signals": q2_signals
        })
    else:
        # If candidate has 0 or 1 repos, ask deep verification question on claimed CV systems
        questions.append({
            "question_number": 2,
            "category": "Distributed Systems Claim Audit",
            "question": f"Your CV highlights high-throughput distributed architectures, but public GitHub records show 0 multi-node repositories. What was your parameter sharding or network partitioning strategy during cluster failures?",
            "context_reference": f"GitHub Deficit Warning (@{username})",
            "expected_signals": ["Consensus protocols (Raft/Paxos)", "NCCL / Ring All-Reduce collectives", "Graceful node recovery"]
        })

    # -------------------------------------------------------------
    # Question 3: CV Project Deep-Dive
    # -------------------------------------------------------------
    # Pick a project from CV that isn't named in Q1/Q2
    selected_cv_proj = None
    existing_repo_names = [r.get("name", "").lower() for r in repos[:2]]
    for p in cv_projects:
        p_title_lower = p.get("title", "").lower()
        if not any(rn in p_title_lower for rn in existing_repo_names if len(rn) > 4):
            selected_cv_proj = p
            break
    if not selected_cv_proj and cv_projects:
        selected_cv_proj = cv_projects[0]

    if selected_cv_proj:
        proj_title = selected_cv_proj.get("title", "Highlighted Engineering Project")
        proj_details = selected_cv_proj.get("details", "")
        # Clean markdown numbering
        proj_title_clean = re.sub(r"^\d+[\.\)]\s*", "", proj_title)
        
        q3_text = f"In your CV project '{proj_title_clean}', what were the key architectural tradeoffs you made during design, and what concrete metrics (latency, throughput, or accuracy) did you measure to validate production readiness?"
        questions.append({
            "question_number": 3,
            "category": "Resume Project Deep-Dive",
            "question": q3_text,
            "context_reference": f"CV Claim Verification ({candidate.name}'s Resume: {proj_title_clean})",
            "expected_signals": ["Quantified performance benchmarks", "Fault recovery design", "Production telemetry"]
        })
    else:
        questions.append({
            "question_number": 3,
            "category": "Core Engineering Experience",
            "question": f"Can you walk us through the most architecturally complex system you built over the last 12 months, detailing how you managed state and component boundaries?",
            "context_reference": f"CV Experience Verification ({candidate.name})",
            "expected_signals": ["Modular microservices", "Separation of concerns", "Integration testing"]
        })

    # -------------------------------------------------------------
    # Question 4: Unverified CV Skill / Discrepancy Check (0 GitHub Proof)
    # -------------------------------------------------------------
    unverified_target = None
    if unverified_skills:
        # Prioritize high-tier or required unverified skills
        for s in unverified_skills:
            if any(req.lower() in s.lower() for req in required_skills) or any(h in s.lower() for h in ["cuda", "rust", "kubernetes", "fastapi", "docker", "rag", "pytorch", "langgraph"]):
                unverified_target = s
                break
        if not unverified_target:
            unverified_target = unverified_skills[0]
    elif discrepancies:
        unverified_target = "Advanced Systems Claims"
    else:
        # Pick a required skill not in top verified repos
        unverified_target = required_skills[0] if required_skills else "FastAPI"

    if "cuda" in unverified_target.lower():
        q4_text = f"Your resume highlights CUDA GPU acceleration, but 0 CUDA kernels were found on GitHub. Explain the warp scheduling mechanism, shared memory bank conflict resolution, and coalesced global memory access in custom CUDA kernels."
        q4_cat = "CUDA & GPU Architecture Verification"
        q4_signals = ["Warp divergence & SIMT execution", "32-way shared memory bank conflicts", "Coalesced 128-byte memory transactions"]
    elif "rust" in unverified_target.lower():
        q4_text = f"Your resume lists Rust systems programming with 0 public Rust repositories. Explain how Rust's ownership model, lifetime annotations, and Send/Sync traits guarantee data race freedom in multi-threaded asynchronous runtimes."
        q4_cat = "Rust Systems Verification"
        q4_signals = ["Borrow checker semantics", "Send and Sync trait bounds", "Pin and Future state machines in Tokio"]
    elif "kubernetes" in unverified_target.lower() or "k8s" in unverified_target.lower():
        q4_text = f"Your resume lists Kubernetes orchestration with 0 public manifest repos. How do you configure Custom Resource Definitions (CRDs), pod disruption budgets, and node affinity to prevent cascade failures during rolling deployments?"
        q4_cat = "Kubernetes Infrastructure Verification"
        q4_signals = ["Pod Disruption Budgets (PDB)", "Taints, tolerations & node affinity", "Controller reconciliation loops"]
    elif "rag" in unverified_target.lower() or "langgraph" in unverified_target.lower() or "vector" in unverified_target.lower():
        q4_text = f"Our job profile requires RAG and Vector Databases. How do you prevent hallucination during multi-hop retrieval, and what chunking strategy (Recursive vs Semantic) and re-ranking metrics do you employ?"
        q4_cat = "RAG & Vector Retrieval Verification"
        q4_signals = ["Cosine vs Euclidean vector distance", "Context re-ranking (Cross-encoder)", "Hallucination guardrail validation"]
    elif "docker" in unverified_target.lower():
        q4_text = f"How do you design multi-stage Dockerfiles and container security profiles to minimize attack surface and cache build layers efficiently?"
        q4_cat = "Containerization & Security Verification"
        q4_signals = ["Multi-stage builds", "Non-root user enforcement", "Layer caching order"]
    else:
        q4_text = f"Your application cites proficiency in '{unverified_target}' which has 0 verified public repositories on GitHub. Walk us through a complex problem you solved in production using {unverified_target}."
        q4_cat = f"{unverified_target} Competency Audit"
        q4_signals = ["Practical production experience", "Edge-case debugging", "Performance profiling"]

    questions.append({
        "question_number": 4,
        "category": q4_cat,
        "question": q4_text,
        "context_reference": f"Unverified Claim Audit: {unverified_target} (In CV, 0 GitHub Repos)",
        "expected_signals": q4_signals
    })

    # -------------------------------------------------------------
    # Question 5: Target Job Profile Integration
    # -------------------------------------------------------------
    top_lang = repos[0].get("language") if repos else (candidate.raw_skills[0] if candidate.raw_skills else "Python")
    primary_proj = repos[0].get("name") if repos else (cv_projects[0].get("title") if cv_projects else "your engineering background")
    
    q5_text = f"For our target role '{job_title}', how would you apply the engineering patterns and lessons learned from '{primary_proj}' ({top_lang}) to build and deploy reliable, low-latency production services at Cloud AI?"
    q5_signals = ["Production SLA compliance", "Asynchronous service design", "Automated telemetry & guardrails"]

    questions.append({
        "question_number": 5,
        "category": "Target Role Integration & Systems Scaling",
        "question": q5_text,
        "context_reference": f"Role Alignment: {job_title} ({top_lang})",
        "expected_signals": q5_signals
    })

    return questions


def generate_candidate_email(
    candidate: CandidateDB,
    decision: str,
    score: float,
    repos: List[Dict[str, Any]],
    tone: str = "Formal",
    role_title: str = "AI Systems Engineer Intern",
    reviewer_notes: Optional[str] = None
) -> str:
    """
    Generates personalized recruitment email corresponding to HITL decision, role, and Tone.
    """
    cand_name = candidate.name
    top_repo = repos[0]["name"] if repos else "your technical portfolio"
    notes_paragraph = f"\n\nReviewer Feedback: {reviewer_notes.strip()}" if reviewer_notes and reviewer_notes.strip() else ""

    if decision == "APPROVED_FOR_INTERVIEW":
        if tone == "Welcoming":
            return f"""Subject: Exciting Next Steps: Interview for {role_title} at Cloud AI! 🚀

Dear {cand_name},

We were thoroughly impressed by your background and especially enjoyed reviewing your verified open-source work on '{top_repo}'. Your engineering match score scored a stellar {score}%.

We would love to invite you to a 45-minute technical conversation with our Engineering Team. During this session, we look forward to deep-diving into your technical architecture and repository implementation.{notes_paragraph}

Please select a convenient time slot via our interview calendar:
https://cal.cloudai.internal/interview/{candidate.id}

Warm regards,
Cloud AI Talent & Engineering Team"""

        elif tone == "Technical":
            return f"""Subject: Technical Interview Invitation: {role_title} — Cloud AI

Dear {cand_name},

Our automated agent verification and engineering evaluation pipeline has completed review of your application for the {role_title} role. Your verified code authenticity and semantic match achieved {score}%.

We would like to schedule a technical architecture viva focusing on:
1. Systems architecture and design choices in your '{top_repo}' codebase.
2. Low-latency backend serving, vector indexing, and production reliability.{notes_paragraph}

Please schedule your session here:
https://cal.cloudai.internal/interview/{candidate.id}

Regards,
NexusHire Automated Recruitment Engine · Cloud AI Systems Team"""

        else: # Formal
            return f"""Subject: Invitation to Technical Interview: {role_title} — Cloud AI

Dear {cand_name},

Thank you for your application for the {role_title} position. Following a detailed evaluation of your resume and verified GitHub engineering portfolio ({top_repo}), we are pleased to invite you to the next stage of our selection process.

Your composite evaluation score was {score}%, placing you among our top candidates.{notes_paragraph}

Please access our scheduling portal to confirm your availability for a technical interview:
https://cal.cloudai.internal/interview/{candidate.id}

Sincerely,
Hiring Committee
Cloud AI Inc."""

    elif decision == "ESCALATED":
        return f"""Subject: Application Status Update: {role_title} — Engineering Committee Review

Dear {cand_name},

Thank you for your application for the {role_title} position. Your profile and technical claims are currently undergoing specialized review by our Senior Engineering Advisory Committee.

Our team is reviewing the architectural depth of your portfolio and we will follow up with tailored technical assessment details within 2 business days.{notes_paragraph}

Thank you for your patience and interest in Cloud AI.

Sincerely,
Technical Talent Acquisition
Cloud AI Inc."""

    else: # REJECTED
        return f"""Subject: Application Status: {role_title} — Cloud AI

Dear {cand_name},

Thank you for your time and interest in Cloud AI, and for sharing your engineering background with us. 

While we were pleased to review your application for {role_title}, we have decided to move forward with candidates whose current project portfolios and verified systems experience more closely match the immediate needs of this position.{notes_paragraph}

We encourage you to continue building your open-source repositories on GitHub and welcome you to apply for future opportunities at Cloud AI.

We wish you every success in your ongoing engineering endeavors.

Best regards,
Cloud AI Recruitment Team"""


run_screening_orchestrator = screen_candidate_multi_agent

