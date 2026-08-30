import { useEffect, useState } from 'react';
import { Brain, Key, FloppyDisk, CheckCircle } from '@phosphor-icons/react';
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
      setMsg('saved');
      setTimeout(() => setMsg(''), 3000);
    } catch (e: any) { setMsg(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  if (!ai) return null;

  return (
    <section className="card" style={{ padding: '20px', marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'hsl(210 60% 50% / 0.1)', display: 'grid', placeItems: 'center' }}>
          <Brain size={16} weight="duotone" style={{ color: 'hsl(210 60% 45%)' }} />
        </div>
        <h2 className="display" style={{ fontSize: 15, fontWeight: 700 }}>AI Models & Keys</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Extraction */}
        <div style={{ background: 'hsl(var(--bg))', borderRadius: 10, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Brain size={14} weight="bold" style={{ color: 'hsl(var(--ink-soft))' }} />
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--ink-soft))' }}>Extraction (Vision)</span>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <span className="muted" style={{ fontSize: 10 }}>Provider</span>
              <select value={ai.extractionProvider} onChange={e => setAi({ ...ai, extractionProvider: e.target.value })} className="input" style={{ marginTop: 3 }}>
                <option value="mistral">Mistral</option>
                <option value="groq">Groq (Qwen)</option>
              </select>
            </div>
            <div>
              <span className="muted" style={{ fontSize: 10 }}>Model</span>
              <input value={ai.extractionModel} onChange={e => setAi({ ...ai, extractionModel: e.target.value })} className="input" placeholder="mistral-small-latest" style={{ marginTop: 3 }} />
            </div>
            <div>
              <span className="muted" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}><Key size={10} /> Mistral Key</span>
              <input value={ai.mistralKey} onChange={e => setAi({ ...ai, mistralKey: e.target.value })} className="input" placeholder="••••" style={{ marginTop: 3, fontFamily: 'var(--mono)', fontSize: 12 }} />
            </div>
          </div>
        </div>

        {/* Text LLM */}
        <div style={{ background: 'hsl(var(--bg))', borderRadius: 10, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Brain size={14} weight="bold" style={{ color: 'hsl(var(--ink-soft))' }} />
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--ink-soft))' }}>Text LLM (Form Fill)</span>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <span className="muted" style={{ fontSize: 10 }}>Provider</span>
              <select value={ai.textProvider} onChange={e => setAi({ ...ai, textProvider: e.target.value })} className="input" style={{ marginTop: 3 }}>
                <option value="openrouter">OpenRouter</option>
                <option value="groq">Groq</option>
              </select>
            </div>
            <div>
              <span className="muted" style={{ fontSize: 10 }}>Model</span>
              <input value={ai.textModel} onChange={e => setAi({ ...ai, textModel: e.target.value })} className="input" placeholder="meta-llama/llama-3.3-70b-instruct" style={{ marginTop: 3 }} />
            </div>
            <div>
              <span className="muted" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}><Key size={10} /> OpenRouter Key</span>
              <input value={ai.openrouterKey} onChange={e => setAi({ ...ai, openrouterKey: e.target.value })} className="input" placeholder="sk-or-v1-••••" style={{ marginTop: 3, fontFamily: 'var(--mono)', fontSize: 12 }} />
            </div>
            <div>
              <span className="muted" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}><Key size={10} /> LLM API Key (fallback)</span>
              <input
                value={ai.llmKey || ai.groqKey || ''}
                onChange={e => setAi({ ...ai, llmKey: e.target.value, groqKey: e.target.value })}
                className="input"
                placeholder="provider API key"
                style={{ marginTop: 3, fontFamily: 'var(--mono)', fontSize: 12 }}
              />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
        <button className="btn btn--primary" onClick={save} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FloppyDisk size={14} weight="bold" />
          {saving ? 'Saving…' : 'Save Keys'}
        </button>
        {msg === 'saved' && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'hsl(var(--good))' }}><CheckCircle size={14} weight="fill" /> Saved</span>}
        {msg && msg !== 'saved' && <span className="banner" style={{ fontSize: 12, padding: '4px 10px' }}>{msg}</span>}
      </div>
    </section>
  );
}
