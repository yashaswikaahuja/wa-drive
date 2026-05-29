import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Briefcase } from '@phosphor-icons/react';
import api from '../../shared/api';

interface Job {
  id: string; status: string; service_type: string; service_label: string;
  service_icon: string; customer_name: string; created_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  queued: 'badge badge-warning',
  in_progress: 'badge badge-info',
  needs_review: 'badge badge-warning',
  completed: 'badge badge-success',
  cancelled: 'badge badge-danger',
  failed: 'badge badge-danger',
};
const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued', in_progress: 'In Progress', needs_review: 'Review Required',
  completed: 'Completed', cancelled: 'Cancelled', failed: 'Failed',
};

export default function Jobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState('');

  const load = () => { api.get(filter ? `/jobs?status=${filter}` : '/jobs').then(r => setJobs(r.data)).catch(() => {}); };
  useEffect(load, [filter]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white tracking-tight">Jobs</h1>
        <button onClick={() => navigate('/app/jobs/new')} className="btn-primary flex items-center gap-1.5">
          <Plus size={16} weight="bold" /> New Job
        </button>
      </div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'queued', 'in_progress', 'needs_review', 'completed'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filter === s ? 'text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
            style={filter === s ? { background: '#0a84ff' } : undefined}>
            {s ? STATUS_LABEL[s] : 'All'}
          </button>
        ))}
      </div>
      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <Briefcase size={32} className="mb-3 text-gray-600" />
          <p className="text-sm">No jobs yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map(j => (
            <div key={j.id} onClick={() => navigate(`/app/jobs/${j.id}`)}
              className="card p-4 cursor-pointer transition-all" style={{ transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}>
              <div className="flex items-center gap-3">
                <span className="text-xl">{j.service_icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{j.customer_name}</p>
                  <p className="text-xs text-gray-500">{j.service_label}</p>
                </div>
                <span className={STATUS_STYLE[j.status] || 'badge'}>
                  {STATUS_LABEL[j.status] || j.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
