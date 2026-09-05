import { useState } from 'react';
import type { Config } from '../api';

interface Props {
  initial: Config;
  error?: string;
  onConnect: (c: Config) => void;
  onCancel?: () => void;
}

export function Setup({ initial, error, onConnect, onCancel }: Props) {
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [key, setKey] = useState(initial.key);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onConnect({ baseUrl: baseUrl.trim(), key: key.trim() });
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <form className="card" onSubmit={submit} style={{ padding: 28, width: '100%', maxWidth: 420 }}>
        <div className="row" style={{ gap: 12, marginBottom: 20 }}>
          <span className="brand-badge" aria-hidden>⚡</span>
          <div>
            <div className="display" style={{ fontSize: 18, fontWeight: 700 }}>CyberControl</div>
            <div className="label">Owner Control</div>
          </div>
        </div>

        <label className="label" htmlFor="baseUrl">Owner API (tailnet)</label>
        <input id="baseUrl" className="input" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
          placeholder="http://cybercontrol-app:3010" autoComplete="off" spellCheck={false} style={{ margin: '6px 0 16px' }} />

        <label className="label" htmlFor="key">Owner key</label>
        <input id="key" className="input" type="password" value={key} onChange={e => setKey(e.target.value)}
          placeholder="paste your OWNER_KEY" autoComplete="off" autoFocus style={{ margin: '6px 0 16px' }} />

        {error && <p className="banner" role="alert" style={{ marginBottom: 16 }}>{error}</p>}

        <div className="row" style={{ gap: 10 }}>
          <button type="submit" className="btn btn--primary grow" disabled={!baseUrl || !key}>Connect</button>
          {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
          Reachable only from your personal network (tailnet). The key is stored on this device.
        </p>
      </form>
    </div>
  );
}
