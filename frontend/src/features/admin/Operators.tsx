/**
 * Operators — admin-only workspace user management.
 * Lists workspace users and lets an admin add operators/admins, reset passwords,
 * suspend/reactivate, change role, and remove members. Backed by /api/users
 * (which enforces the same guards server-side: no self role/status change, no
 * removing the last active admin). Reached only via the admin route guard.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { UserPlus, Trash, ShieldStar, User as UserIcon, DotsThreeVertical, Key } from '@phosphor-icons/react';
import api from '../../shared/api';
import { toast } from '../../shared/toast';
import PageHeader from '../../shared/PageHeader';
import { useAuthStore } from '../auth/store';
import { useFocusTrap } from '../../shared/useFocusTrap';

interface WsUser {
  id: string; name: string | null; email: string | null; phone: string | null;
  role: 'admin' | 'operator'; status: 'active' | 'suspended'; createdAt: string;
}

export default function Operators() {
  const meId = useAuthStore(s => s.user?.id);
  const [users, setUsers] = useState<WsUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [confirm, setConfirm] = useState<WsUser | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/users').then(r => setUsers(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function patch(u: WsUser, body: Record<string, unknown>, okMsg: string) {
    try { await api.patch(`/users/${u.id}`, body); toast.success(okMsg); load(); }
    catch { /* interceptor toasts */ }
    finally { setMenuFor(null); }
  }

  async function remove(u: WsUser) {
    try { await api.delete(`/users/${u.id}`); toast.success('Member removed'); load(); }
    catch { /* interceptor toasts */ }
    finally { setConfirm(null); }
  }

  async function resetPassword(u: WsUser) {
    const pw = window.prompt(`New password for ${u.name || u.email || u.phone} (min 8 chars):`);
    if (pw == null) return;
    if (pw.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    patch(u, { password: pw }, 'Password reset');
  }

  return (
    <div onClick={() => setMenuFor(null)}>
      <PageHeader
        title="Operators"
        subtitle="People who can sign in to this workspace"
        actions={
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
            <UserPlus size={16} weight="bold" /> Add member
          </button>
        }
      />

      {loading ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[68px] rounded-2xl" style={{ background: 'hsl(var(--pt-secondary) / 0.6)' }} />)}
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 px-4">
          <UserIcon size={34} className="pt-muted mb-3" />
          <p className="text-sm font-medium" style={{ color: 'hsl(var(--pt-ink))' }}>No members yet</p>
          <p className="text-xs pt-muted mt-1 max-w-xs">Add operators so your staff can sign in with their own phone or email.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map(u => {
            const isMe = u.id === meId;
            const suspended = u.status === 'suspended';
            return (
              <div key={u.id} className="card p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-semibold shrink-0"
                  style={{ background: 'hsl(var(--pt-marigold) / 0.15)', color: 'hsl(var(--pt-marigold-deep))' }}>
                  {(u.name || u.email || u.phone || '?')[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate" style={{ color: 'hsl(var(--pt-ink))' }}>{u.name || u.email || u.phone}</span>
                    {isMe && <span className="text-[10px] pt-muted">(you)</span>}
                    <span className={`badge ${u.role === 'admin' ? 'badge-info' : ''} flex items-center gap-1`}>
                      {u.role === 'admin' ? <ShieldStar size={11} weight="fill" /> : <UserIcon size={11} />}{u.role}
                    </span>
                    {suspended && <span className="badge badge-danger">suspended</span>}
                  </div>
                  <p className="text-xs pt-muted truncate mt-0.5">
                    {[u.email, u.phone].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>

                {!isMe && (
                  <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setMenuFor(menuFor === u.id ? null : u.id)}
                      className="pt-toolbtn" aria-label="Member actions" title="Actions">
                      <DotsThreeVertical size={18} weight="bold" />
                    </button>
                    {menuFor === u.id && (
                      <div className="absolute right-0 mt-1 w-48 rounded-xl border shadow-lg z-20 py-1 text-sm"
                        style={{ background: 'hsl(var(--pt-card))', borderColor: 'hsl(var(--pt-border))' }}>
                        <MenuItem icon={<ShieldStar size={15} />} label={u.role === 'admin' ? 'Make operator' : 'Make admin'}
                          onClick={() => patch(u, { role: u.role === 'admin' ? 'operator' : 'admin' }, 'Role updated')} />
                        <MenuItem icon={<UserIcon size={15} />} label={suspended ? 'Reactivate' : 'Suspend'}
                          onClick={() => patch(u, { status: suspended ? 'active' : 'suspended' }, suspended ? 'Reactivated' : 'Suspended')} />
                        <MenuItem icon={<Key size={15} />} label="Reset password" onClick={() => { setMenuFor(null); resetPassword(u); }} />
                        <MenuItem icon={<Trash size={15} />} label="Remove" danger onClick={() => { setMenuFor(null); setConfirm(u); }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <CreateMemberDialog onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
      {confirm && (
        <ConfirmDialog
          title={`Remove ${confirm.name || confirm.email || confirm.phone}?`}
          body="They will no longer be able to sign in. This can't be undone from here."
          confirmLabel="Remove"
          onCancel={() => setConfirm(null)}
          onConfirm={() => remove(confirm)}
        />
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[hsl(var(--pt-secondary))]"
      style={{ color: danger ? 'hsl(0 65% 48%)' : 'hsl(var(--pt-ink))' }}>
      {icon}{label}
    </button>
  );
}

function CreateMemberDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onClose);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'operator' | 'admin'>('operator');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email && !phone) { setError('Enter an email or phone'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setBusy(true); setError('');
    try {
      await api.post('/users', { name, email: email || undefined, phone: phone || undefined, password, role });
      toast.success('Member added');
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not add member');
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div ref={ref} onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border shadow-2xl p-6"
        style={{ background: 'hsl(var(--pt-card))', borderColor: 'hsl(var(--pt-border))' }}>
        <h2 className="pt-display text-lg font-bold mb-1" style={{ color: 'hsl(var(--pt-ink))' }}>Add member</h2>
        <p className="text-xs pt-muted mb-4">They sign in with the email or phone and password you set here.</p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="m-name" className="text-xs pt-muted mb-1 block">Name</label>
            <input id="m-name" value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="Ravi Kumar" />
          </div>
          <div>
            <label htmlFor="m-email" className="text-xs pt-muted mb-1 block">Email</label>
            <input id="m-email" type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} className="input-field" placeholder="ravi@example.com" />
          </div>
          <div>
            <label htmlFor="m-phone" className="text-xs pt-muted mb-1 block">Phone</label>
            <input id="m-phone" value={phone} onChange={e => setPhone(e.target.value)} className="input-field" placeholder="9876543210" />
          </div>
          <div>
            <label htmlFor="m-pw" className="text-xs pt-muted mb-1 block">Temporary password</label>
            <input id="m-pw" type="text" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)} className="input-field" placeholder="min 8 characters" />
          </div>
          <div>
            <label htmlFor="m-role" className="text-xs pt-muted mb-1 block">Role</label>
            <select id="m-role" value={role} onChange={e => setRole(e.target.value as 'operator' | 'admin')} className="input-field">
              <option value="operator">Operator — daily work only</option>
              <option value="admin">Admin — full access</option>
            </select>
          </div>
          {error && <p className="text-xs" style={{ color: 'hsl(0 65% 48%)' }}>{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="pt-chip flex-1">Cancel</button>
            <button type="submit" disabled={busy} className="btn-primary flex-1">{busy ? 'Adding…' : 'Add member'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: { title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onCancel);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCancel} role="dialog" aria-modal="true">
      <div ref={ref} onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border shadow-2xl p-6"
        style={{ background: 'hsl(var(--pt-card))', borderColor: 'hsl(var(--pt-border))' }}>
        <h2 className="pt-display text-base font-bold mb-1" style={{ color: 'hsl(var(--pt-ink))' }}>{title}</h2>
        <p className="text-sm pt-muted mb-5">{body}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="pt-chip flex-1">Cancel</button>
          <button onClick={onConfirm} className="flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ background: 'hsl(0 65% 48%)' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
