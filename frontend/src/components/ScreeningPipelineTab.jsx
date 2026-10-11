import React, { useState, useEffect } from 'react';
import {
  Play, ShieldCheck, Database, GitBranch, Award,
  FileCheck2, CheckCircle2, XCircle, AlertTriangle,
  AlertOctagon, Clock, Star, Terminal, Layers,
  Plus, X, Wand2, PlusCircle, Trash2
} from 'lucide-react';

const ROLE_PRESETS = {
  ai_systems: {
    label: "AI Systems Engineer Intern — Cloud AI Inc.",
    title: "AI Systems Engineer Intern",
    company: "Cloud AI Inc.",
    description: "Cloud AI is seeking an ambitious AI Systems Engineer Intern to design, optimize, and deploy autonomous multi-agent pipelines, RAG architectures with vector embeddings, low-latency FastAPI microservices, and modern React user interfaces. You will work on production LLM orchestration, evaluate chunking benchmarks, build guardrails against prompt injection, and integrate real-time external APIs.",
    required_skills: ["Python","FastAPI","Retrieval-Augmented Generation (RAG)","LangChain/LangGraph","PyTorch/Deep Learning","Vector Databases (ChromaDB/FAISS)","Docker","React"]
  },
  backend_python: {
    label: "Backend Python & FastAPI Engineer — Cloud AI Inc.",
    title: "Backend Python & FastAPI Engineer",
    company: "Cloud AI Inc.",
    description: "Looking for a high-performance Backend Engineer to architect asynchronous REST microservices using FastAPI, optimize SQL queries on PostgreSQL, manage distributed caching with Redis, and containerize microservices using Docker.",
    required_skills: ["Python","FastAPI","PostgreSQL","Docker","Redis","REST APIs","Microservices","SQL"]
  },
  fullstack_react: {
    label: "Full-Stack React & Systems Developer — Cloud AI Inc.",
    title: "Full-Stack React & Systems Developer",
    company: "Cloud AI Inc.",
    description: "Seeking a Full-Stack Systems Developer to build real-time interactive user interfaces in React/Vite, stream telemetry over WebSockets, and build robust API endpoints with FastAPI and Python.",
    required_skills: ["React","TypeScript","Vite","FastAPI","Python","Tailwind CSS","WebSockets","Docker"]
  },
  custom: {
    label: "Custom Job Description (Editable)",
    title: "Custom AI / Software Engineer",
    company: "Cloud AI Inc.",
    description: "Enter your custom job description here.",
    required_skills: ["Python","FastAPI","Docker"]
  }
};

export default function ScreeningPipelineTab({
  candidates, selectedCandidate, setSelectedCandidate,
  onDeleteCandidate,
  jobDescription, setJobDescription,
  onRunPipeline, screeningResult, loadingScreening,
  onOpenUploadModal, apiUrl = 'http://localhost:8000'
}) {
  const [activeSubTab, setActiveSubTab] = useState('claims');
  const [selectedPreset, setSelectedPreset] = useState('ai_systems');
  const [jobTitle, setJobTitle] = useState(jobDescription?.title || ROLE_PRESETS.ai_systems.title);
  const [companyName, setCompanyName] = useState(jobDescription?.company || ROLE_PRESETS.ai_systems.company);
  const [descriptionText, setDescriptionText] = useState(jobDescription?.description || ROLE_PRESETS.ai_systems.description);
  const [skillsList, setSkillsList] = useState(jobDescription?.required_skills || ROLE_PRESETS.ai_systems.required_skills);
  const [newSkillInput, setNewSkillInput] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  useEffect(() => {
    if (jobDescription) {
      setJobTitle(jobDescription.title || '');
      setCompanyName(jobDescription.company || '');
      setDescriptionText(jobDescription.description || '');
      if (jobDescription.required_skills) setSkillsList(jobDescription.required_skills);
    }
  }, [jobDescription]);

  const handlePresetChange = (presetKey) => {
    setSelectedPreset(presetKey);
    const preset = ROLE_PRESETS[presetKey];
    if (preset) {
      setJobTitle(preset.title);
      setCompanyName(preset.company);
      setDescriptionText(preset.description);
      setSkillsList([...preset.required_skills]);
      if (setJobDescription) setJobDescription({ ...jobDescription, title: preset.title, company: preset.company, description: preset.description, required_skills: [...preset.required_skills] });
    }
  };

  const handleAddSkill = (e) => {
    e?.preventDefault();
    const trimmed = newSkillInput.trim();
    if (trimmed && !skillsList.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      const updated = [...skillsList, trimmed];
      setSkillsList(updated);
      setNewSkillInput('');
      if (setJobDescription) setJobDescription(prev => ({ ...prev, required_skills: updated }));
    }
  };

  const handleRemoveSkill = (idx) => {
    const updated = skillsList.filter((_, i) => i !== idx);
    setSkillsList(updated);
    if (setJobDescription) setJobDescription(prev => ({ ...prev, required_skills: updated }));
  };

  const handleAutoExtractSkills = async () => {
    if (!descriptionText.trim()) return;
    setIsExtracting(true);
    try {
      const res = await fetch(`${apiUrl}/api/etl/extract-skills`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `${jobTitle} ${descriptionText}` }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.skills?.length > 0) {
          const combined = Array.from(new Set([...skillsList, ...data.skills]));
          setSkillsList(combined);
          if (setJobDescription) setJobDescription(prev => ({ ...prev, required_skills: combined }));
        }
      }
    } catch (err) { console.error(err); }
    finally { setIsExtracting(false); }
  };

  const handleRunClick = () => {
    onRunPipeline(selectedCandidate?.id, { title: jobTitle, company: companyName, description: descriptionText, required_skills: skillsList });
  };

  const proofBadge = (status) => {
    switch (status) {
      case 'VERIFIED':
        return <span className="badge badge-success"><CheckCircle2 className="w-3 h-3" /> CV + GitHub</span>;
      case 'GITHUB_PROVEN':
        return <span className="badge badge-info"><CheckCircle2 className="w-3 h-3" /> GitHub Only</span>;
      case 'UNVERIFIED_EXAGGERATION':
        return <span className="badge badge-danger"><AlertOctagon className="w-3 h-3" /> Discrepancy</span>;
      case 'MISSING':
        return <span className="badge badge-neutral"><XCircle className="w-3 h-3" /> Missing</span>;
      default:
        return <span className="badge badge-warn"><AlertTriangle className="w-3 h-3" /> CV Only</span>;
    }
  };

  const statusBadge = (status) => {
    switch (status) {
      case 'APPROVED_FOR_INTERVIEW': return <span className="badge badge-success">Approved</span>;
      case 'ESCALATED': return <span className="badge badge-warn">Escalated</span>;
      case 'BLOCKED_BY_GUARDRAIL': return <span className="badge badge-danger">Blocked</span>;
      case 'REJECTED': return <span className="badge badge-neutral">Rejected</span>;
      default: return <span className="badge badge-neutral">Pending</span>;
    }
  };

  const traces = screeningResult?.agent_traces || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

      {/* ─── LEFT: Setup ─── */}
      <div className="lg:col-span-4 space-y-4">

        {/* Job Profile Card */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="section-label">Target Role</span>
          </div>

          {/* Preset selector */}
          <select
            value={selectedPreset}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="input"
          >
            {Object.entries(ROLE_PRESETS).map(([key, item]) => (
              <option key={key} value={key}>{item.label}</option>
            ))}
          </select>

          {/* Title + Company row */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block section-label mb-1">Title</label>
              <input type="text" value={jobTitle} className="input"
                onChange={(e) => { setJobTitle(e.target.value); setSelectedPreset('custom'); if (setJobDescription) setJobDescription(p => ({ ...p, title: e.target.value })); }}
                placeholder="Job title"
              />
            </div>
            <div>
              <label className="block section-label mb-1">Company</label>
              <input type="text" value={companyName} className="input"
                onChange={(e) => { setCompanyName(e.target.value); setSelectedPreset('custom'); if (setJobDescription) setJobDescription(p => ({ ...p, company: e.target.value })); }}
                placeholder="Company"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="section-label">Description</label>
              <button type="button" onClick={handleAutoExtractSkills} disabled={isExtracting}
                className="btn btn-ghost btn-xs" title="Auto-extract skills from description">
                <Wand2 className="w-3 h-3" />
                {isExtracting ? 'Extracting…' : 'Extract skills'}
              </button>
            </div>
            <textarea rows={3} value={descriptionText} className="input" style={{ resize: 'vertical' }}
              onChange={(e) => { setDescriptionText(e.target.value); setSelectedPreset('custom'); if (setJobDescription) setJobDescription(p => ({ ...p, description: e.target.value })); }}
              placeholder="Job requirements…"
            />
          </div>

          {/* Skills */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="section-label">Required Skills ({skillsList.length})</span>
            </div>
            <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 rounded-md border border-slate-200 min-h-[40px] max-h-28 overflow-y-auto mb-2">
              {skillsList.map((skill, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-800 font-medium">
                  {skill}
                  <button type="button" onClick={() => handleRemoveSkill(idx)}
                    className="text-slate-400 hover:text-rose-600 transition ml-0.5">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
              {skillsList.length === 0 && <span className="text-[11px] text-slate-400 italic">No skills defined</span>}
            </div>
            <form onSubmit={handleAddSkill} className="flex gap-1.5">
              <input type="text" value={newSkillInput} onChange={(e) => setNewSkillInput(e.target.value)}
                placeholder="Add skill…" className="input flex-1" style={{ padding: '5px 8px' }} />
              <button type="submit" disabled={!newSkillInput.trim()} className="btn btn-primary btn-xs">
                <Plus className="w-3 h-3" /> Add
              </button>
            </form>
          </div>
        </div>

        {/* Candidate Selector */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="section-label">Candidates</span>
            <button onClick={onOpenUploadModal} className="btn btn-ghost btn-xs">
              <PlusCircle className="w-3 h-3" /> Upload
            </button>
          </div>
          <div className="space-y-1.5">
            {candidates.map(cand => {
              const isSelected = selectedCandidate?.id === cand.id;
              const isMalicious = cand.name.toLowerCase().includes('malicious');
              const isAarav = cand.name.toLowerCase().includes('aarav');
              return (
                <div key={cand.id} onClick={() => setSelectedCandidate(cand)}
                  className={`cand-row group ${isSelected ? 'selected' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1 mr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-900 truncate">{cand.name}</span>
                        {isMalicious && <span className="badge badge-danger" style={{ fontSize: '9px', padding: '1px 5px' }}>Adversarial</span>}
                        {isAarav && <span className="badge badge-warn" style={{ fontSize: '9px', padding: '1px 5px' }}>Exaggeration</span>}
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
                        @{cand.github_username || 'no-github'} · {cand.years_experience}yr
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {cand.verified_match_score > 0 ? (
                        <span className={`text-xs font-bold font-mono ${cand.verified_match_score >= 70 ? 'text-emerald-700' : cand.verified_match_score >= 40 ? 'text-amber-700' : 'text-rose-700'}`}>
                          {cand.verified_match_score}%
                        </span>
                      ) : (
                        <span className="badge badge-neutral" style={{ fontSize: '9px' }}>Unscreened</span>
                      )}
                      {onDeleteCandidate && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteCandidate(cand.id);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors opacity-70 group-hover:opacity-100"
                          title={`Delete ${cand.name}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Resume Snapshot */}
        {selectedCandidate && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="section-label">Resume</span>
              {statusBadge(selectedCandidate.workflow_status)}
            </div>
            <pre className="p-2.5 bg-slate-50 rounded border border-slate-200 text-[11px] text-slate-700 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed font-mono">
              {selectedCandidate.resume_text}
            </pre>
          </div>
        )}
      </div>

      {/* ─── RIGHT: Pipeline ─── */}
      <div className="lg:col-span-8 space-y-4">

        {/* Action bar */}
        <div className="card p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">5-Agent Verification Pipeline</h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {selectedCandidate?.name
                ? <><span className="font-medium text-slate-700">{selectedCandidate.name}</span> · @{selectedCandidate.github_username || 'N/A'} · {jobTitle}</>
                : 'Select a candidate to begin'}
            </p>
          </div>
          <button onClick={handleRunClick} disabled={loadingScreening || !selectedCandidate}
            className="btn btn-primary shrink-0 w-full sm:w-auto">
            {loadingScreening ? (
              <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full spin" />Running…</>
            ) : (
              <><Play className="w-3.5 h-3.5 fill-white" />Run Pipeline</>
            )}
          </button>
        </div>

        {/* Pipeline Stepper */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs font-semibold text-slate-700">Execution Graph</span>
            </div>
            {screeningResult && (
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <Clock className="w-3 h-3" />
                <span className="font-mono">{screeningResult.total_latency_ms} ms</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-5 gap-2">
            {[
              { num: 1, name: 'Guardrail', icon: ShieldCheck, desc: 'PII + Shield' },
              { num: 2, name: 'RAG',       icon: Database,    desc: 'Semantic Search' },
              { num: 3, name: 'GitHub',    icon: GitBranch,   desc: 'Live API' },
              { num: 4, name: 'Reflection',icon: Award,       desc: 'Viva + Score' },
              { num: 5, name: 'Audit',     icon: FileCheck2,  desc: 'Compliance' },
            ].map(node => {
              const trace = traces.find(t => t.step_number === node.num);
              const isBlocked  = trace?.status === 'BLOCKED';
              const isCompleted = trace?.status === 'COMPLETED';
              const isRunning  = loadingScreening && !trace;
              const Icon = node.icon;
              const nodeClass = isBlocked ? 'blocked' : isCompleted ? 'done' : isRunning ? 'running' : 'idle';

              return (
                <div key={node.num} className={`agent-node ${nodeClass}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className={`p-1 rounded ${isBlocked ? 'bg-rose-100 text-rose-700' : isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      <Icon className="w-3 h-3" />
                    </div>
                    <span className="text-[9px] font-mono text-slate-400">{node.num}</span>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-900 truncate">{node.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{node.desc}</p>
                  <div className="mt-1.5 pt-1.5 border-t border-slate-200 flex items-center justify-between text-[10px]">
                    {trace ? (
                      <>
                        <span className={`font-bold ${isBlocked ? 'text-rose-700' : 'text-emerald-700'}`}>
                          {isBlocked ? 'BLOCKED' : 'PASS'}
                        </span>
                        <span className="font-mono text-slate-500">{trace.latency_ms}ms</span>
                      </>
                    ) : (
                      <span className="text-slate-400 font-mono">Idle</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Guardrail block banner */}
          {screeningResult?.guardrail_status === 'BLOCKED' && (
            <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5">
              <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-rose-800">Adversarial Injection Blocked</p>
                <p className="text-xs text-rose-700 mt-0.5">The Guardrail Shield intercepted an adversarial injection attempt. Pipeline terminated to prevent privilege escalation.</p>
                <code className="block mt-1.5 text-[10px] font-mono bg-white p-1.5 rounded border border-rose-200 text-rose-800">
                  Risk: CRITICAL_ADVERSARIAL_ATTACK · Logged to Audit Trail
                </code>
              </div>
            </div>
          )}
        </div>

        {/* Score Cards */}
        {screeningResult && screeningResult.guardrail_status !== 'BLOCKED' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-3.5">
              <p className="section-label mb-1">RAG Match</p>
              <p className="text-2xl font-bold text-slate-900">{screeningResult.rag_score}%</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Semantic similarity</p>
            </div>
            <div className="card p-3.5">
              <p className="section-label mb-1">GitHub Proof</p>
              <p className={`text-2xl font-bold ${screeningResult.github_score >= 70 ? 'text-emerald-700' : screeningResult.github_score >= 40 ? 'text-amber-700' : 'text-rose-700'}`}>
                {screeningResult.github_score}%
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">Codebase evidence</p>
            </div>
            <div className="card p-3.5 bg-slate-900 border-slate-900 text-white">
              <p className="section-label mb-1 text-slate-400">Trust Score</p>
              <p className="text-2xl font-bold text-white">{screeningResult.verified_match_score}%</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Composite index</p>
            </div>
            <div className="card p-3.5">
              <p className="section-label mb-1">Hallucination</p>
              <p className={`text-lg font-bold mt-0.5 ${screeningResult.hallucination_risk === 'LOW' ? 'text-emerald-700' : screeningResult.hallucination_risk === 'MEDIUM' ? 'text-amber-700' : 'text-rose-700'}`}>
                {screeningResult.hallucination_risk}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">Claim vs repo delta</p>
            </div>
          </div>
        )}

        {/* Detailed Tabs */}
        {screeningResult && screeningResult.guardrail_status !== 'BLOCKED' && (
          <div className="card overflow-hidden">
            <div className="flex gap-5 border-b border-slate-200 px-4 bg-slate-50">
              {[
                { id: 'claims', label: `Claims (${screeningResult.claim_vs_proof?.length || 0})`, icon: GitBranch },
                { id: 'chunks', label: `RAG Chunks (${screeningResult.retrieved_chunks?.length || 0})`, icon: Database },
                { id: 'raw_trace', label: 'Telemetry', icon: Terminal },
              ].map(st => (
                <button key={st.id} onClick={() => setActiveSubTab(st.id)}
                  className={`subtab-link ${activeSubTab === st.id ? 'active' : ''}`}>
                  <st.icon className="w-3 h-3" />
                  {st.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {/* Claim vs Proof table */}
              {activeSubTab === 'claims' && (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Skill</th>
                        <th>Status</th>
                        <th>Evidence Repo</th>
                        <th>Language / Stars</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(screeningResult.claim_vs_proof || []).map((item, idx) => (
                        <tr key={idx}>
                          <td className="font-semibold text-slate-900">{item.claimed_skill}</td>
                          <td>{proofBadge(item.status)}</td>
                          <td>
                            {item.evidence_repo
                              ? <code className="text-[11px] font-mono text-slate-900">{item.evidence_repo}</code>
                              : <span className="text-slate-400 italic text-[11px]">—</span>}
                          </td>
                          <td>
                            {item.repo_language
                              ? <span className="inline-flex items-center gap-1 text-[11px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                  {item.repo_language} <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-500" /> {item.stars}
                                </span>
                              : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="text-[11px] text-slate-600 max-w-[220px]">{item.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* RAG Chunks */}
              {activeSubTab === 'chunks' && (
                <div className="space-y-2">
                  {(screeningResult.retrieved_chunks || []).map((chunk, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <code className="text-[10px] font-mono bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded font-semibold">
                            {chunk.chunk_id || `chunk_${idx}`}
                          </code>
                          <span className="text-xs text-slate-600 font-medium">{chunk.section_name || chunk.strategy}</span>
                        </div>
                        <span className="text-xs font-bold text-emerald-700 font-mono">
                          {(chunk.similarity_score * 100).toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 font-mono whitespace-pre-wrap leading-relaxed">{chunk.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Agent Telemetry */}
              {activeSubTab === 'raw_trace' && (
                <div className="space-y-2">
                  {traces.map(trace => (
                    <div key={trace.step_number} className="p-3 bg-slate-50 rounded-lg border border-slate-200 font-mono text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-900">Step {trace.step_number}: {trace.step_name}</span>
                        <span className="text-slate-500">{trace.latency_ms} ms</span>
                      </div>
                      <p className="text-slate-600 text-[11px] mb-1.5">{trace.output_summary}</p>
                      {trace.data && (
                        <pre className="p-2 bg-white rounded border border-slate-200 text-[10px] text-slate-700 overflow-x-auto">
                          {JSON.stringify(trace.data, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
