/**
 * Design Playground — visual mocks of the redesigned 5 pages.
 * Uses the new cc-* design tokens. No real data, no API calls.
 *
 * Route: /design-playground
 */

import { Link } from 'react-router-dom';

export default function PlaygroundIndex() {
  const pages = [
    { path: '/design-playground/counter', label: 'Counter', desc: 'Operator\'s live desk — workstack + work view + WhatsApp intake', icon: '🪑' },
    { path: '/design-playground/work-item', label: 'Work Item', desc: 'Focused mode for one structured task', icon: '📋' },
    { path: '/design-playground/photo-tool', label: 'Photo Tool', desc: 'Browser-rendered image utility', icon: '📷' },
    { path: '/design-playground/customer', label: 'Customer', desc: 'Family memory bank', icon: '👥' },
    { path: '/design-playground/settings', label: 'Settings', desc: 'Owner config (small)', icon: '⚙' },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--cc-bg)', color: 'var(--cc-text)' }}>
      <div className="max-w-4xl mx-auto px-6 py-12">
        <header className="mb-10">
          <div className="text-sm font-semibold" style={{ color: 'var(--cc-primary)' }}>CyberControl</div>
          <h1 className="text-3xl font-semibold mt-2" style={{ fontFamily: 'Inter, system-ui' }}>Design Playground</h1>
          <p className="mt-2 text-base" style={{ color: 'var(--cc-text-secondary)' }}>
            Visual mocks of the redesigned product. Click a page to view its prototype.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pages.map(p => (
            <Link
              key={p.path}
              to={p.path}
              className="block p-6 rounded-lg transition-colors"
              style={{
                background: 'var(--cc-surface)',
                border: '1px solid var(--cc-border)',
                color: 'var(--cc-text)',
                textDecoration: 'none',
              }}
            >
              <div className="flex items-start gap-4">
                <span className="text-2xl">{p.icon}</span>
                <div>
                  <div className="text-base font-semibold">{p.label}</div>
                  <div className="text-sm mt-1" style={{ color: 'var(--cc-text-secondary)' }}>{p.desc}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-10 p-4 rounded-lg text-sm" style={{ background: 'var(--cc-primary-soft)', color: 'var(--cc-primary)' }}>
          These are prototype mocks. They use the new cc-* design tokens
          (light theme, Inter font, Zerodha-inspired). Existing app pages
          remain unchanged.
        </div>
      </div>
    </div>
  );
}
