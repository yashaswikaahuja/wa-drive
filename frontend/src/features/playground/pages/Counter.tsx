/**
 * Counter — operator's live desk (mock).
 * Original interpretation of the redesign spec. No real data.
 */

import { Link } from 'react-router-dom';

// ── Sample data ──────────────────────────────────────────────────────────
const workstack = {
  pinned: [
    { code: 'WX-2841', initials: 'SK', name: 'Sharma Kumar', service: 'Bihar Residence Cert', status: 'photo wait', ago: 'now' },
  ],
  active: [
    { code: 'WX-2840', initials: 'AS', name: 'Anita Singh', service: 'SSC CGL Form', status: 'portal retry', ago: '2 min', danger: true },
    { code: 'WX-2839', initials: 'RY', name: 'Ravi Yadav', service: 'PAN Application', status: 'new docs', ago: '4 min', highlight: true },
    { code: 'WX-2838', initials: 'PK', name: 'Pooja Kumari', service: 'Photo · 8 copies', status: 'ready to print', ago: '5 min', success: true },
    { code: 'WX-2836', initials: 'MI', name: 'Mohd. Imran', service: 'DL Renewal', status: 'profile filled', ago: '12 min' },
  ],
  waiting: [
    { code: 'WX-2835', initials: 'SD', name: 'Sunita Devi', service: 'Ration Card', status: 'awaiting Aadhaar back', ago: '26 min' },
    { code: 'WX-2834', initials: 'PT', name: 'Patel Singh', service: 'Caste Cert', status: 'awaiting bill', ago: '1 hr' },
    { code: 'WX-2833', initials: 'YV', name: 'Yadav Sharma', service: 'Income Cert', status: 'awaiting OTP', ago: '2 hr' },
  ],
};

const intake = [
  { who: 'Sharma Kumar', kind: 'photo', file: 'IMG-WA0341.jpg', size: '1.2 MB', ago: 'now', auto: 'Niwas Cert' },
  { who: 'Anita Singh',  kind: 'pdf',   file: 'ssc-marksheet.pdf', size: '612 KB', ago: '1m', auto: 'SSC CGL Form' },
  { who: 'Ravi Yadav',   kind: 'photo', file: 'aadhaar-back.jpg', size: '184 KB', ago: '2m', auto: null },
  { who: '+91 70021…', kind: 'pdf',   file: 'BSPHCL-may.pdf', size: '92 KB',  ago: '5m', unmatched: true },
  { who: 'Mohd. Imran',  kind: 'photo', file: 'DL-front.jpg', size: '740 KB', ago: '12m', auto: 'DL Renewal' },
];

const currentWork = {
  code: 'WX-2841',
  customer: 'Sharma Kumar',
  phone: '+91 98765 12340',
  service: 'Bihar Residence Certificate',
  cost: 150,
  status: 'waiting for photo',
  modules: [
    { id: 'docs',    label: 'Documents',  state: 'complete', detail: '4 of 4 ready', items: ['Aadhaar (front+back)', 'Voter ID', 'Electricity bill', 'Self-declaration'] },
    { id: 'profile', label: 'Profile',    state: 'complete', detail: 'verified', summary: 'Rahul Sharma · 14 Aug 1996 · Patna' },
    { id: 'photo',   label: 'Photo',      state: 'pending',  detail: '35×45mm · ≤50 KB', summary: 'Asked customer 6 min ago · WhatsApp delivered' },
    { id: 'portal',  label: 'Portal',     state: 'idle',     detail: 'serviceonline.bihar.gov.in', summary: 'Form not started' },
    { id: 'submit',  label: 'Submission', state: 'idle',     detail: 'awaits portal', summary: '' },
  ],
  activity: [
    { time: '14:32', text: 'Customer opened WhatsApp link' },
    { time: '14:25', text: 'Profile auto-filled from Aadhaar' },
    { time: '14:22', text: 'Aadhaar back uploaded by Sharma' },
    { time: '14:20', text: 'Aadhaar front uploaded by Sharma' },
    { time: '14:18', text: 'Work item created' },
  ],
};

const navItems = [
  { icon: '🪑', label: 'Counter', badge: '8', active: true },
  { icon: '📷', label: 'Photo Tool' },
  { icon: '👥', label: 'Customers' },
  { icon: '💬', label: 'WhatsApp', badge: '12' },
  { icon: '📊', label: 'Reports' },
  { icon: '⚙', label: 'Settings' },
];

// ── Component ─────────────────────────────────────────────────────────────

export default function CounterMock() {
  return (
    <div className="flex h-screen" style={{ background: 'var(--cc-bg)', color: 'var(--cc-text)', fontFamily: 'Inter, system-ui' }}>
      {/* Sidebar */}
      <aside className="w-60 flex flex-col" style={{ background: 'var(--cc-surface)', borderRight: '1px solid var(--cc-border)' }}>
        <div className="px-5 py-5">
          <div className="text-base font-semibold">CyberControl</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--cc-text-tertiary)' }}>Counter · Patna East</div>
        </div>
        <nav className="px-2 flex-1">
          <div className="text-[10px] uppercase tracking-wider px-3 py-2" style={{ color: 'var(--cc-text-tertiary)', letterSpacing: '0.04em' }}>Workspace</div>
          {navItems.map((it, i) => (
            <a
              key={i}
              className="flex items-center gap-3 px-3 py-2 rounded text-sm cursor-pointer"
              style={{
                background: it.active ? 'var(--cc-primary-soft)' : 'transparent',
                color: it.active ? 'var(--cc-primary)' : 'var(--cc-text)',
                fontWeight: it.active ? 500 : 400,
              }}
            >
              <span className="text-base">{it.icon}</span>
              <span className="flex-1">{it.label}</span>
              {it.badge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: it.active ? 'var(--cc-primary)' : 'var(--cc-surface-hover)', color: it.active ? '#fff' : 'var(--cc-text-secondary)' }}>
                  {it.badge}
                </span>
              )}
            </a>
          ))}
          <div className="text-[10px] uppercase tracking-wider px-3 py-2 mt-4" style={{ color: 'var(--cc-text-tertiary)', letterSpacing: '0.04em' }}>System</div>
          <div className="px-3 py-1.5 text-xs flex justify-between"><span style={{ color: 'var(--cc-text-secondary)' }}>Network</span><span style={{ color: 'var(--cc-success)' }}>● 42ms</span></div>
          <div className="px-3 py-1.5 text-xs flex justify-between"><span style={{ color: 'var(--cc-text-secondary)' }}>Printer</span><span>HP M1136</span></div>
          <div className="px-3 py-1.5 text-xs flex justify-between"><span style={{ color: 'var(--cc-text-secondary)' }}>WhatsApp</span><span style={{ color: 'var(--cc-success)' }}>● Live</span></div>
        </nav>
        <div className="border-t p-4" style={{ borderColor: 'var(--cc-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold" style={{ background: 'var(--cc-primary-soft)', color: 'var(--cc-primary)' }}>RK</div>
            <div className="flex-1 text-xs">
              <div className="font-medium" style={{ color: 'var(--cc-text)' }}>Rahul Kumar</div>
              <div style={{ color: 'var(--cc-text-tertiary)' }}>Operator · 09:00–21:00</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-3" style={{ background: 'var(--cc-surface)', borderBottom: '1px solid var(--cc-border)' }}>
          <div className="flex items-center gap-3 flex-1 max-w-2xl">
            <input
              placeholder="Search customers, work items, ARN, documents…"
              className="flex-1 px-3 py-2 text-sm outline-none rounded"
              style={{ background: 'var(--cc-bg)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
            />
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--cc-surface-hover)', color: 'var(--cc-text-secondary)' }}>Ctrl K</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-sm">
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--cc-text-tertiary)', letterSpacing: '0.04em' }}>Today</div>
              <div className="font-semibold">₹4,260 <span className="text-xs font-normal" style={{ color: 'var(--cc-text-secondary)' }}>· 31 jobs</span></div>
            </div>
            <button className="px-3 py-1.5 rounded text-sm font-medium text-white" style={{ background: 'var(--cc-primary)' }}>+ New service</button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Workstack column */}
          <section className="w-80 flex flex-col overflow-hidden" style={{ borderRight: '1px solid var(--cc-border)', background: 'var(--cc-surface)' }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--cc-border)' }}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Workstack</h2>
                <span className="text-xs" style={{ color: 'var(--cc-text-secondary)' }}>{workstack.pinned.length + workstack.active.length + workstack.waiting.length} items</span>
              </div>
              <div className="flex gap-2 mt-3">
                <span className="text-[10px] px-2 py-1 rounded font-medium" style={{ background: 'var(--cc-warning-soft)', color: 'var(--cc-warning)' }}>RETRY 1</span>
                <span className="text-[10px] px-2 py-1 rounded font-medium" style={{ background: 'var(--cc-success-soft)', color: 'var(--cc-success)' }}>READY 1</span>
                <span className="text-[10px] px-2 py-1 rounded font-medium" style={{ background: 'var(--cc-surface-hover)', color: 'var(--cc-text-secondary)' }}>WAITING {workstack.waiting.length}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Group title={`📌 Pinned · ${workstack.pinned.length}`} items={workstack.pinned} selected="WX-2841" />
              <Group title={`Active · ${workstack.active.length}`} items={workstack.active} selected="WX-2841" />
              <Group title={`Waiting · ${workstack.waiting.length}`} items={workstack.waiting} selected="WX-2841" muted />
            </div>
          </section>

          {/* Current work + intake column */}
          <section className="flex-1 flex flex-col overflow-hidden">
            {/* Current work */}
            <div className="flex-1 overflow-y-auto px-8 py-6" style={{ background: 'var(--cc-bg)' }}>
              <div className="flex items-start justify-between mb-5">
                <div>
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--cc-text-tertiary)' }}>
                    <span>{currentWork.code}</span>
                    <span>·</span>
                    <span>opened 14:18 · 14 min</span>
                  </div>
                  <h1 className="text-xl font-semibold mt-1">{currentWork.customer}</h1>
                  <div className="text-sm mt-0.5" style={{ color: 'var(--cc-text-secondary)' }}>
                    {currentWork.service} · {currentWork.phone}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-1 rounded font-medium" style={{ background: 'var(--cc-warning-soft)', color: 'var(--cc-warning)' }}>⏳ {currentWork.status}</span>
                  <button className="px-3 py-1.5 text-xs rounded" style={{ background: 'var(--cc-surface)', border: '1px solid var(--cc-border)' }}>Open full view</button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                  {currentWork.modules.map(m => <Module key={m.id} m={m} />)}
                </div>
                <aside>
                  <div className="rounded p-4" style={{ background: 'var(--cc-surface)', border: '1px solid var(--cc-border)' }}>
                    <div className="text-xs font-semibold mb-3" style={{ color: 'var(--cc-text-secondary)' }}>ACTIVITY</div>
                    <div className="space-y-2.5">
                      {currentWork.activity.map((a, i) => (
                        <div key={i} className="flex gap-3 text-xs">
                          <div className="font-medium tabular-nums" style={{ color: 'var(--cc-text-tertiary)', minWidth: 36 }}>{a.time}</div>
                          <div style={{ color: 'var(--cc-text)' }}>{a.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded p-4 mt-3" style={{ background: 'var(--cc-surface)', border: '1px solid var(--cc-border)' }}>
                    <div className="text-xs font-semibold mb-2" style={{ color: 'var(--cc-text-secondary)' }}>NOTES</div>
                    <div className="text-sm">Customer needs by 5 PM tomorrow</div>
                    <div className="text-xs mt-3 flex justify-between" style={{ color: 'var(--cc-text-tertiary)' }}>
                      <span>Cost</span>
                      <span className="font-semibold" style={{ color: 'var(--cc-text)' }}>₹{currentWork.cost}</span>
                    </div>
                  </div>
                </aside>
              </div>
            </div>

            {/* WhatsApp intake — bottom strip */}
            <div className="border-t" style={{ background: 'var(--cc-surface)', borderColor: 'var(--cc-border)' }}>
              <div className="px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold">💬 WhatsApp Intake</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--cc-success-soft)', color: 'var(--cc-success)' }}>● connected</span>
                  <span className="text-xs" style={{ color: 'var(--cc-text-secondary)' }}>{intake.length} unhandled</span>
                </div>
                <a className="text-xs cursor-pointer" style={{ color: 'var(--cc-primary)' }}>Open WhatsApp →</a>
              </div>
              <div className="px-6 pb-3 flex gap-2 overflow-x-auto">
                {intake.map((it, i) => <IntakeCard key={i} it={it} />)}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function Group({ title, items, selected, muted }: { title: string; items: any[]; selected: string; muted?: boolean }) {
  return (
    <div className="py-2">
      <div className="px-5 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--cc-text-tertiary)', letterSpacing: '0.04em' }}>{title}</div>
      {items.map(it => {
        const isSelected = it.code === selected;
        return (
          <div
            key={it.code}
            className="px-5 py-2.5 cursor-pointer flex items-center gap-3"
            style={{
              background: isSelected ? 'var(--cc-primary-soft)' : 'transparent',
              borderLeft: isSelected ? '3px solid var(--cc-primary)' : '3px solid transparent',
            }}
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold" style={{ background: 'var(--cc-surface-hover)', color: 'var(--cc-text-secondary)' }}>
              {it.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="text-sm truncate" style={{ fontWeight: isSelected ? 500 : 400, color: muted ? 'var(--cc-text-secondary)' : 'var(--cc-text)' }}>{it.name}</div>
                <div className="text-[10px]" style={{ color: 'var(--cc-text-tertiary)' }}>{it.ago}</div>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="text-[11px] truncate flex-1" style={{ color: 'var(--cc-text-secondary)' }}>{it.service}</div>
                <div className="text-[10px]" style={{ color: it.danger ? 'var(--cc-danger)' : it.success ? 'var(--cc-success)' : it.highlight ? 'var(--cc-info)' : 'var(--cc-text-tertiary)' }}>
                  {it.status}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Module({ m }: { m: any }) {
  const stateMap: Record<string, { color: string; bg: string; icon: string; label: string }> = {
    complete: { color: 'var(--cc-success)', bg: 'var(--cc-success-soft)', icon: '✓', label: 'complete' },
    pending:  { color: 'var(--cc-warning)', bg: 'var(--cc-warning-soft)', icon: '⏳', label: 'pending' },
    idle:     { color: 'var(--cc-text-tertiary)', bg: 'var(--cc-surface-hover)', icon: '○', label: 'not started' },
  };
  const s = stateMap[m.state];
  return (
    <div className="rounded p-4" style={{ background: 'var(--cc-surface)', border: '1px solid var(--cc-border)' }}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold" style={{ color: s.color }}>{s.icon}</span>
          <div>
            <div className="text-sm font-medium">{m.label}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--cc-text-secondary)' }}>{m.detail}</div>
          </div>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: s.bg, color: s.color }}>{s.label}</span>
      </div>
      {m.summary && <div className="text-xs mt-2 ml-6" style={{ color: 'var(--cc-text-secondary)' }}>{m.summary}</div>}
      {m.items && (
        <div className="mt-3 ml-6 grid grid-cols-2 gap-1">
          {m.items.map((d: string, i: number) => (
            <div key={i} className="text-xs flex items-center gap-2" style={{ color: 'var(--cc-text-secondary)' }}>
              <span style={{ color: 'var(--cc-success)' }}>✓</span>{d}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IntakeCard({ it }: { it: any }) {
  return (
    <div className="rounded p-3 flex-shrink-0 w-72" style={{ background: 'var(--cc-bg)', border: '1px solid var(--cc-border)' }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded flex items-center justify-center text-xs" style={{ background: it.unmatched ? 'var(--cc-warning-soft)' : 'var(--cc-primary-soft)', color: it.unmatched ? 'var(--cc-warning)' : 'var(--cc-primary)' }}>
            {it.kind === 'pdf' ? '📄' : '📷'}
          </div>
          <div className="text-xs font-medium truncate">{it.who}</div>
        </div>
        <div className="text-[10px]" style={{ color: 'var(--cc-text-tertiary)' }}>{it.ago}</div>
      </div>
      <div className="text-[11px] truncate" style={{ color: 'var(--cc-text-secondary)' }}>{it.file}</div>
      <div className="text-[10px]" style={{ color: 'var(--cc-text-tertiary)' }}>{it.size}</div>
      <div className="mt-2 flex gap-1.5 items-center">
        {it.auto && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--cc-success-soft)', color: 'var(--cc-success)' }}>→ {it.auto}</span>}
        {it.unmatched && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--cc-warning-soft)', color: 'var(--cc-warning)' }}>unmatched</span>}
        <div className="ml-auto flex gap-1">
          <button className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--cc-surface)', border: '1px solid var(--cc-border)' }}>🖨</button>
          <button className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--cc-surface)', border: '1px solid var(--cc-border)' }}>⬇</button>
          <button className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--cc-primary)', color: '#fff' }}>📌</button>
        </div>
      </div>
    </div>
  );
}
