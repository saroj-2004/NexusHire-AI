from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, Boolean, JSON
from pydantic import BaseModel, Field
from app.database import Base

# ================= SQLAlchemy ORM Models =================

class CandidateDB(Base):
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    phone = Column(String(100), nullable=True)
    github_username = Column(String(255), nullable=True)
    resume_text = Column(Text, nullable=False)
    raw_skills = Column(JSON, default=list)
    years_experience = Column(Float, default=0.0)
    workflow_status = Column(String(100), default="PENDING_HR_REVIEW") # PENDING_HR_REVIEW, APPROVED_FOR_INTERVIEW, ESCALATED, REJECTED, BLOCKED_BY_GUARDRAIL
    verified_match_score = Column(Float, default=0.0)
    rag_score = Column(Float, default=0.0)
    github_score = Column(Float, default=0.0)
    hallucination_risk = Column(String(50), default="LOW") # LOW, MEDIUM, HIGH
    viva_questions = Column(JSON, default=list)
    claim_vs_proof = Column(JSON, default=list)
    email_draft = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JobDescriptionDB(Base):
    __tablename__ = "job_descriptions"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    company = Column(String(255), default="Cloud AI Inc.")
    description = Column(Text, nullable=False)
    required_skills = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)


class AuditLogDB(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    candidate_id = Column(Integer, nullable=True)
    candidate_name = Column(String(255), nullable=True)
    workflow_step = Column(String(100), nullable=False)
    guardrail_status = Column(String(50), nullable=False) # PASSED, BLOCKED, WARNING
    details = Column(Text, nullable=True)
    confidence_score = Column(Float, default=1.0)
    hallucination_risk = Column(String(50), default="LOW")
    latency_ms = Column(Float, default=0.0)
    source_chunks = Column(JSON, default=list)


class EtlReportDB(Base):
    __tablename__ = "etl_reports"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    filename = Column(String(255), nullable=True)
    total_candidates_processed = Column(Integer, default=0)
    duplicates_filtered = Column(Integer, default=0)
    pii_redactions_count = Column(Integer, default=0)
    status = Column(String(50), default="SUCCESS")
    details = Column(JSON, default=dict)


# ================= Pydantic Schemas =================

class ClaimProofItem(BaseModel):
    claimed_skill: str
    verified: bool
    status: str # "VERIFIED", "PARTIALLY_VERIFIED", "UNVERIFIED", "UNVERIFIED_EXAGGERATION", "GITHUB_PROVEN", "MISSING"
    in_cv: bool = True
    in_github: bool = False
    evidence_repo: Optional[str] = None
    repo_language: Optional[str] = None
    stars: int = 0
    notes: Optional[str] = None


class VivaQuestion(BaseModel):
    question_number: int
    category: str # "Architecture", "Deep Learning", "Concurrency", "RAG & Vector DB", "System Design"
    question: str
    context_reference: str
    expected_signals: List[str]


class AgentStepTrace(BaseModel):
    step_number: int
    step_name: str # e.g. "ETL & Guardrail Scan", "RAG Semantic Retrieval", "GitHub API Verification", "Reflection & Viva Generator", "Governance Audit Logger"
    status: str # "COMPLETED", "FAILED", "BLOCKED"
    latency_ms: float
    output_summary: str
    data: Optional[Dict[str, Any]] = None


class ScreeningRequest(BaseModel):
    job_title: Optional[str] = None
    company: Optional[str] = None
    job_description: Optional[str] = None
    required_skills: Optional[List[str]] = None


class CandidateScreeningResponse(BaseModel):
    candidate_id: int
    candidate_name: str
    workflow_status: str
    guardrail_status: str
    rag_score: float
    github_score: float
    verified_match_score: float
    hallucination_risk: str
    claim_vs_proof: List[ClaimProofItem]
    viva_questions: List[VivaQuestion]
    retrieved_chunks: List[Dict[str, Any]]
    agent_traces: List[AgentStepTrace]
    email_draft: Optional[str] = None
    total_latency_ms: float


class CandidateCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    github_username: Optional[str] = None
    resume_text: str
    raw_skills: Optional[List[str]] = None
    years_experience: Optional[float] = 1.0


class CandidateResponse(BaseModel):
    id: int
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    github_username: Optional[str] = None
    resume_text: str
    raw_skills: List[str] = []
    years_experience: float = 0.0
    workflow_status: str
    verified_match_score: float = 0.0
    rag_score: float = 0.0
    github_score: float = 0.0
    hallucination_risk: str = "LOW"
    viva_questions: List[Any] = []
    claim_vs_proof: List[Any] = []
    email_draft: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class JobDescriptionResponse(BaseModel):
    id: int
    title: str
    company: str
    description: str
    required_skills: List[str]

    class Config:
        from_attributes = True


class GuardrailScanRequest(BaseModel):
    text: str
    context: Optional[str] = "resume_screening"


class GuardrailScanResponse(BaseModel):
    sanitized_text: str
    is_safe: bool
    status: str # "PASSED" or "BLOCKED_BY_GUARDRAIL"
    pii_redacted_count: int
    pii_types_detected: List[str]
    attack_detected: bool
    attack_category: Optional[str] = None
    attack_pattern: Optional[str] = None
    explanation: str


class HitlDecisionRequest(BaseModel):
    candidate_id: int
    decision: str # "APPROVED_FOR_INTERVIEW", "ESCALATED", "REJECTED"
    tone: Optional[str] = "Formal" # "Formal", "Welcoming", "Technical"
    reviewer_notes: Optional[str] = None
    notes: Optional[str] = None


class HitlDecisionResponse(BaseModel):
    candidate_id: int
    candidate_name: str
    new_status: str
    status: str
    email_subject: str
    email_body: str
    timestamp: datetime


class ChunkingBenchmarkStrategyResult(BaseModel):
    strategy_name: str
    chunk_count: int
    avg_chunk_length_chars: int
    retrieval_accuracy: float # percentage 0-100
    context_precision: float # percentage 0-100
    hallucination_rate: float # percentage 0-100
    avg_latency_ms: float
    pros: str
    cons: str
    sample_chunks: List[Dict[str, Any]]


class ChunkingBenchmarkResponse(BaseModel):
    benchmark_timestamp: datetime
    test_query: str
    strategies: List[ChunkingBenchmarkStrategyResult]
    recommendation: str


class AuditLogResponse(BaseModel):
    id: int
    timestamp: datetime
    candidate_id: Optional[int]
    candidate_name: Optional[str]
    workflow_step: str
    guardrail_status: str
    details: Optional[str]
    confidence_score: float
    hallucination_risk: str
    latency_ms: float
    source_chunks: Optional[List[Any]] = []

    class Config:
        from_attributes = True
