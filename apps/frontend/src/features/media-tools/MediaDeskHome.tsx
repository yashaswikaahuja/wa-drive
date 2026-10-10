/**
 * Photos home — exactly two tools (#317).
 */
import { Link, useSearchParams } from 'react-router-dom';
import { Images, FilePdf } from '@phosphor-icons/react';

const JOBS = [
  {
    to: 'portal',
    title: 'Photo Editor',
    hindi: 'फोटो',
    desc: 'Background, frame, portal JPG, free print sheet, signature — Save to Drive',
    icon: Images,
    accent: 'hsl(27 95% 55%)',
  },
  {
    to: 'scan',
    title: 'PDF Tool',
    hindi: 'PDF',
    desc: 'Scan pages, enhance, Aadhaar layout, multi-page PDF — Save to Drive',
    icon: FilePdf,
    accent: 'hsl(145 50% 40%)',
  },
] as const;

export default function MediaDeskHome() {
  const [params] = useSearchParams();
  const q = params.toString();
  const suffix = q ? `?${q}` : '';

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Photos</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Two tools only — Photo Editor and PDF Tool. Files live in File Manager / Drive.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {JOBS.map((job) => {
          const Icon = job.icon;
          return (
            <Link
              key={job.to}
              to={`${job.to}${suffix}`}
              className="card group flex gap-4 p-4 md:p-5 hover:border-[hsl(27_95%_55%)] transition-colors items-start"
            >
              <span
                className="grid place-items-center w-12 h-12 rounded-xl shrink-0 text-white"
                style={{ background: job.accent }}
              >
                <Icon size={24} weight="fill" />
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-base font-semibold group-hover:text-[hsl(27_95%_55%)]">
                    {job.title}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)]">{job.hindi}</span>
                </span>
                <span className="block text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed">
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
