/**
 * Media Desk home — four big job tiles for a Bihar cybercafé counter.
 * Medicine for “too many clicks / wrong tool under a queue”.
 */
import { Link, useSearchParams } from 'react-router-dom';
import { IdentificationCard, Images, FilePdf, Printer } from '@phosphor-icons/react';

const JOBS = [
  {
    to: 'portal',
    title: 'Portal photo',
    hindi: 'पोर्टल फोटो',
    desc: 'Exam / RTPS / Passport Seva JPG — size, KB, background',
    icon: Images,
    accent: 'hsl(27 95% 55%)',
  },
  {
    to: 'print',
    title: 'Print sheet',
    hindi: 'प्रिंट शीट',
    desc: '8 on 4×6 glossy or A4 — same framed face',
    icon: Printer,
    accent: 'hsl(200 70% 45%)',
  },
  {
    to: 'scan',
    title: 'Scan PDF',
    hindi: 'स्कैन PDF',
    desc: 'Multi-page clean PDF — forms & certificates',
    icon: FilePdf,
    accent: 'hsl(145 50% 40%)',
  },
  {
    to: 'aadhaar',
    title: 'Aadhaar card',
    hindi: 'आधार',
    desc: 'Front + back on one A4 page',
    icon: IdentificationCard,
    accent: 'hsl(260 45% 55%)',
  },
] as const;

export default function MediaDeskHome() {
  const [params] = useSearchParams();
  // Preserve WA / customer context across tiles
  const q = params.toString();
  const suffix = q ? `?${q}` : '';

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Media Desk</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Pick the job — portal upload, glossy print, scan, or Aadhaar. One desk for the counter.
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

      <p className="text-[11px] text-[var(--muted-foreground)] mt-6 leading-relaxed">
        Tip: open from WhatsApp with a photo selected — phone and file come with you.
        Save finished files on the customer so tomorrow’s visit is one click.
      </p>
    </div>
  );
}
