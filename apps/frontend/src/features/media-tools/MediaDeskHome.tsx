/**
 * Photos home — exactly two tools (#317).
 */
import { Link, useSearchParams } from 'react-router-dom';
import { Images, FilePdf } from '@phosphor-icons/react';
import PageHeader from '../../shared/PageHeader';
import { useReveal } from '../../shared/useReveal';

const JOBS = [
  {
    to: 'portal',
    title: 'Photo Editor',
    hindi: 'फोटो',
    desc: 'Background, frame, portal JPG, free print sheet, signature — Save to Drive',
    icon: Images,
    accent: 'hsl(var(--marigold))',
  },
  {
    to: 'printdoc',
    title: 'Print Doc',
    hindi: 'प्रिंट',
    desc: 'Place a photo or PDF on A4 or 4×6, mark it up, and print',
    icon: FilePdf,
    accent: 'hsl(var(--confidence))',
  },
] as const;

export default function MediaDeskHome() {
  const [params] = useSearchParams();
  const q = params.toString();
  const suffix = q ? `?${q}` : '';
  const { reveal } = useReveal();

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div style={reveal(0)}>
        <PageHeader
          title="Photos"
          subtitle="Photo Editor and Print Doc — files stay in File Manager / Drive."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {JOBS.map((job, i) => {
          const Icon = job.icon;
          return (
            <Link
              key={job.to}
              to={`${job.to}${suffix}`}
              className="card group flex gap-4 p-4 md:p-5 items-start transition-colors"
              style={{ borderColor: 'hsl(var(--pt-border))', ...reveal(1 + i) }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--marigold) / 0.55)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--pt-border))'; }}
            >
              <span
                className="grid place-items-center w-12 h-12 rounded-xl shrink-0 text-white"
                style={{ background: job.accent }}
              >
                <Icon size={24} weight="fill" />
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-base font-semibold" style={{ color: 'hsl(var(--ink))' }}>
                    {job.title}
                  </span>
                  <span className="text-xs" style={{ color: 'hsl(var(--pt-muted))' }}>{job.hindi}</span>
                </span>
                <span className="block text-xs mt-1 leading-relaxed" style={{ color: 'hsl(var(--pt-muted))' }}>
                  {job.desc}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
