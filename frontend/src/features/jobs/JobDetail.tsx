import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import api, { API_URL } from '../../shared/api';
import { extensionBridge } from '../../shared/extensionBridge';

interface JobDetail {
  id: string;
  status: string;
  service_type: string;
  service_label: string;
  service_icon: string;
  customer_name: string;
  customer_phone: string;
  metadata: any;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface ProgressState {
  totalFilled: number;
  totalFailed: number;
  currentField?: string;
  status?: string;
}

const STATUS_STYLE: Record<string, { bg: string; label: string; description: string }> = {
  queued: { bg: 'bg-yellow-500/20 text-yellow-400', label: 'Queued', description: 'Waiting to start' },
  in_progress: { bg: 'bg-blue-500/20 text-blue-400', label: 'In Progress', description: 'Runtime executing' },
  needs_review: { bg: 'bg-orange-500/20 text-orange-400', label: 'Review Required', description: 'Automation completed its part. Human verification required.' },
  completed: { bg: 'bg-green-500/20 text-green-400', label: 'Completed', description: 'Job finished successfully' },
  failed: { bg: 'bg-red-500/20 text-red-400', label: 'Failed', description: 'Runtime could not complete' },
  cancelled: { bg: 'bg-gray-500/20 text-gray-400', label: 'Cancelled', description: 'Operator cancelled' },
};

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [progress, setProgress] = useState<ProgressState>({ totalFilled: 0, totalFailed: 0 });
  const [error, setError] = useState('');
  const socketRef = useRef<Socket | null>(null);

  // Load job details from REST (truth source)
  const loadJob = async () => {
    try {
      const r = await api.get('/jobs');
      const found = r.data.find((j: any) => j.id === id);
      if (!found) { setError('Job not found'); setLoading(false); return; }
      setJob(found);
      setLoading(false);
    } catch (e: any) {
      setError(e.message || 'Failed to load job');
      setLoading(false);
    }
  };

  useEffect(() => { loadJob(); }, [id]);

  // Socket subscription for live progress (acceleration only, not truth)
  useEffect(() => {
    if (!id) return;
    const baseUrl = API_URL.replace('/api', '');
    const socket = io(baseUrl, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on(`job:${id}:dispatched`, (data: any) => {
      setJob(prev => prev ? { ...prev, status: 'in_progress' } : prev);
    });

    socket.on(`job:${id}:progress`, (data: any) => {
      setProgress({
        totalFilled: data.totalFilled || 0,
        totalFailed: data.totalFailed || 0,
        currentField: data.currentField,
        status: data.status,
      });
      // If status transitioned, reload from REST (truth)
      if (data.status) loadJob();
    });

    return () => { socket.disconnect(); };
  }, [id]);

  const handleStart = async () => {
    if (!job || dispatching) return;
    setDispatching(true);
    setError('');
    try {
      // Determine form URL — from job metadata or prompt operator
      let formUrl = job.metadata?.formUrl;
      if (!formUrl) {
        formUrl = prompt('Enter the form URL to fill:');
        if (!formUrl) { setDispatching(false); return; }
        // Save to job metadata so future dispatches don't re-prompt
        try { await api.patch(`/jobs/${job.id}`, { notes: job.notes || '' }); } catch {}
      }
      // Call backend dispatch first to create session + get envelope
      const dispatchResp = await api.post(`/jobs/${job.id}/dispatch`);
      const envelope = { type: 'DISPATCH_JOB', version: '1.0', ...dispatchResp.data.dispatch };
      // Send to extension which opens form + runs runtime
      const result = await extensionBridge.openAndDispatch(envelope, formUrl);
      if (!result.ok) {
        setError('Extension not connected. Make sure CyberControl extension is installed.');
      }
      setTimeout(loadJob, 2000);
    } catch (e: any) {
      setError(e.message || 'Failed to start');
    } finally {
      setDispatching(false);
    }
  };

  const handleComplete = async () => {
    if (!job) return;
    try {
      await api.patch(`/jobs/${job.id}`, { status: 'completed' });
      await loadJob();
    } catch (e: any) { setError(e.message); }
  };

  const handleCancel = async () => {
    if (!job) return;
    if (!confirm('Cancel this job?')) return;
    try {
      await api.patch(`/jobs/${job.id}`, { status: 'cancelled' });
      await loadJob();
    } catch (e: any) { setError(e.message); }
  };

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;
  if (error && !job) return <div className="p-6 text-red-400">{error}</div>;
  if (!job) return null;

  const statusInfo = STATUS_STYLE[job.status] || STATUS_STYLE.queued;
  const isQueued = job.status === 'queued';
  const isInProgress = job.status === 'in_progress';
  const needsReview = job.status === 'needs_review';
  const isDone = job.status === 'completed' || job.status === 'cancelled' || job.status === 'failed';

  return (
    <div className="max-w-3xl">
      {/* Back */}
      <button onClick={() => navigate('/app/jobs')} className="text-xs text-blue-400 mb-4 hover:underline">← Back to Jobs</button>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <span className="text-3xl">{job.service_icon}</span>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">{job.customer_name}</h1>
          <p className="text-sm text-gray-500">{job.service_label} · {job.customer_phone}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusInfo.bg}`}>
          {statusInfo.label}
        </span>
      </div>

      {/* Status Banner — accountability handoff */}
      {needsReview && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-5 mb-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">👁️</span>
            <div>
              <p className="text-sm font-bold text-orange-400 mb-1">Review Required</p>
              <p className="text-xs text-gray-400">Automation completed its part. Please verify the form on the page, make any corrections, and submit when ready.</p>
            </div>
          </div>
        </div>
      )}

      {/* Live Progress (in_progress only) */}
      {isInProgress && (
        <div className="bg-[#0d1220] border border-blue-500/20 rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <p className="text-sm font-medium text-white">Executing</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] text-gray-500 uppercase">Filled</p>
              <p className="text-2xl font-bold text-green-400">{progress.totalFilled}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 uppercase">Failed</p>
              <p className="text-2xl font-bold text-red-400">{progress.totalFailed}</p>
            </div>
          </div>
          {progress.currentField && (
            <p className="text-xs text-gray-400 mt-3 truncate">Current: {progress.currentField}</p>
          )}
        </div>
      )}

      {/* Service Info */}
      <div className="bg-[#0d1220] border border-white/5 rounded-xl p-5 mb-4">
        <h3 className="text-xs font-medium text-gray-500 uppercase mb-3">Service Details</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Service</span><span className="text-white">{job.service_label}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="text-white">{job.customer_name}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Phone</span><span className="text-white">{job.customer_phone}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Status</span><span className="text-white">{statusInfo.description}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Created</span><span className="text-white">{new Date(job.created_at).toLocaleString()}</span></div>
          {job.started_at && <div className="flex justify-between"><span className="text-gray-500">Started</span><span className="text-white">{new Date(job.started_at).toLocaleString()}</span></div>}
          {job.completed_at && <div className="flex justify-between"><span className="text-gray-500">Completed</span><span className="text-white">{new Date(job.completed_at).toLocaleString()}</span></div>}
        </div>
      </div>

      {/* Notes */}
      {job.notes && (
        <div className="bg-[#0d1220] border border-white/5 rounded-xl p-5 mb-4">
          <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Notes</h3>
          <p className="text-sm text-gray-300 whitespace-pre-wrap">{job.notes}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {isQueued && (
          <button onClick={handleStart} disabled={dispatching}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:opacity-50">
            {dispatching ? 'Dispatching...' : '▶ Start Job'}
          </button>
        )}
        {needsReview && (
          <button onClick={handleComplete}
            className="px-5 py-2.5 bg-green-600 text-white rounded-lg font-semibold text-sm hover:bg-green-700">
            ✓ Mark Completed
          </button>
        )}
        {!isDone && (
          <button onClick={handleCancel}
            className="px-5 py-2.5 bg-white/5 text-red-400 rounded-lg text-sm hover:bg-red-500/10">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
