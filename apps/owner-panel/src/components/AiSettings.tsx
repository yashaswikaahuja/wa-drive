import { useEffect, useState } from 'react';
import type { Config, AiSettings } from '../api';
import { fetchAiSettings, patchAiSettings } from '../api';

export function AiSettingsPanel({ cfg }: { cfg: Config }) {
  const [ai, setAi] = useState<AiSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { fetchAiSettings(cfg).then(setAi).catch(() => {}); }, [cfg]);

  const save = async () => {
    if (!ai) return;
    setSaving(true); setMsg('');
    try {
      await patchAiSettings(cfg, ai);
      setMsg('✓ Saved');
      setTimeout(() => setMsg(''), 3000);
    } catch (e: any) { setMsg(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  if (!ai) return null;

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <h2 className="display" style={{ fontSize: 15, marginBottom: 12 }}>AI Models</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Extraction */}
        <div>
          <div className="label" style={{ marginBottom: 4 }}>Extraction (Vision)</div>
          <select value={ai.extractionProvider} onChange={e => setAi({ ...ai, extractionProvider: e.target.value })}
            className="input" style={{ width: '100%', marginBottom: 8 }}>
            <option value="mistral">Mistral</option>
            <option value="groq">Groq (Qwen)</option>
          </select>
          <input value={ai.extractionModel} onChange={e => setAi({ ...ai, extractionModel: e.target.value })}
            className="input" placeholder="mistral-small-latest" style={{ width: '100%', marginBottom: 8 }} />
          <div className="label" style={{ marginBottom: 4 }}>Mistral Key</div>
          <input value={ai.mistralKey} onChange={e => setAi({ ...ai, mistralKey: e.target.value })}
            className="input mono" placeholder="••••" style={{ width: '100%' }} />
        </div>

        {/* Text LLM */}
        <div>
          <div className="label" style={{ marginBottom: 4 }}>Text LLM (Form Fill)</div>
          <select value={ai.textProvider} onChange={e => setAi({ ...ai, textProvider: e.target.value })}
            className="input" style={{ width: '100%', marginBottom: 8 }}>
            <option value="openrouter">OpenRouter</option>
            <option value="groq">Groq</option>
          </select>
          <input value={ai.textModel} onChange={e => setAi({ ...ai, textModel: e.target.value })}
            className="input" placeholder="meta-llama/llama-3.3-70b-instruct" style={{ width: '100%', marginBottom: 8 }} />
          <div className="label" style={{ marginBottom: 4 }}>OpenRouter Key</div>
          <input value={ai.openrouterKey} onChange={e => setAi({ ...ai, openrouterKey: e.target.value })}
            className="input mono" placeholder="sk-or-v1-••••" style={{ width: '100%', marginBottom: 8 }} />
          <div className="label" style={{ marginBottom: 4 }}>LLM API Key (text fill)</div>
          <input
            value={ai.llmKey || ai.groqKey || ''}
            onChange={e => setAi({ ...ai, llmKey: e.target.value, groqKey: e.target.value })}
            className="input mono"
            placeholder="provider API key"
            style={{ width: '100%' }}
          />
        </div>
      </div>

      <div className="row" style={{ marginTop: 16, gap: 12 }}>
        <button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        {msg && <span className={msg.startsWith('✓') ? 'muted' : 'banner'} style={{ fontSize: 12 }}>{msg}</span>}
      </div>
    </section>
  );
}
