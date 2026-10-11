import io
import csv
from contextlib import asynccontextmanager
from typing import List, Optional
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.database import init_db, get_db, SessionLocal
from app.models import (
    CandidateDB, JobDescriptionDB, AuditLogDB,
    CandidateResponse, CandidateCreate, CandidateScreeningResponse,
    JobDescriptionResponse, GuardrailScanRequest, GuardrailScanResponse,
    HitlDecisionRequest, HitlDecisionResponse, ChunkingBenchmarkResponse,
    AuditLogResponse, ScreeningRequest
)
from app.seed_data import seed_database_and_vector_store
from app.etl_pipeline import process_resume_etl, extract_text_from_pdf
from app.guardrails import execute_guardrail_shield
from app.agents import run_screening_orchestrator, generate_candidate_email
from app.rag_engine import evaluate_chunking_benchmark
from app.github_tool import fetch_github_repositories

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize tables and seed demo data
    init_db()
    db = SessionLocal()
    try:
        seed_database_and_vector_store(db)
    finally:
        db.close()
    yield

app = FastAPI(
    title="NexusHire AI API",
    description="Autonomous Multi-Agent Technical Recruitment, RAG & GitHub Verification System",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ================= Health & Meta Endpoints =================

@app.get("/api/health")
def get_system_health(db: Session = Depends(get_db)):
    candidate_count = db.query(CandidateDB).count()
    audit_count = db.query(AuditLogDB).count()
    return {
        "status": "ONLINE",
        "service": "NexusHire AI Multi-Agent Backend",
        "vector_engine": "Hybrid Vector Store & ChromaDB Bridge Active",
        "guardrails": "Enforced (PII Redaction + Injection Shield)",
        "total_candidates": candidate_count,
        "total_audit_logs": audit_count
    }


# ================= Job Descriptions =================

@app.get("/api/job-descriptions", response_model=List[JobDescriptionResponse])
def get_job_descriptions(db: Session = Depends(get_db)):
    jds = db.query(JobDescriptionDB).all()
    return jds


@app.put("/api/job-descriptions/{jd_id}", response_model=JobDescriptionResponse)
def update_job_description(jd_id: int, payload: dict, db: Session = Depends(get_db)):
    jd = db.query(JobDescriptionDB).filter(JobDescriptionDB.id == jd_id).first()
    if not jd:
        raise HTTPException(status_code=404, detail="Job Description not found")
    
    if "title" in payload:
        jd.title = payload["title"]
    if "description" in payload:
        jd.description = payload["description"]
    if "required_skills" in payload:
        jd.required_skills = payload["required_skills"]
        
    db.commit()
    db.refresh(jd)
    return jd


# ================= Module 3: ETL & Candidate Management =================

@app.post("/api/etl/extract-skills")
def extract_skills_endpoint(payload: dict):
    text = payload.get("text", "")
    from app.etl_pipeline import KNOWN_TECH_KEYWORDS
    import re
    found = []
    text_lower = text.lower()
    for skill in KNOWN_TECH_KEYWORDS:
        pattern = r'\b' + re.escape(skill.lower()) + r'\b'
        if re.search(pattern, text_lower):
            found.append(skill)
    return {"skills": list(set(found))}


@app.get("/api/candidates", response_model=List[CandidateResponse])
def list_candidates(db: Session = Depends(get_db)):
    candidates = db.query(CandidateDB).order_by(CandidateDB.id.asc()).all()
    return candidates


@app.get("/api/candidates/{candidate_id}", response_model=CandidateResponse)
def get_candidate(candidate_id: int, db: Session = Depends(get_db)):
    cand = db.query(CandidateDB).filter(CandidateDB.id == candidate_id).first()
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return cand


@app.post("/api/candidates", response_model=CandidateResponse)
def create_candidate(candidate_in: CandidateCreate, db: Session = Depends(get_db)):
    # Run ETL Pipeline
    etl_result = process_resume_etl(
        db=db,
        raw_content=candidate_in.resume_text,
        filename="manual_submission.txt"
    )
    cand = db.query(CandidateDB).filter(CandidateDB.id == etl_result["candidate_id"]).first()
    if candidate_in.name and candidate_in.name != "Candidate":
        cand.name = candidate_in.name
    if candidate_in.email:
        cand.email = candidate_in.email
    if candidate_in.github_username:
        cand.github_username = candidate_in.github_username
    if candidate_in.raw_skills:
        cand.raw_skills = candidate_in.raw_skills
    db.commit()
    db.refresh(cand)
    return cand


@app.delete("/api/candidates/{candidate_id}")
def delete_candidate(candidate_id: int, db: Session = Depends(get_db)):
    cand = db.query(CandidateDB).filter(CandidateDB.id == candidate_id).first()
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    cand_name = cand.name
    db.delete(cand)
    
    audit_entry = AuditLogDB(
        candidate_id=None,
        candidate_name=cand_name,
        workflow_step="Candidate Management",
        guardrail_status="PASSED",
        details=f"Candidate ID {candidate_id} ('{cand_name}') deleted from database.",
        confidence_score=1.0,
        hallucination_risk="NONE",
        latency_ms=1.0,
        source_chunks=[]
    )
    db.add(audit_entry)
    db.commit()
    return {"success": True, "message": f"Candidate '{cand_name}' deleted successfully", "deleted_id": candidate_id}


@app.post("/api/candidates/reset-demo")
def reset_demo_candidates(db: Session = Depends(get_db)):
    db.query(CandidateDB).delete()
    db.commit()
    seed_database_and_vector_store(db)
    candidates = db.query(CandidateDB).order_by(CandidateDB.id.asc()).all()
    return {"success": True, "message": "Demo candidates reset to default seed", "candidates": candidates}


@app.post("/api/etl/upload-resume")
async def upload_resume(
    file: Optional[UploadFile] = File(None),
    raw_text: Optional[str] = Form(None),
    candidate_name: Optional[str] = Form(None),
    github_username: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Module 3 ETL Endpoint:
    Accepts PDF or text file upload, extracts text, runs data quality checks and saves candidate.
    """
    extracted_text = ""
    filename = "pasted_text.txt"
    
    if file:
        filename = file.filename
        content_bytes = await file.read()
        if filename.lower().endswith(".pdf"):
            extracted_text = extract_text_from_pdf(content_bytes)
        else:
            extracted_text = content_bytes.decode("utf-8", errors="replace")
    elif raw_text:
        extracted_text = raw_text
    else:
        raise HTTPException(status_code=400, detail="Either a file or raw_text must be provided")

    if not extracted_text.strip():
        raise HTTPException(status_code=400, detail="Extracted text is empty or invalid format")

    etl_result = process_resume_etl(
        db=db,
        raw_content=extracted_text,
        filename=filename
    )

    # Optional manual overrides
    cand = db.query(CandidateDB).filter(CandidateDB.id == etl_result["candidate_id"]).first()
    if candidate_name and candidate_name.strip():
        cand.name = candidate_name.strip()
    if github_username and github_username.strip():
        cand.github_username = github_username.strip()
    db.commit()
    db.refresh(cand)

    return {
        "message": "Resume successfully processed by ETL Pipeline",
        "candidate": cand,
        "etl_report": etl_result
    }


# ================= Module 8: Trust, Governance & Guardrails =================

@app.post("/api/guardrails/scan", response_model=GuardrailScanResponse)
def scan_guardrail(payload: GuardrailScanRequest, db: Session = Depends(get_db)):
    """
    Module 8 Endpoint:
    Scans input text for PII and adversarial prompt injections.
    Logs high-severity threats to the audit table.
    """
    result = execute_guardrail_shield(payload.text)
    
    # If injection detected, log to audit_logs
    if not result["is_safe"]:
        audit_entry = AuditLogDB(
            candidate_id=None,
            candidate_name="Sandbox User / Unverified Query",
            workflow_step="Module 8: Security Shield Sandbox",
            guardrail_status="BLOCKED",
            details=f"Attack Intercepted: {result['attack_category']} - Signature: '{result['attack_pattern']}'",
            confidence_score=1.0,
            hallucination_risk="CRITICAL_ADVERSARIAL_ATTACK",
            latency_ms=1.2,
            source_chunks=[{"attack_category": result["attack_category"]}]
        )
        db.add(audit_entry)
        db.commit()

    return result


@app.get("/api/governance/audit-logs", response_model=List[AuditLogResponse])
def get_audit_logs(db: Session = Depends(get_db)):
    logs = db.query(AuditLogDB).order_by(AuditLogDB.timestamp.desc()).limit(100).all()
    return logs


@app.get("/api/governance/audit-logs/export-csv")
def export_audit_logs_csv(db: Session = Depends(get_db)):
    """Exports audit logs as a downloadable CSV."""
    logs = db.query(AuditLogDB).order_by(AuditLogDB.timestamp.desc()).all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Timestamp (UTC)", "Candidate ID", "Candidate Name", 
        "Workflow Step", "Guardrail Status", "Details", "Confidence Score", 
        "Hallucination Risk", "Latency (ms)"
    ])
    
    for l in logs:
        writer.writerow([
            l.id,
            l.timestamp.isoformat() if l.timestamp else "",
            l.candidate_id or "N/A",
            l.candidate_name or "N/A",
            l.workflow_step,
            l.guardrail_status,
            l.details or "",
            l.confidence_score,
            l.hallucination_risk,
            l.latency_ms
        ])
        
    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=nexushire_governance_audit.csv"}
    )


# ================= Modules 4, 5, 6, 7: Agentic Screening =================

@app.post("/api/agents/screen-candidate/{candidate_id}", response_model=CandidateScreeningResponse)
async def screen_candidate(
    candidate_id: int, 
    payload: Optional[ScreeningRequest] = None, 
    db: Session = Depends(get_db)
):
    """
    Executes the 5-Agent Multi-Agent Verification Pipeline on the selected candidate
    against the active or custom edited Job Description.
    """
    cand = db.query(CandidateDB).filter(CandidateDB.id == candidate_id).first()
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    jd = db.query(JobDescriptionDB).first()
    if not jd:
        jd = JobDescriptionDB(
            title="AI Systems Engineer Intern",
            company="Cloud AI Inc.",
            description="Cloud AI is seeking an AI Systems Engineer Intern.",
            required_skills=["Python", "FastAPI", "RAG"]
        )
        db.add(jd)
        db.commit()
        db.refresh(jd)

    # If dynamic custom payload passed from frontend
    if payload:
        if payload.job_title:
            jd.title = payload.job_title
        if payload.company:
            jd.company = payload.company
        if payload.job_description:
            jd.description = payload.job_description
        if payload.required_skills is not None:
            jd.required_skills = payload.required_skills
        db.commit()
        db.refresh(jd)

    result = await run_screening_orchestrator(candidate=cand, job_desc=jd, db=db)
    return result


# ================= Module 2 & 7: Human-in-the-Loop & Email Generator =================

@app.post("/api/workflow/hitl-decision", response_model=HitlDecisionResponse)
async def submit_hitl_decision(payload: HitlDecisionRequest, db: Session = Depends(get_db)):
    """
    Human-in-the-Loop Decision Endpoint:
    Updates workflow state and dynamically synthesizes personalized emails based on tone.
    """
    cand = db.query(CandidateDB).filter(CandidateDB.id == payload.candidate_id).first()
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")

    cand.workflow_status = payload.decision
    
    # Fetch repos for personalization
    repos, _ = await fetch_github_repositories(cand.github_username or "")
    
    # Fetch active job description
    jd = db.query(JobDescriptionDB).first()
    role_title = jd.title if jd else "AI Systems Engineer Intern at Cloud AI"
    notes = payload.reviewer_notes or payload.notes or ""

    email_text = generate_candidate_email(
        candidate=cand,
        decision=payload.decision,
        score=cand.verified_match_score,
        repos=repos,
        tone=payload.tone or "Formal",
        role_title=role_title,
        reviewer_notes=notes
    )
    cand.email_draft = email_text
    
    # Log audit entry for HITL decision
    audit_entry = AuditLogDB(
        candidate_id=cand.id,
        candidate_name=cand.name,
        workflow_step="HITL Human-in-the-Loop Review",
        guardrail_status="PASSED",
        details=f"Recruiter Decision: {payload.decision} (Tone: {payload.tone}). Reviewer Note: {notes or 'None'}",
        confidence_score=1.0,
        hallucination_risk="NONE",
        latency_ms=4.5,
        source_chunks=[]
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(cand)

    subject_line = "Recruitment Status Update"
    if "Subject: " in email_text:
        lines = email_text.split("\n")
        subject_line = lines[0].replace("Subject: ", "").strip()
        email_body = "\n".join(lines[1:]).strip()
    else:
        email_body = email_text

    status_label_map = {
        "APPROVED_FOR_INTERVIEW": "Approved for Interview",
        "ESCALATED": "Escalated to Lead",
        "REJECTED": "Rejected",
        "PENDING_REVIEW": "Pending Review",
        "FLAGGED_DISCREPANCY": "Flagged Discrepancy"
    }
    status_label = status_label_map.get(cand.workflow_status, cand.workflow_status)

    return {
        "candidate_id": cand.id,
        "candidate_name": cand.name,
        "new_status": cand.workflow_status,
        "status": status_label,
        "email_subject": subject_line,
        "email_body": email_body,
        "timestamp": datetime.utcnow()
    }


# ================= Module 5 & 9: RAG Chunking Benchmark =================

@app.get("/api/rag/chunking-benchmark", response_model=ChunkingBenchmarkResponse)
def get_chunking_benchmark(db: Session = Depends(get_db)):
    """
    Module 5 & 9 RAG Evaluation Endpoint:
    Runs live benchmark across Fixed-Size, Recursive, and Semantic Chunking strategies.
    """
    sample_candidate = db.query(CandidateDB).filter(CandidateDB.name == "Saroj Rawal").first()
    if not sample_candidate:
        sample_candidate = db.query(CandidateDB).first()
        
    jd = db.query(JobDescriptionDB).first()
    query = jd.description if jd else "AI Systems Engineer Intern required skills Python FastAPI RAG PyTorch ChromaDB React"
    sample_text = sample_candidate.resume_text if sample_candidate else "Default resume text for benchmarking."

    benchmark_data = evaluate_chunking_benchmark(sample_text=sample_text, query=query)
    return benchmark_data
