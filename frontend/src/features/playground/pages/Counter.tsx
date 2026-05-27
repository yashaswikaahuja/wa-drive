/**
 * Counter — operator's live desk (mock, redesigned).
 * Top navbar layout. Original visual choices.
 */

const navItems = [
  { label: 'Counter', active: true, badge: 6 },
  { label: 'Photo Tool' },
  { label: 'Customers' },
  { label: 'WhatsApp', badge: 12 },
  { label: 'Reports' },
];

const sample = {
  pinned: [
    { id: 'p1', name: 'Mohan Das', service: 'Residence Certificate', state: 'photo missing', tone: 'warning', when: '6 min ago' },
  ],
  active: [
    { id: 'a1', name: 'Priya Devi', service: 'SSC CGL', state: 'portal captcha', tone: 'danger', when: '2 min ago' },
    { id: 'a2', name: 'Suresh Ram', service: 'PAN Application', state: 'docs arrived', tone: 'info', when: 'just now' },
    { id: 'a3', name: 'Anjali Patel', service: 'Passport Photo · 8', state: 'ready to print', tone: 'success', when: '4 min ago' },
    { id: 'a4', name: 'Vikash Singh', service: 'Driving Licence', state: 'profile filled', tone: 'neutral', when: '11 min ago' },
  ],
  waiting: [
    { id: 'w1', name: 'Manish Kumar', service: 'Caste Certificate', state: 'awaiting OTP', when: '24 min ago' },
    { id: 'w2', name: 'Geeta Mishra', service: 'Income Certificate', state: 'awaiting bill', when: '47 min ago' },
    { id: 'w3', name: 'Rajan Lal', service: 'Voter ID Update', state: 'awaiting Aadhaar', when: '1 hr ago' },
  ],
};

const focused = {
  customer: 'Mohan Das',
  phone: '+91 90123 45678',
  service: 'Bihar Residence Certificate',
  cost: 150,
  status: 'photo missing',
  modules: [
    { key: 'docs', label: 'Documents', state: 'done', summary: '4 of 4 received', items: ['Aadhaar', 'Voter ID', 'Electricity bill', 'Self-declaration'] },
    { key: 'profile', label: 'Profile', state: 'done', summary: 'Mohan Das · 14 Aug 1996 · Patna' },
    { key: 'photo', label: 'Photo', state: 'pending', summary: 'Asked customer 6 min ago via WhatsApp' },
    { key: 'portal', label: 'Portal', state: 'idle', summary: 'serviceonline.bihar.gov.in' },
    { key: 'submit', label: 'Submission', state: 'idle', summary: 'Pending portal step' },
  ],
  recent: [
    { time: 'Just now', text: 'Photo request sent to customer' },
    { time: '14:25', text: 'Profile auto-filled from Aadhaar' },
    { time: '14:22', text: 'Aadhaar (back) received' },
    { time: '14:18', text: 'Work item created' },
  ],
};

const intake = [
  { who: 'Mohan Das', file: 'IMG-WA341.jpg', kind: 'photo', size: '1.2 MB', match: 'Mohan · Residence Cert', when: 'now' },
  { who: 'Priya Devi', file: 'marksheet.pdf', kind: 'pdf', size: '612 KB', match: 'Priya · SSC CGL', when: '1m' },
  { who: 'Suresh Ram', file: 'aadhaar-back.jpg', kind: 'photo', size: '184 KB', match: null, when: '2m' },
  { who: '+91 70021 88475', file: 'bill-may.pdf', kind: 'pdf', size: '92 KB', unknown: true, when: '5m' },
  { who: 'Anjali Patel', file: 'photo.jpg', kind: 'photo', size: '320 KB', match: 'Anjali · Photo · 8', when: '7m' },
];

// ── Component ─────────────────────────────────────────────────────────────

export default function CounterMock() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--cc-bg)', color: 'var(--cc-text)', fontFamily: 'Inter, system-ui' }}>
      {/* Top navbar */}
      <nav className="flex items-center px-6 h-14 shrink-0" style={{ background: 'var(--cc-surface)', borderBottom: '1px solid var(--cc-border)' }}>
        <div className="flex items-center gap-2 mr-8">
          <div className="w-7 h-7 rounded grid place-items-center text-white text-xs font-semibold" style={{ background: 'var(--cc-primary)' }}>C</div>
          <span className="text-sm font-semibold">CyberControl</span>
        </div>
        <div className="flex items-center gap-1">
          {navItems.map(item => (
            <a
              key={item.label}
              className="px-3 py-1.5 text-sm rounded cursor-pointer flex items-center gap-2"
              style={{
                background: item.active ? 'var(--cc-primary-soft)' : 'transparent',
                color: item.active ? 'var(--cc-primary)' : 'var(--cc-text-secondary)',
                fontWeight: item.active ? 500 : 400,
              }}
            >
              {item.label}
              {item.badge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: item.active ? 'var(--cc-primary)' : 'var(--cc-surface-hover)', color: item.active ? '#fff' : 'var(--cc-text-secondary)' }}>
                  {item.badge}
                </span>
              )}
            </a>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <StatusDot label="Internet" ok />
          <StatusDot label="Printer" ok />
          <StatusDot label="WhatsApp" ok />
          <div className="w-px h-6 mx-2" style={{ background: 'var(--cc-border)' }} />
          <a className="text-sm cursor-pointer" style={{ color: 'var(--cc-text-secondary)' }}>Settings</a>
          <div className="w-8 h-8 rounded-full grid place-items-center text-sm font-medium ml-1" style={{ background: 'var(--cc-primary-soft)', color: 'var(--cc-primary)' }}>Y</div>
        </div>
      </nav>

      {/* Toolbar — search + KPIs */}
      <div className="flex items-center justify-between px-6 py-3 shrink-0" style={{ background: 'var(--cc-surface)', borderBottom: '1px solid var(--cc-border)' }}>
        <div className="flex items-center gap-2 flex-1 max-w-xl">
          <input
            placeholder="Search customer, service, document, ARN…"
            className="flex-1 px-3 py-2 text-sm rounded outline-none"
            style={{ background: 'var(--cc-bg)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
          />
          <span className="text-[10px] px-2 py-1 rounded font-medium" style={{ background: 'var(--cc-surface-hover)', color: 'var(--cc-text-secondary)' }}>⌘ K</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-[10px] font-medium uppercase" style={{ color: 'var(--cc-text-tertiary)', letterSpacing: '0.06em' }}>Today</div>
            <div className="text-sm font-semibold tabular-nums">₹4,260 <span className="font-normal" style={{ color: 'var(--cc-text-secondary)' }}>· 31 done</span></div>
          </div>
          <button className="px-4 py-2 rounded text-sm font-medium text-white" style={{ background: 'var(--cc-primary)' }}>+ New service</button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Workstack */}
        <section className="w-96 flex flex-col overflow-hidden p-4 gap-3" style={{ background: 'var(--cc-bg)' }}>
          <Bucket title="Pinned" count={sample.pinned.length} icon="📌">
            {sample.pinned.map(item => <Row key={item.id} item={item} selected />)}
          </Bucket>
          <Bucket title="Active" count={sample.active.length}>
            {sample.active.map(item => <Row key={item.id} item={item} />)}
          </Bucket>
          <Bucket title="Waiting" count={sample.waiting.length} muted>
            {sample.waiting.map(item => <Row key={item.id} item={item} muted />)}
          </Bucket>
        </section>

        {/* Current work */}
        <section className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--cc-bg)' }}>
          <div className="rounded-lg overflow-hidden" style={{ background: 'var(--cc-surface)', border: '1px solid var(--cc-border)' }}>
            {/* Work header */}
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--cc-border)' }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-medium uppercase" style={{ color: 'var(--cc-text-tertiary)', letterSpacing: '0.06em' }}>{focused.service}</div>
                  <div className="text-xl font-semibold mt-1">{focused.customer}</div>
                  <div className="text-sm mt-0.5" style={{ color: 'var(--cc-text-secondary)' }}>{focused.phone}</div>
                </div>
                <div className="text-right">
                  <span className="text-xs px-2 py-1 rounded font-medium" style={{ background: 'var(--cc-warning-soft)', color: 'var(--cc-warning)' }}>⏳ {focused.status}</span>
                  <div className="text-xs mt-2" style={{ color: 'var(--cc-text-tertiary)' }}>Charge ₹{focused.cost}</div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Action primary>Prepare photo</Action>
                <Action>Open portal</Action>
                <Action>WhatsApp customer</Action>
                <Action subtle>Pause</Action>
              </div>
            </div>

            {/* Modules */}
            <div className="px-6 py-2">
              {focused.modules.map(m => <Module key={m.key} m={m} />)}
            </div>

            {/* Inline activity */}
            <div className="px-6 py-4" style={{ borderTop: '1px solid var(--cc-border)' }}>
              <div className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--cc-text-tertiary)', letterSpacing: '0.06em' }}>Recent activity</div>
              <div className="space-y-2">
                {focused.recent.map((e, i) => (
                  <div key={i} className="text-xs flex gap-4">
                    <div className="font-medium tabular-nums shrink-0" style={{ color: 'var(--cc-text-tertiary)', minWidth: 60 }}>{e.time}</div>
                    <div>{e.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* WhatsApp intake — bottom drawer */}
      <div className="shrink-0" style={{ background: 'var(--cc-surface)', borderTop: '1px solid var(--cc-border)' }}>
        <div className="flex items-center justify-between px-6 py-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold">WhatsApp intake</span>
            <span style={{ color: 'var(--cc-text-tertiary)' }}>{intake.length} new</span>
          </div>
          <a className="text-xs cursor-pointer" style={{ color: 'var(--cc-primary)' }}>Open chat ↗</a>
        </div>
        <div className="px-6 pb-4 flex gap-3 overflow-x-auto">
          {intake.map((it, i) => <IntakeCard key={i} it={it} />)}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatusDot({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs" title={label}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: ok ? 'var(--cc-success)' : 'var(--cc-danger)' }} />
      <span style={{ color: 'var(--cc-text-secondary)' }}>{label}</span>
    </div>
  );
}

function Bucket({ title, count, icon, muted, children }: any) {
  return (
    <div>
      <div className="flex items-center gap-2 px-1 mb-1.5">
        {icon && <span>{icon}</span>}
        <div className="text-[10px] font-semibold uppercase" style={{ color: muted ? 'var(--cc-text-tertiary)' : 'var(--cc-text-secondary)', letterSpacing: '0.08em' }}>
          {title}
        </div>
        <span className="text-[10px] tabular-nums px-1.5 rounded" style={{ background: 'var(--cc-surface-hover)', color: 'var(--cc-text-secondary)' }}>{count}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ item, selected, muted }: any) {
  const toneMap: Record<string, string> = {
    success: 'var(--cc-success)',
    danger: 'var(--cc-danger)',
    warning: 'var(--cc-warning)',
    info: 'var(--cc-info)',
    neutral: 'var(--cc-text-secondary)',
  };
  return (
    <div
      className="px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
      style={{
        background: selected ? 'var(--cc-surface)' : 'var(--cc-surface)',
        border: selected ? '1.5px solid var(--cc-primary)' : '1px solid var(--cc-border)',
        opacity: muted ? 0.75 : 1,
      }}
    >
      <div className="flex justify-between items-center">
        <div className="text-sm font-medium truncate" style={{ color: muted ? 'var(--cc-text-secondary)' : 'var(--cc-text)' }}>{item.name}</div>
        <div className="text-[10px] tabular-nums shrink-0 ml-2" style={{ color: 'var(--cc-text-tertiary)' }}>{item.when}</div>
      </div>
      <div className="flex justify-between items-center mt-1">
        <div className="text-xs truncate" style={{ color: 'var(--cc-text-secondary)' }}>{item.service}</div>
        <div className="text-[10px] font-medium shrink-0 ml-2" style={{ color: item.tone ? toneMap[item.tone] : 'var(--cc-text-tertiary)' }}>
          {item.state}
        </div>
      </div>
    </div>
  );
}

function Action({ children, primary, subtle }: any) {
  return (
    <button
      className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
      style={
        primary
          ? { background: 'var(--cc-primary)', color: '#fff' }
          : subtle
          ? { background: 'transparent', color: 'var(--cc-text-secondary)' }
          : { background: 'var(--cc-surface)', color: 'var(--cc-text)', border: '1px solid var(--cc-border)' }
      }
    >
      {children}
    </button>
  );
}

function Module({ m }: { m: any }) {
  const stateMap: Record<string, { color: string; bg: string; mark: string }> = {
    done: { color: 'var(--cc-success)', bg: 'var(--cc-success-soft)', mark: '✓' },
    pending: { color: 'var(--cc-warning)', bg: 'var(--cc-warning-soft)', mark: '⏳' },
    idle: { color: 'var(--cc-text-tertiary)', bg: 'var(--cc-surface-hover)', mark: '·' },
  };
  const s = stateMap[m.state];
  return (
    <div className="flex items-start gap-4 py-3" style={{ borderBottom: '1px dashed var(--cc-border)' }}>
      <div className="w-7 h-7 rounded-full grid place-items-center text-xs font-semibold shrink-0" style={{ background: s.bg, color: s.color }}>
        {s.mark}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium">{m.label}</div>
          <div className="text-xs" style={{ color: 'var(--cc-text-tertiary)' }}>{m.summary}</div>
        </div>
        {m.items && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {m.items.map((d: string, i: number) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded" style={{ background: 'var(--cc-bg)', color: 'var(--cc-text-secondary)' }}>{d}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IntakeCard({ it }: { it: any }) {
  return (
    <div className="rounded-lg p-3 shrink-0 w-72" style={{ background: 'var(--cc-bg)', border: '1px solid var(--cc-border)' }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded grid place-items-center" style={{ background: it.unknown ? 'var(--cc-warning-soft)' : 'var(--cc-primary-soft)', color: it.unknown ? 'var(--cc-warning)' : 'var(--cc-primary)' }}>
          {it.kind === 'pdf' ? '📄' : '📷'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{it.who}</div>
          <div className="text-[10px] truncate" style={{ color: 'var(--cc-text-tertiary)' }}>{it.file} · {it.size}</div>
        </div>
        <div className="text-[10px] shrink-0" style={{ color: 'var(--cc-text-tertiary)' }}>{it.when}</div>
      </div>
      {it.match && <div className="text-[10px] px-2 py-1 rounded mb-2" style={{ background: 'var(--cc-success-soft)', color: 'var(--cc-success)' }}>→ {it.match}</div>}
      {it.unknown && <div className="text-[10px] px-2 py-1 rounded mb-2" style={{ background: 'var(--cc-warning-soft)', color: 'var(--cc-warning)' }}>Unknown sender — link to customer</div>}
      <div className="flex gap-1">
        <button className="flex-1 text-[11px] py-1 rounded" style={{ background: 'var(--cc-surface)', border: '1px solid var(--cc-border)' }}>Print</button>
        <button className="flex-1 text-[11px] py-1 rounded" style={{ background: 'var(--cc-surface)', border: '1px solid var(--cc-border)' }}>Save</button>
        <button className="flex-1 text-[11px] py-1 rounded text-white" style={{ background: 'var(--cc-primary)' }}>Attach</button>
      </div>
    </div>
  );
}
