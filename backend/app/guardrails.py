import re
from typing import Dict, Any, List, Tuple

# Regex patterns for PII detection
EMAIL_REGEX = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
PHONE_REGEX = re.compile(r'(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b')
SSN_REGEX = re.compile(r'\b\d{3}-\d{2}-\d{4}\b')

# Adversarial Prompt Injection Heuristics & Signatures
INJECTION_PATTERNS: List[Dict[str, Any]] = [
    {
        "category": "System Override Attempt",
        "pattern": r'(?i)\b(system\s*override|override\s*system|ignore\s+(all\s+)?(previous|prior)\s+instructions|disregard\s+(all\s+)?(instructions|rules|prompts)|forget\s+(all\s+)?rules)\b',
        "severity": "HIGH",
        "explanation": "Detected explicit command attempting to discard agent system instructions and override execution policies."
    },
    {
        "category": "Evaluation Tampering",
        "pattern": r'(?i)\b(rank\s+(this\s+)?candidate\s+#?1|100%\s+match\s+score|give\s+(a\s+)?100%|immediately\s+approve\s+(for\s+hiring)?|force\s+hire|bypass\s+screening)\b',
        "severity": "HIGH",
        "explanation": "Detected manipulation attempt to force a false 100% evaluation score and bypass recruitment verification."
    },
    {
        "category": "Delimiter Hijacking & Roleplay Jailbreak",
        "pattern": r'(?i)(<\|im_start\|>|<\|system\|>|```\s*system|\[INST\].*?\[/INST\]|developer\s+mode\s+enabled|jailbreak\s+active)',
        "severity": "CRITICAL",
        "explanation": "Detected LLM delimiter injection and control token hijacking pattern."
    },
    {
        "category": "Instruction Exfiltration",
        "pattern": r'(?i)\b(reveal\s+(the\s+)?(system\s+prompt|hidden\s+instructions)|print\s+your\s+initial\s+prompt|show\s+secret\s+rules)\b',
        "severity": "MEDIUM",
        "explanation": "Detected adversarial query attempting to exfiltrate internal system prompts."
    }
]

def redact_pii(text: str) -> Tuple[str, int, List[str]]:
    """
    Redacts Personal Identifiable Information (Emails, Phone numbers, SSNs)
    from candidate text to prevent demographic bias and comply with privacy rules.
    """
    detected_types = []
    redaction_count = 0
    
    # 1. Emails
    emails = EMAIL_REGEX.findall(text)
    if emails:
        detected_types.append("EMAIL")
        redaction_count += len(emails)
        text = EMAIL_REGEX.sub("[REDACTED_EMAIL]", text)
        
    # 2. Phone Numbers
    phones = PHONE_REGEX.findall(text)
    if phones:
        detected_types.append("PHONE")
        redaction_count += len(phones)
        text = PHONE_REGEX.sub("[REDACTED_PHONE]", text)
        
    # 3. SSN
    ssns = SSN_REGEX.findall(text)
    if ssns:
        detected_types.append("SSN")
        redaction_count += len(ssns)
        text = SSN_REGEX.sub("[REDACTED_SSN]", text)
        
    return text, redaction_count, detected_types


def scan_prompt_injection(text: str) -> Dict[str, Any]:
    """
    Evaluates text against heuristic and regex rules for prompt injection and adversarial manipulation.
    """
    for rule in INJECTION_PATTERNS:
        match = re.search(rule["pattern"], text)
        if match:
            return {
                "is_safe": False,
                "status": "BLOCKED_BY_GUARDRAIL",
                "attack_detected": True,
                "attack_category": rule["category"],
                "severity": rule["severity"],
                "attack_pattern": match.group(0),
                "explanation": rule["explanation"]
            }
            
    return {
        "is_safe": True,
        "status": "PASSED",
        "attack_detected": False,
        "attack_category": None,
        "severity": "NONE",
        "attack_pattern": None,
        "explanation": "No adversarial prompt injection patterns detected. Input conforms to trust and safety policies."
    }


def execute_guardrail_shield(raw_text: str, context: str = "resume_screening") -> Dict[str, Any]:
    """
    Complete Module 8 Guardrail Execution:
    1. Redacts PII
    2. Runs Prompt Injection Detection Shield
    """
    sanitized_text, pii_count, pii_types = redact_pii(raw_text)
    injection_result = scan_prompt_injection(raw_text)
    
    return {
        "sanitized_text": sanitized_text,
        "is_safe": injection_result["is_safe"],
        "status": injection_result["status"],
        "pii_redacted_count": pii_count,
        "pii_types_detected": pii_types,
        "attack_detected": injection_result["attack_detected"],
        "attack_category": injection_result["attack_category"],
        "attack_pattern": injection_result["attack_pattern"],
        "severity": injection_result.get("severity", "NONE"),
        "explanation": injection_result["explanation"]
    }
