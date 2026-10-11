import React, { useState, useEffect } from 'react';
import { Cpu, Zap, Users, Database, ShieldCheck, UploadCloud, RotateCcw } from 'lucide-react';

import ScreeningPipelineTab from './components/ScreeningPipelineTab';
import HITLWorkflowTab from './components/HITLWorkflowTab';
import RAGEvaluationTab from './components/RAGEvaluationTab';
import GovernanceAuditTab from './components/GovernanceAuditTab';
import UploadModal from './components/UploadModal';
import NexusHireLogo from './components/NexusHireLogo';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const TABS = [
  { id: 'screening',  label: 'Screening',   icon: Zap },
  { id: 'hitl',       label: 'Review',      icon: Users },
  { id: 'rag',        label: 'RAG Lab',     icon: Database },
  { id: 'governance', label: 'Governance',  icon: ShieldCheck },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('screening'); // 'screening', 'hitl', 'rag', 'governance'
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [jobDescription, setJobDescription] = useState(null);
  const [screeningResult, setScreeningResult] = useState(null);
  const [loadingScreening, setLoadingScreening] = useState(false);
  const [loadingHitl, setLoadingHitl] = useState(false);
  const [hitlResponse, setHitlResponse] = useState(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [systemHealth, setSystemHealth] = useState(null);

  // Fetch initial data
  const fetchData = async () => {
    try {
      // 1. Health
      const healthRes = await fetch(`${API_URL}/api/health`);
      if (healthRes.ok) {
        setSystemHealth(await healthRes.json());
      }

      // 2. Job Descriptions
      const jdRes = await fetch(`${API_URL}/api/job-descriptions`);
      if (jdRes.ok) {
        const jds = await jdRes.json();
        if (jds.length > 0) setJobDescription(jds[0]);
      }

      // 3. Candidates
      const candRes = await fetch(`${API_URL}/api/candidates`);
      if (candRes.ok) {
        const candList = await candRes.json();
        setCandidates(candList);
        if (candList.length > 0 && !selectedCandidate) {
          setSelectedCandidate(candList[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch initial data:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Run 5-Agent Screening Pipeline
  const handleRunPipeline = async (candidateId, customJd) => {
    if (!candidateId) return;
    setLoadingScreening(true);
    setScreeningResult(null);

    try {
      const activeJd = customJd || jobDescription;
      const payload = activeJd ? {
        job_title: activeJd.title,
        company: activeJd.company,
        job_description: activeJd.description,
        required_skills: activeJd.required_skills
      } : null;

      const res = await fetch(`${API_URL}/api/agents/screen-candidate/${candidateId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : undefined
      });
      if (res.ok) {
        const data = await res.json();
        setScreeningResult(data);
        
        // Refresh candidates to update scores in list
        const candRes = await fetch(`${API_URL}/api/candidates`);
        if (candRes.ok) {
          const updatedList = await candRes.json();
          setCandidates(updatedList);
          const current = updatedList.find((c) => c.id === candidateId);
          if (current) setSelectedCandidate(current);
        }
      }
    } catch (err) {
      console.error('Pipeline execution error:', err);
    } finally {
      setLoadingScreening(false);
    }
  };

  // Human-in-the-Loop decision
  const handleHitlDecision = async (candidateId, decision, tone, notes) => {
    setLoadingHitl(true);
    try {
      const res = await fetch(`${API_URL}/api/workflow/hitl-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: candidateId,
          decision: decision,
          tone: tone,
          reviewer_notes: notes,
          notes: notes,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setHitlResponse(data);

        // Optimistically update candidate in state
        setCandidates((prev) =>
          prev.map((c) =>
            c.id === candidateId
              ? { ...c, workflow_status: data.new_status, email_draft: data.email_body }
              : c
          )
        );

        // Also refresh from backend
        const candRes = await fetch(`${API_URL}/api/candidates`);
        if (candRes.ok) {
          const updatedList = await candRes.json();
          setCandidates(updatedList);
          const current = updatedList.find((c) => c.id === candidateId);
          if (current) setSelectedCandidate(current);
        }
        return data;
      }
    } catch (err) {
      console.error('HITL error:', err);
    } finally {
      setLoadingHitl(false);
    }
  };

  const handleCandidateCreated = (newCand) => {
    setCandidates((prev) => [newCand, ...prev]);
    setSelectedCandidate(newCand);
  };

  const handleDeleteCandidate = async (candidateId) => {
    const candToDelete = candidates.find(c => c.id === candidateId);
    const confirmName = candToDelete ? candToDelete.name : `candidate #${candidateId}`;
    if (!window.confirm(`Are you sure you want to delete ${confirmName}?`)) {
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/candidates/${candidateId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setCandidates((prev) => {
          const filtered = prev.filter((c) => c.id !== candidateId);
          if (selectedCandidate?.id === candidateId) {
            setSelectedCandidate(filtered.length > 0 ? filtered[0] : null);
            setScreeningResult(null);
          }
          return filtered;
        });
      } else {
        const errData = await res.json();
        alert(errData.detail || 'Failed to delete candidate');
      }
    } catch (err) {
      console.error('Delete candidate error:', err);
      alert('Error connecting to server to delete candidate.');
    }
  };

  const handleResetDemo = async () => {
    if (!window.confirm('Reset candidate pool back to original demo dataset? Any custom candidates will be replaced.')) {
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/candidates/reset-demo`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.candidates || []);
        if (data.candidates && data.candidates.length > 0) {
          setSelectedCandidate(data.candidates[0]);
          setScreeningResult(null);
        }
      }
    } catch (err) {
      console.error('Reset demo error:', err);
      alert('Error resetting demo dataset.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased">

      {/* ─── Header ─── */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          {/* Brand */}
          <NexusHireLogo
            iconSize="w-7 h-7"
            textSize="text-sm"
            version="v1.4"
            showVersion={true}
          />

          {/* Right: status + upload */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Live</span>
              <span className="text-slate-300 mx-1">·</span>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Guardrails Active</span>
            </div>
            <button
              onClick={handleResetDemo}
              className="btn btn-ghost btn-xs text-slate-500 hover:text-slate-800"
              title="Reset candidate pool to original demo dataset"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Reset Demo Pool</span>
            </button>
            <button
              onClick={() => setIsUploadOpen(true)}
              className="btn btn-secondary btn-sm"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Candidate</span>
            </button>
          </div>
        </div>

        {/* ─── Tab Nav ─── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-6 overflow-x-auto border-t border-slate-100">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab-link ${isActive ? 'active' : ''}`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'screening' && (
          <ScreeningPipelineTab
            candidates={candidates}
            selectedCandidate={selectedCandidate}
            setSelectedCandidate={setSelectedCandidate}
            onDeleteCandidate={handleDeleteCandidate}
            jobDescription={jobDescription}
            setJobDescription={setJobDescription}
            onRunPipeline={handleRunPipeline}
            screeningResult={screeningResult}
            loadingScreening={loadingScreening}
            onOpenUploadModal={() => setIsUploadOpen(true)}
            apiUrl={API_URL}
          />
        )}
        {activeTab === 'hitl' && (
          <HITLWorkflowTab
            candidates={candidates}
            selectedCandidate={selectedCandidate}
            setSelectedCandidate={setSelectedCandidate}
            onDeleteCandidate={handleDeleteCandidate}
            onHitlDecision={handleHitlDecision}
            loadingHitl={loadingHitl}
            hitlResponse={hitlResponse}
          />
        )}
        {activeTab === 'rag' && <RAGEvaluationTab apiUrl={API_URL} />}
        {activeTab === 'governance' && <GovernanceAuditTab apiUrl={API_URL} />}
      </main>

      {/* ─── Upload Modal ─── */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onCandidateCreated={handleCandidateCreated}
        apiUrl={API_URL}
      />

      {/* ─── Footer ─── */}
      <footer className="border-t border-slate-200 bg-white py-3 px-6 flex items-center justify-between text-[11px] text-slate-400">
        <span>NexusHire AI · AI Systems Engineering Capstone</span>
        <span>Multi-Agent · ChromaDB RAG · GitHub Verification · Module 8 Guardrails</span>
      </footer>
    </div>
  );
}
