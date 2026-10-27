/**
 * PDF Tools hub — five client-side tools. Outputs save back to the same Drive
 * customer folder (tagged pdf-editor, hidden from WhatsApp) or download.
 */
import { Link, useSearchParams } from 'react-router-dom';
import {
  Stack, ArrowsOutCardinal, Scissors, ArrowsInLineHorizontal, Resize, ArrowLeft,
} from '@phosphor-icons/react';
import { PageHeader, useReveal } from './hub';

const TOOLS = [
  { to: 'organize', title: 'Organize', hindi: 'क्रम', desc: 'Reorder, rotate and delete pages', icon: ArrowsOutCardinal, accent: 'hsl(var(--marigold))' },
  { to: 'merge', title: 'Merge / Add', hindi: 'जोड़ें', desc: 'Combine PDFs and images into one', icon: Stack, accent: 'hsl(var(--confidence))' },
  { to: 'split', title: 'Split', hindi: 'अलग', desc: 'Pull out page ranges into new PDFs', icon: Scissors, accent: 'hsl(var(--marigold-deep))' },
  { to: 'compress', title: 'Compress', hindi: 'छोटा', desc: 'Shrink file size for email / upload', icon: ArrowsInLineHorizontal, accent: 'hsl(var(--confidence))' },
  { to: 'resize', title: 'Resize', hindi: 'आकार', desc: 'Fit pages to A4, 4×6 or Letter', icon: Resize, accent: 'hsl(var(--marigold))' },
] as const;

export default function PdfToolsHome() {
  const [params] = useSearchParams();
  const q = params.toString();
  const suffix = q ? `?${q}` : '';
  const { reveal } = useReveal();

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div style={reveal(0)} className="mb-1">
        <Link
          to={`../printdoc${suffix}`}
          className="inline-flex items-center gap-1.5 text-xs mb-2"
          style={{ color: 'hsl(var(--pt-muted))' }}
        >
          <ArrowLeft size={14} /> Photos
        </Link>
        <PageHeader
          title="PDF Tools"
          subtitle="Organize, merge, split, compress, resize — files save to Drive (not shown in WhatsApp) or download."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TOOLS.map((tool, i) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.to}
              to={`${tool.to}${suffix}`}
              className="card group flex gap-4 p-4 md:p-5 items-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--marigold))]"
              style={{ borderColor: 'hsl(var(--pt-border))', ...reveal(1 + i) }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--marigold) / 0.55)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--pt-border))'; }}
              data-pdf-tool-card={tool.to}
            >
              <span className="grid place-items-center w-12 h-12 rounded-xl shrink-0 text-white" style={{ background: tool.accent }}>
                <Icon size={24} weight="fill" />
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-base font-semibold" style={{ color: 'hsl(var(--ink))' }}>{tool.title}</span>
                  <span className="text-xs" style={{ color: 'hsl(var(--pt-muted))' }}>{tool.hindi}</span>
                </span>
                <span className="block text-xs mt-1 leading-relaxed" style={{ color: 'hsl(var(--pt-muted))' }}>{tool.desc}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
