import re
import io
from typing import Dict, Any, List, Optional, Tuple
from pypdf import PdfReader
from sqlalchemy.orm import Session
from app.models import CandidateDB, EtlReportDB
from app.guardrails import EMAIL_REGEX, PHONE_REGEX

GITHUB_REGEX = re.compile(r'(?:github\.com/|@)([a-zA-Z0-9_-]{2,38})\b')

KNOWN_TECH_KEYWORDS = [
    "Python", "FastAPI", "Retrieval-Augmented Generation (RAG)", "RAG", "LangChain", 
    "LangGraph", "PyTorch", "Deep Learning", "Vector Databases", "ChromaDB", "FAISS", 
    "Docker", "React", "Vite", "Kubernetes", "Rust", "CUDA", "Distributed Training", 
    "Graph Neural Networks (GNN)", "GCN", "GAT", "C", "C++", "SQL", "Streamlit", 
    "PostgreSQL", "SQLite", "Redis", "TypeScript", "JavaScript", "AWS", "Machine Learning"
]

def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extracts raw text from PDF bytes using pypdf."""
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        extracted_pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                extracted_pages.append(text)
        return "\n\n".join(extracted_pages)
    except Exception as e:
        # Fallback to UTF-8 decoding with replacement
        return file_bytes.decode("utf-8", errors="replace")


def clean_and_normalize_text(raw_text: str) -> str:
    """Cleans control characters, excessive blank lines, and normalizes whitespaces."""
    text = re.sub(r'[\r\t]', ' ', raw_text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'[ ]{2,}', ' ', text)
    return text.strip()


def extract_candidate_metadata(text: str) -> Dict[str, Any]:
    """
    Heuristically extracts key candidate fields: Name, Email, Phone, GitHub Handle, Skills.
    """
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    
    # 1. Candidate Name (usually top line)
    name = "Candidate"
    if lines:
        first_line = lines[0]
        # Avoid picking header words as name
        if not any(k in first_line.lower() for k in ["resume", "curriculum", "cv", "profile", "page"]):
            name = first_line[:50]
        elif len(lines) > 1:
            name = lines[1][:50]

    # 2. Email
    emails = EMAIL_REGEX.findall(text)
    email = emails[0] if emails else None

    # 3. Phone
    phones = PHONE_REGEX.findall(text)
    phone = phones[0][0] if phones and isinstance(phones[0], tuple) else (phones[0] if phones else None)

    # 4. GitHub Handle
    github_matches = GITHUB_REGEX.findall(text)
    # Filter out common false positives
    valid_githubs = [g for g in github_matches if g.lower() not in ["profile", "repos", "repositories", "com", "github"]]
    github_username = valid_githubs[0] if valid_githubs else None

    # 5. Extract Skills
    found_skills = []
    text_lower = text.lower()
    for skill in KNOWN_TECH_KEYWORDS:
        # Check boundary or direct occurrence
        pattern = r'\b' + re.escape(skill.lower()) + r'\b'
        if re.search(pattern, text_lower):
            found_skills.append(skill)
            
    # Estimate years of experience from numbers or keywords
    years_exp = 1.0
    exp_matches = re.findall(r'(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s*(?:of)?\s*experience', text_lower)
    if exp_matches:
        try:
            years_exp = float(exp_matches[0])
        except ValueError:
            years_exp = 2.0

    return {
        "name": name,
        "email": email,
        "phone": phone,
        "github_username": github_username,
        "skills": list(set(found_skills)),
        "years_experience": years_exp
    }


def check_duplicate_candidate(db: Session, email: Optional[str], name: str, github: Optional[str]) -> Optional[CandidateDB]:
    """Checks if candidate already exists in the database by email, github, or exact name."""
    query = db.query(CandidateDB)
    if email:
        existing = query.filter(CandidateDB.email == email).first()
        if existing:
            return existing
    if github:
        existing = query.filter(CandidateDB.github_username == github).first()
        if existing:
            return existing
    existing = query.filter(CandidateDB.name == name).first()
    return existing


def process_resume_etl(
    db: Session,
    raw_content: str,
    filename: Optional[str] = "manual_entry.txt",
    allow_update_duplicate: bool = True
) -> Dict[str, Any]:
    """
    Executes Module 3 ETL Pipeline:
    - Text normalization
    - Field extraction & schema validation
    - Duplicate detection
    - DB record persistence
    - Quality score computation
    """
    cleaned_text = clean_and_normalize_text(raw_content)
    meta = extract_candidate_metadata(cleaned_text)
    
    # Missing fields validation
    missing_fields = []
    if not meta["email"]:
        missing_fields.append("email")
    if not meta["phone"]:
        missing_fields.append("phone")
    if not meta["github_username"]:
        missing_fields.append("github_username")
    if not meta["skills"]:
        missing_fields.append("skills")

    word_count = len(cleaned_text.split())
    data_quality_score = max(0, 100 - (len(missing_fields) * 15))
    if word_count < 50:
        data_quality_score -= 30
        
    # Check duplicates
    existing_candidate = check_duplicate_candidate(
        db, meta["email"], meta["name"], meta["github_username"]
    )
    
    is_duplicate = existing_candidate is not None
    candidate_id = None
    
    if is_duplicate and allow_update_duplicate:
        # Update existing record
        existing_candidate.resume_text = cleaned_text
        existing_candidate.raw_skills = meta["skills"]
        existing_candidate.years_experience = meta["years_experience"]
        if meta["github_username"]:
            existing_candidate.github_username = meta["github_username"]
        db.commit()
        db.refresh(existing_candidate)
        candidate_id = existing_candidate.id
    elif not is_duplicate:
        new_cand = CandidateDB(
            name=meta["name"],
            email=meta["email"],
            phone=meta["phone"],
            github_username=meta["github_username"],
            resume_text=cleaned_text,
            raw_skills=meta["skills"],
            years_experience=meta["years_experience"],
            workflow_status="PENDING_HR_REVIEW"
        )
        db.add(new_cand)
        db.commit()
        db.refresh(new_cand)
        candidate_id = new_cand.id
    else:
        candidate_id = existing_candidate.id

    # Create ETL Audit Report
    etl_report = EtlReportDB(
        filename=filename,
        total_candidates_processed=1,
        duplicates_filtered=1 if is_duplicate else 0,
        pii_redactions_count=0,
        status="SUCCESS" if data_quality_score >= 50 else "WARNING_LOW_QUALITY",
        details={
            "candidate_id": candidate_id,
            "candidate_name": meta["name"],
            "word_count": word_count,
            "missing_fields": missing_fields,
            "extracted_skills_count": len(meta["skills"]),
            "data_quality_score": data_quality_score,
            "is_duplicate": is_duplicate
        }
    )
    db.add(etl_report)
    db.commit()

    return {
        "candidate_id": candidate_id,
        "name": meta["name"],
        "email": meta["email"],
        "github_username": meta["github_username"],
        "extracted_skills": meta["skills"],
        "word_count": word_count,
        "data_quality_score": data_quality_score,
        "missing_fields": missing_fields,
        "is_duplicate": is_duplicate,
        "status": "VALIDATED"
    }
