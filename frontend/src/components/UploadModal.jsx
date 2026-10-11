import React, { useState } from 'react';
import { X, Upload, FileText, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

export default function UploadModal({ isOpen, onClose, onCandidateCreated, apiUrl }) {
  const [activeTab, setActiveTab] = useState('paste');
  const [name, setName] = useState('');
  const [github, setGithub] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resultReport, setResultReport] = useState(null);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResultReport(null);
    try {
      const formData = new FormData();
      if (activeTab === 'file' && selectedFile) {
        formData.append('file', selectedFile);
      } else {
        if (!resumeText.trim()) throw new Error('Please enter resume text or choose a file.');
        formData.append('raw_text', resumeText);
      }
      if (name) formData.append('candidate_name', name);
      if (github) formData.append('github_username', github);

      const res = await fetch(`${apiUrl}/api/etl/upload-resume`, { method: 'POST', body: formData });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Upload failed'); }
      const data = await res.json();
      setResultReport(data.etl_report);
      onCandidateCreated(data.candidate);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm fade-in">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden shadow-xl">

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Add Candidate</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">ETL ingestion — extract, validate, and index resume</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-xs p-1.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[80vh] overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {resultReport ? (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                <div className="flex items-center gap-1.5 text-emerald-800 font-semibold text-xs mb-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Ingestion & Validation Successful
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Candidate', value: resultReport.name || 'Candidate' },
                    { label: 'Quality', value: `${resultReport.data_quality_score}/100` },
                    { label: 'Skills', value: `${resultReport.extracted_skills?.length || 0}` },
                    { label: 'Words', value: `${resultReport.word_count}` },
                  ].map(item => (
                    <div key={item.label} className="bg-white p-2.5 rounded border border-slate-200">
                      <p className="section-label mb-0.5">{item.label}</p>
                      <p className="text-xs font-semibold text-slate-900">{item.value}</p>
                    </div>
                  ))}
                </div>
                {resultReport.missing_fields?.length > 0 && (
                  <p className="text-[11px] text-amber-700 mt-2">
                    Missing fields: {resultReport.missing_fields.join(', ')}
                  </p>
                )}
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={() => { setResultReport(null); onClose(); }}
                  className="btn btn-primary">
                  View in Pipeline
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Tab switcher */}
              <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 gap-1">
                {[
                  { id: 'paste', label: 'Paste Text', icon: FileText },
                  { id: 'file', label: 'Upload File', icon: Upload },
                ].map(tab => (
                  <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition flex items-center justify-center gap-1.5 ${
                      activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
                    }`}>
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Name + GitHub */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="section-label block mb-1">Full Name <span className="text-slate-400 normal-case font-normal">(optional)</span></label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Chen" className="input" />
                </div>
                <div>
                  <label className="section-label block mb-1">GitHub Username <span className="text-slate-400 normal-case font-normal">(for verification)</span></label>
                  <input type="text" value={github} onChange={(e) => setGithub(e.target.value)}
                    placeholder="alexchen-ai" className="input" />
                </div>
              </div>

              {/* Resume input */}
              {activeTab === 'paste' ? (
                <div>
                  <label className="section-label block mb-1">Resume / CV Text</label>
                  <textarea rows={7} value={resumeText} onChange={(e) => setResumeText(e.target.value)}
                    placeholder="# Alex Chen&#10;Email: alex@example.com | GitHub: alexchen-ai&#10;&#10;## Summary&#10;Full-Stack AI Engineer…"
                    className="input font-mono text-xs" style={{ padding: '8px 10px', resize: 'vertical' }} required />
                </div>
              ) : (
                <div>
                  <label className="section-label block mb-1">PDF / TXT File</label>
                  <div className="border-2 border-dashed border-slate-200 hover:border-slate-400 rounded-lg p-5 text-center bg-slate-50 transition">
                    <input type="file" accept=".pdf,.txt" onChange={handleFileChange}
                      className="hidden" id="resume-file-input" />
                    <label htmlFor="resume-file-input" className="cursor-pointer block">
                      <div className="w-8 h-8 mx-auto bg-slate-100 rounded-full flex items-center justify-center text-slate-600 mb-2">
                        <Upload className="w-4 h-4" />
                      </div>
                      <p className="text-xs text-slate-700">
                        {selectedFile
                          ? <span className="font-semibold">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                          : 'Click to browse or drag & drop'}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">PDF or TXT · pypdf parser</p>
                    </label>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
                <button type="submit" disabled={loading} className="btn btn-primary">
                  {loading && <Loader2 className="w-3.5 h-3.5 spin" />}
                  {loading ? 'Processing…' : 'Ingest & Validate'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
