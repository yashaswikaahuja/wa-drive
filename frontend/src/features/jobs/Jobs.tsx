import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../shared/api';

interface Job {
  id: string; status: string; service_type: string; service_label: string;
  service_icon: string; customer_name: string; created_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  queued: 'bg-yellow-500/20 text-yellow-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  needs_review: 'bg-orange-500/20 text-orange-400',
  completed: 'bg-green-500/20 text-green-400',
  cancelled: 'bg-red-500/20 text-red-400',
};
const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued', in_progress: 'In Progress', needs_review: 'Needs Review', completed: 'Completed', cancelled: 'Cancelled',
};

export default function Jobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState('');

  const load = () => { api.get(filter ? `/jobs?status=${filter}` : '/jobs').then(r => setJobs(r.data)).catch(() => {}); };
  useEffect(load, [filter]);

  const update = async (id: string, status: string) => { await api.patch(`/jobs/${id}`, { status }); load(); };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">Jobs</h1>
        <button onClick={() => navigate('/app/jobs/new')} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">+ New Job</button>
      </div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'queued', 'in_progress', 'needs_review', 'completed'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === s ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}>
            {s ? STATUS_LABEL[s] : 'All'}
          </button>
        ))}
      </div>
      {jobs.length === 0 ? (
        <p className="text-center py-12 text-gray-500">No jobs yet</p>
      ) : (
        <div className="space-y-2">
          {jobs.map(j => (
            <div key={j.id} className="bg-[#0d1220] border border-white/5 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <span className="text-xl">{j.service_icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{j.customer_name}</p>
                  <p className="text-xs text-gray-500">{j.service_label}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${STATUS_STYLE[j.status]}`}>{STATUS_LABEL[j.status]}</span>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-white/5">
                {j.status === 'queued' && <Btn onClick={() => update(j.id, 'in_progress')} label="▶ Start" />}
                {j.status === 'in_progress' && <Btn onClick={() => update(j.id, 'needs_review')} label="👁 Review" />}
                {j.status === 'needs_review' && <Btn onClick={() => update(j.id, 'completed')} label="✓ Complete" />}
                {!['completed','cancelled'].includes(j.status) && <Btn onClick={() => update(j.id, 'cancelled')} label="✕ Cancel" red />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Btn({ onClick, label, red }: { onClick: () => void; label: string; red?: boolean }) {
  return <button onClick={onClick} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${red ? 'text-red-400 hover:bg-red-500/10' : 'text-blue-400 hover:bg-blue-500/10'}`}>{label}</button>;
}
