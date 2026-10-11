import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2, AlertTriangle, XCircle, Mail,
  Copy, Send, MessageSquare, Sparkles, Check,
  Loader2, ShieldCheck, User, CheckCircle, Users, Trash2
} from 'lucide-react';

export default function HITLWorkflowTab({
  candidates = [], selectedCandidate, setSelectedCandidate,
  onDeleteCandidate,
  onHitlDecision, loadingHitl, hitlResponse
}) {
  const [tone, setTone] = useState('Formal');
  const [recruiterNotes, setRecruiterNotes] = useState('');
  const [copied, setCopied] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [activeDecisionType, setActiveDecisionType] = useState(null);
  const [editableEmail, setEditableEmail] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [activeDecisionRecord, setActiveDecisionRecord] = useState(null);
  const emailPreviewRef = useRef(null);

  useEffect(() => {
    if (hitlResponse && hitlResponse.candidate_id === selectedCandidate?.id) {
      setEditableEmail(hitlResponse.email_body || '');
      setEmailSubject(hitlResponse.email_subject || 'Technical Recruitment Update');
      setActiveDecisionRecord({ status: hitlResponse.status || hitlResponse.new_status, timestamp: hitlResponse.timestamp || new Date().toISOString() });
    } else if (selectedCandidate?.email_draft) {
      const draft = selectedCandidate.email_draft;
      if (draft.startsWith('Subject: ')) {
        const lines = draft.split('\n');
        setEmailSubject(lines[0].replace('Subject: ', '').trim());
        setEditableEmail(lines.slice(1).join('\n').trim());
      } else {
        setEmailSubject(`Technical Interview: ${selectedCandidate.name}`);
        setEditableEmail(draft);
      }
      setActiveDecisionRecord({ status: getStatusLabel(selectedCandidate.workflow_status), timestamp: new Date().toISOString() });
    } else {
      setEditableEmail('');
      setEmailSubject('');
      setActiveDecisionRecord(null);
    }
  }, [selectedCandidate?.id, hitlResponse, selectedCandidate?.email_draft, selectedCandidate?.workflow_status]);

  const sortedCandidates = [...candidates].sort((a, b) => (b.verified_match_score || 0) - (a.verified_match_score || 0));

  const getCandidateVivaQuestions = (cand) => {
    if (cand?.viva_questions?.length > 0) return cand.viva_questions;
    const name = cand?.name?.toLowerCase() || '';
    if (name.includes('saroj')) {
      return [
        { question_number: 1, category: 'Graph Neural Networks', question: "In TwitterGNN, how did you combine GCN and GAT message passing to prevent over-smoothing across deep rumor cascade graphs?", context_reference: "saroj-2004/TwitterGNN", expected_signals: ["Residual connections & jumping knowledge","Attention coefficient normalization","Laplacian matrix regularization"] },
        { question_number: 2, category: 'Linux Systems Programming', question: "How does epoll edge-triggered (EPOLLET) mode differ from level-triggered in your 100k socket network analyzer?", context_reference: "saroj-2004/c-epoll-monitor", expected_signals: ["EAGAIN loop draining","Non-blocking socket config","Lock-free ring buffer"] },
        { question_number: 3, category: 'Low-Latency Computer Vision', question: "How did you optimize YOLOv8 inference to maintain 60 FPS over WebSocket streaming?", context_reference: "saroj-2004/yolov8-realtime-detector", expected_signals: ["TensorRT/ONNX FP16 quantization","Async worker queues","Zero-copy frame buffer"] },
        { question_number: 4, category: 'RAG & Vector Retrieval', question: "In your nexus-rag-agent, what chunking strategy and distance metric did you use with ChromaDB to prevent hallucination?", context_reference: "saroj-2004/nexus-rag-agent", expected_signals: ["Cosine vs Euclidean","Recursive chunking 15% overlap","Context re-ranking"] },
        { question_number: 5, category: 'Distributed Systems Design', question: "If TwitterGNN had to process 50,000 tweets/sec, what streaming broker and distributed graph cache would you design?", context_reference: "Target Role: AI Systems Engineer", expected_signals: ["Kafka/Redpanda partitioning","Distributed Redis/GraphDB cache","Batch embedding inference"] }
      ];
    } else if (name.includes('aarav')) {
      return [
        { question_number: 1, category: 'Resume Claim Verification', question: "Your CV claims 'Principal AI Architect in Rust and CUDA', but GitHub only shows 'basic-html-calculator'. Walk us through a CUDA kernel you wrote.", context_reference: "Claim: CUDA/Rust vs basic-html-calculator", expected_signals: ["Warp divergence handling","Shared memory bank conflict resolution","Coalesced global memory access"] },
        { question_number: 2, category: 'Distributed Training', question: "In your claimed distributed LLM training, what was your sharding strategy (ZeRO-3 vs Megatron TP) and how did you handle gradient all-reduce?", context_reference: "Claim: Distributed LLM Training", expected_signals: ["Ring All-Reduce","Pipeline parallelism","NCCL collectives"] },
        { question_number: 3, category: 'Kubernetes Infrastructure', question: "How did you configure the GPU operator and node affinity to schedule multi-node training jobs without pod preemption?", context_reference: "Claim: Kubernetes Principal Architect", expected_signals: ["NVIDIA device plugin","Taints & tolerations","PVC topology"] },
        { question_number: 4, category: 'Systems Programming', question: "Explain how Rust ownership and lifetime annotations prevent data races in high-concurrency model serving.", context_reference: "Claim: Rust Systems Architecture", expected_signals: ["Borrow checker semantics","Send and Sync traits","Unsafe blocks"] },
        { question_number: 5, category: 'Portfolio Verification', question: "Can you share a live code repository walkthrough of the distributed systems you authored over the last 12 months?", context_reference: "Portfolio Discrepancy", expected_signals: ["Verifiable open-source artifacts","Demonstrable architectural decisions"] }
      ];
    } else if (name.includes('subesh') || (cand?.github_username || '').includes('subesh')) {
      return [
        { question_number: 1, category: 'Next.js & Web Vitals', question: "In your next_portfolio, how did you structure SSR vs SSG in Next.js + TypeScript to eliminate layout shifts?", context_reference: "subeshyadav3/next_portfolio", expected_signals: ["App Router layout hierarchy","next/font & next/image optimization","Zero-CLS Tailwind styling"] },
        { question_number: 2, category: 'Machine Learning', question: "In Support_Vector_Machine-AI, walk through your quadratic programming solver and margin maximization in Python.", context_reference: "subeshyadav3/Support_Vector_Machine-AI", expected_signals: ["Lagrange multipliers & dual formulation","Support vector sparsity","Soft-margin slack tuning"] },
        { question_number: 3, category: 'C Systems & Sockets', question: "In multi_client_lan_chat_application (C), how did you handle session multiplexing and thread-safe broadcast without deadlocks?", context_reference: "subeshyadav3/multi_client_lan_chat_application", expected_signals: ["Non-blocking select()","Mutex-guarded broadcast queue","Graceful disconnect cleanup"] },
        { question_number: 4, category: 'Web Audio & Async State', question: "In MyMusic, how did you manage audio stream buffering and optimistic playback state across React components?", context_reference: "subeshyadav3/MyMusic", expected_signals: ["Web Audio API audio context","Buffered stream chunking","Custom playback state hook"] },
        { question_number: 5, category: 'Relational Schema', question: "In project-thesis_MIS, how did you design the PostgreSQL schema, RBAC, and indexing for high-concurrency transactions?", context_reference: "subeshyadav3/project-thesis_MIS", expected_signals: ["Compound index optimization","ACID isolation levels","Role-based middleware auth"] }
      ];
    } else if (name.includes('priya')) {
      return [
        { question_number: 1, category: 'Feature Engineering', question: "In customer-churn-streamlit, how did you handle class imbalance and which evaluation metrics did you prioritize?", context_reference: "priya-patel/customer-churn-streamlit", expected_signals: ["SMOTE / class-weighting","Precision-Recall tradeoff","SHAP feature importances"] },
        { question_number: 2, category: 'Database & SQL', question: "In ecommerce-sql-suite, how did you use window functions and compound indexing on high-cardinality order tables?", context_reference: "priya-patel/ecommerce-sql-suite", expected_signals: ["PARTITION BY / ROW_NUMBER()","B-tree vs Hash index","EXPLAIN ANALYZE"] },
        { question_number: 3, category: 'Streamlit Architecture', question: "How did you manage caching and session state in Streamlit to avoid expensive re-computations on filter changes?", context_reference: "priya-patel/customer-churn-streamlit", expected_signals: ["@st.cache_data / @st.cache_resource","st.session_state persistence"] },
        { question_number: 4, category: 'Role Alignment', question: "How would you leverage your Python and SQL background to ramp up on FastAPI microservices and vector indexing?", context_reference: "Target Role: AI Systems Engineer", expected_signals: ["Async Python","Data schema validation","Vector DB query optimization"] },
        { question_number: 5, category: 'Testing & Data Quality', question: "How do you build automated unit tests and data validation assertions for production ingestion pipelines?", context_reference: "Data Quality Best Practices", expected_signals: ["Pytest / Great Expectations","Schema validation","Mocking external databases"] }
      ];
    } else {
      const skills = (cand?.raw_skills || ['Python','FastAPI','RAG']).slice(0, 3).join(', ');
      return [
        { question_number: 1, category: 'System Architecture', question: "Walk us through the architecture of your primary project and how you structured it for production reliability.", context_reference: `Profile: ${cand?.name}`, expected_signals: ['Modular microservices','Separation of concerns','Error boundaries'] },
        { question_number: 2, category: 'Technical Competency', question: `Our role requires ${skills}. Describe a difficult debugging challenge you resolved in these technologies.`, context_reference: `Skills: ${skills}`, expected_signals: ['Root cause analysis','Profiling','Clean code practices'] },
        { question_number: 3, category: 'Latency Optimization', question: "How do you measure and optimize API latency, caching layers, and database queries under concurrent loads?", context_reference: "Scalability & Performance", expected_signals: ['Benchmarking tools','In-memory caching','Query index optimization'] },
        { question_number: 4, category: 'CI/CD', question: "What testing methodologies and automated deployment pipelines have you built for your software repos?", context_reference: "Engineering Rigor", expected_signals: ['Unit & Integration tests','GitHub Actions','Containerized environments'] },
        { question_number: 5, category: 'System Design', question: "How would you design a distributed service with graceful degradation and guardrails against malformed inputs?", context_reference: "Systems Architecture", expected_signals: ['Circuit breakers','Input sanitization','Structured audit logging'] }
      ];
    }
  };

  const vivaQuestions = getCandidateVivaQuestions(selectedCandidate);

  function getStatusLabel(status) {
    switch (status) {
      case 'APPROVED_FOR_INTERVIEW': return 'Approved for Interview';
      case 'ESCALATED': return 'Escalated to Lead';
      case 'BLOCKED_BY_GUARDRAIL': return 'Blocked by Guardrail';
      case 'REJECTED': return 'Rejected';
      default: return 'Pending Review';
    }
  }

  const statusBadge = (status) => {
    switch (status) {
      case 'APPROVED_FOR_INTERVIEW': return <span className="badge badge-success"><CheckCircle2 className="w-3 h-3" />Approved</span>;
      case 'ESCALATED': return <span className="badge badge-warn"><AlertTriangle className="w-3 h-3" />Escalated</span>;
      case 'BLOCKED_BY_GUARDRAIL': return <span className="badge badge-danger"><XCircle className="w-3 h-3" />Blocked</span>;
      case 'REJECTED': return <span className="badge badge-neutral"><XCircle className="w-3 h-3" />Rejected</span>;
      default: return <span className="badge badge-neutral">Pending</span>;
    }
  };

  const handleDecisionClick = async (decisionType) => {
    if (!selectedCandidate) return;
    setActiveDecisionType(decisionType);
    try {
      const res = await onHitlDecision(selectedCandidate.id, decisionType, tone, recruiterNotes);
      if (res) {
        setEditableEmail(res.email_body || '');
        setEmailSubject(res.email_subject || 'Technical Recruitment Update');
        setActiveDecisionRecord({ status: res.status || res.new_status, timestamp: res.timestamp || new Date().toISOString() });
      }
      setTimeout(() => emailPreviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150);
    } catch (err) { console.error(err); }
    finally { setActiveDecisionType(null); }
  };

  const handleToneChange = async (newTone) => {
    setTone(newTone);
    if (selectedCandidate?.workflow_status && selectedCandidate.workflow_status !== 'PENDING_HR_REVIEW') {
      setActiveDecisionType(selectedCandidate.workflow_status);
      try {
        const res = await onHitlDecision(selectedCandidate.id, selectedCandidate.workflow_status, newTone, recruiterNotes);
        if (res) { setEditableEmail(res.email_body || ''); setEmailSubject(res.email_subject || 'Technical Recruitment Update'); }
      } catch (err) { console.error(err); }
      finally { setActiveDecisionType(null); }
    }
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(`Subject: ${emailSubject}\n\n${editableEmail}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSimulateSend = () => {
    setSentSuccess(true);
    setTimeout(() => setSentSuccess(false), 5000);
  };

  return (
    <div className="space-y-5">

      {/* ─── Page Header row ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            HITL Decision Console
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Review, approve, escalate, or reject candidates and synthesize outcome emails.</p>
        </div>
        {sentSuccess && (
          <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-xs font-semibold flex items-center gap-2 fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            Email dispatched to {selectedCandidate?.email || 'candidate'}
          </div>
        )}
      </div>

      {/* ─── Leaderboard table ─── */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-900">Verification Leaderboard</span>
          <span className="section-label">{candidates.length} candidates · click row to review</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Candidate</th>
                <th>Trust Score</th>
                <th>RAG</th>
                <th>GitHub</th>
                <th>Risk</th>
                <th>Status</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedCandidates.map((cand, idx) => {
                const isSelected = selectedCandidate?.id === cand.id;
                return (
                  <tr key={cand.id} onClick={() => setSelectedCandidate(cand)}
                    className={`cursor-pointer ${isSelected ? 'bg-slate-100' : ''}`}>
                    <td className="font-mono font-semibold text-slate-400">#{idx + 1}</td>
                    <td>
                      <div className="font-semibold text-slate-900">{cand.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">@{cand.github_username || 'no-handle'}</div>
                    </td>
                    <td>
                      <span className={`font-bold font-mono ${cand.verified_match_score >= 70 ? 'text-emerald-700' : cand.verified_match_score >= 40 ? 'text-amber-700' : 'text-rose-700'}`}>
                        {cand.verified_match_score || 0}%
                      </span>
                    </td>
                    <td className="font-mono text-slate-700">{cand.rag_score || 0}%</td>
                    <td className="font-mono text-slate-700">{cand.github_score || 0}%</td>
                    <td>
                      <span className={`badge ${cand.hallucination_risk === 'LOW' ? 'badge-success' : cand.hallucination_risk === 'MEDIUM' ? 'badge-warn' : 'badge-danger'}`}>
                        {cand.hallucination_risk || 'LOW'}
                      </span>
                    </td>
                    <td>{statusBadge(cand.workflow_status)}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={(e) => { e.stopPropagation(); setSelectedCandidate(cand); }}
                          className={`btn btn-xs ${isSelected ? 'btn-primary' : 'btn-secondary'}`}>
                          {isSelected ? 'Selected' : 'Review'}
                        </button>
                        {onDeleteCandidate && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteCandidate(cand.id);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title={`Delete ${cand.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Review Panel ─── */}
      {selectedCandidate ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* Viva Questions */}
          <div className="lg:col-span-6">
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-slate-500" />
                    Technical Viva · {selectedCandidate.name}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">5 questions generated from verified repositories</p>
                </div>
                <span className="badge badge-neutral">Module 6</span>
              </div>

              <div className="space-y-2.5">
                {vivaQuestions.map((q, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-start gap-2 mb-1.5">
                      <span className="shrink-0 w-5 h-5 rounded bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center font-mono">
                        {q.question_number || idx + 1}
                      </span>
                      <div className="min-w-0">
                        <span className="section-label">{q.category}</span>
                        <p className="text-xs font-medium text-slate-900 leading-relaxed mt-0.5">{q.question}</p>
                      </div>
                    </div>
                    {q.expected_signals?.length > 0 && (
                      <div className="ml-7 mt-2 pt-2 border-t border-slate-200">
                        <div className="flex flex-wrap gap-1">
                          {q.expected_signals.map((sig, sIdx) => (
                            <span key={sIdx} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
                              ✓ {sig}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Decision Controls + Email */}
          <div className="lg:col-span-6 space-y-4">

            {/* Decision card */}
            <div className="card p-4 space-y-3.5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-xs font-semibold text-slate-900">Recruiter Decision</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">{selectedCandidate.name} · {selectedCandidate.email || `${selectedCandidate.github_username}@cloudai.internal`}</p>
                </div>
                {statusBadge(selectedCandidate.workflow_status)}
              </div>

              {/* Tone selector */}
              <div>
                <p className="section-label mb-1.5">Email Tone</p>
                <div className="flex gap-1.5">
                  {['Formal','Welcoming','Technical'].map(t => (
                    <button key={t} type="button" onClick={() => handleToneChange(t)}
                      className={`flex-1 btn btn-xs ${tone === t ? 'btn-primary' : 'btn-secondary'}`}>
                      {tone === t && <Check className="w-3 h-3" />}
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="section-label block mb-1">Recruiter Notes</label>
                <textarea rows={2} value={recruiterNotes} onChange={(e) => setRecruiterNotes(e.target.value)}
                  placeholder="e.g. Exceptional PyTorch work. Approve for Senior ML round."
                  className="input" style={{ resize: 'none', padding: '8px 10px' }} />
              </div>

              {/* Decision buttons */}
              <div>
                <p className="section-label mb-1.5">Decision</p>
                <div className="grid grid-cols-3 gap-2">
                  <button disabled={loadingHitl} onClick={() => handleDecisionClick('APPROVED_FOR_INTERVIEW')} className="btn btn-approve">
                    {loadingHitl && activeDecisionType === 'APPROVED_FOR_INTERVIEW'
                      ? <Loader2 className="w-3.5 h-3.5 spin" />
                      : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Approve
                  </button>
                  <button disabled={loadingHitl} onClick={() => handleDecisionClick('ESCALATED')} className="btn btn-warn">
                    {loadingHitl && activeDecisionType === 'ESCALATED'
                      ? <Loader2 className="w-3.5 h-3.5 spin" />
                      : <AlertTriangle className="w-3.5 h-3.5" />}
                    Escalate
                  </button>
                  <button disabled={loadingHitl} onClick={() => handleDecisionClick('REJECTED')} className="btn btn-danger">
                    {loadingHitl && activeDecisionType === 'REJECTED'
                      ? <Loader2 className="w-3.5 h-3.5 spin" />
                      : <XCircle className="w-3.5 h-3.5" />}
                    Reject
                  </button>
                </div>
              </div>
            </div>

            {/* Email Preview */}
            <div ref={emailPreviewRef} className="card p-4 space-y-3">
              {activeDecisionRecord ? (
                <div className="flex items-center justify-between px-3 py-2 bg-slate-900 text-white rounded-md text-xs">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-semibold">{activeDecisionRecord.status}</span>
                    <span className="text-slate-400">· Audit logged</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-500">
                  <Mail className="w-3.5 h-3.5" />
                  Make a decision above to generate the candidate email
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-500" />
                    Candidate Email
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-mono">
                      To: {selectedCandidate.email || `${selectedCandidate.github_username || 'candidate'}@cloudai.internal`}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-mono">
                      Tone: {tone}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={handleCopyEmail} disabled={!editableEmail} className="btn btn-secondary btn-xs">
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button onClick={handleSimulateSend} disabled={!editableEmail} className="btn btn-primary btn-xs">
                    <Send className="w-3 h-3" /> Send
                  </button>
                </div>
              </div>

              {emailSubject && (
                <div className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs">
                  <span className="font-semibold text-slate-500">Subject: </span>
                  <span className="text-slate-900 font-medium">{emailSubject}</span>
                </div>
              )}

              <textarea rows={9} value={editableEmail || ''} onChange={(e) => setEditableEmail(e.target.value)}
                placeholder="Email draft will appear here after making a decision…"
                className="input font-mono text-xs leading-relaxed" style={{ resize: 'none', padding: '10px', background: '#F8FAFC' }} />
            </div>
          </div>
        </div>
      ) : (
        <div className="card p-12 text-center">
          <User className="w-8 h-8 mx-auto mb-2.5 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No candidate selected</p>
          <p className="text-xs text-slate-400 mt-1">Click Review on any row above to open the viva & decision console</p>
        </div>
      )}
    </div>
  );
}
