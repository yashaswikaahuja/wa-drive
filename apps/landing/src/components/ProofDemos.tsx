/**
 * NPCI-style product proof: silent WebM clips from pixel-exact product UI
 * (real Hub + unpacked extension) with fictional demo fixtures via local stub APIs.
 * See issue #331. Re-record with: pnpm record:pixel
 * Fixture fallback: pnpm record:proof
 */
import { ArrowRight, Check } from "lucide-react";

const APP_URL = String(import.meta.env.VITE_APP_URL ?? "https://app.cybercontrol.fun");

const CLIP_SRC = {
  form: "/proof/clip-form-fill.webm",
  wa: "/proof/clip-whatsapp.webm",
  customers: "/proof/clip-customers.webm",
  files: "/proof/clip-files.webm",
  photo: "/proof/clip-photos.webm",
  workspace: "/proof/clip-workspace.webm",
} as const;

type ClipKind = keyof typeof CLIP_SRC;

function SilentProofVideo({
  src,
  label,
}: {
  src: string;
  label: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10 bg-[#0f1218] shadow-lift">
      <div className="flex items-center gap-2 border-b border-white/10 bg-black/40 px-3 py-2">
        <div className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-white/25" />
          <span className="h-2 w-2 rounded-full bg-white/25" />
          <span className="h-2 w-2 rounded-full bg-white/25" />
        </div>
        <div className="truncate text-[11px] font-medium text-paper/80">{label}</div>
        <span className="ml-auto rounded-full bg-marigold/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-marigold">
          Product recording · real UI · demo data
        </span>
      </div>
      <video
        className="aspect-video w-full bg-black object-cover"
        src={src}
        muted
        autoPlay
        loop
        playsInline
        preload="metadata"
        aria-label={label}
      />
    </div>
  );
}

export function FormFillClip() {
  return (
    <SilentProofVideo
      src={CLIP_SRC.form}
      label="Extension AutoFill · real UI · demo portal"
    />
  );
}

type ProofBand = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  cta: { href: string; label: string };
  clip: ClipKind;
  clipLabel: string;
  flip?: boolean;
};

const BANDS: ProofBand[] = [
  {
    id: "proof-forms",
    eyebrow: "Form AutoFill",
    title: "Extension Fill on a portal form — from a saved profile",
    body: "Pixel-exact recording of the real CyberControl Chrome extension on a demo portal form: popup loads the fictional Ananya Demo profile, Fill Form runs, fields populate. Review stays with the café before submit.",
    bullets: [
      "Real unpacked extension UI (not a stylized mock)",
      "Fictional Ananya Demo profile — no live café data",
      "You review before submit — control stays with the café",
    ],
    cta: { href: "#extension", label: "Get the AutoFill extension" },
    clip: "form",
    clipLabel: "Extension · Fill Form on demo portal",
  },
  {
    id: "proof-wa",
    eyebrow: "WhatsApp Documents",
    title: "From WhatsApp chat → customer folder, not phone chaos",
    body: "Pixel-exact Hub Documents desk with fictional demo chats and files — the same UI operators use, mocked locally so no live café data appears.",
    bullets: ["Chat + files in one place", "Linked to the customer", "Ready for forms and printing"],
    cta: { href: `${APP_URL}/app/whatsapp`, label: "Open WhatsApp desk" },
    clip: "wa",
    clipLabel: "Hub · Documents (WhatsApp)",
    flip: true,
  },
  {
    id: "proof-customers",
    eyebrow: "Customer Profiles",
    title: "Every return visit starts with memory, not a blank form",
    body: "Pixel-exact Hub Customers list recorded from the real frontend: household rows and person profiles filled with fictional demo fixtures.",
    bullets: ["Search by name or phone", "Documents attached", "History across visits"],
    cta: { href: `${APP_URL}/app/customers`, label: "See customer list" },
    clip: "customers",
    clipLabel: "Hub · Customers",
  },
  {
    id: "proof-files",
    eyebrow: "File Manager",
    title: "Browse documents like a real drive — per customer",
    body: "Pixel-exact File Manager from the real Hub chrome: per-customer folders and document tiles, driven by mocked demo drive fixtures.",
    bullets: ["Per-customer folders", "Preview before print", "Fast find at the counter"],
    cta: { href: `${APP_URL}/app/files`, label: "Open File Manager" },
    clip: "files",
    clipLabel: "Hub · File Manager",
    flip: true,
  },
  {
    id: "proof-photo",
    eyebrow: "Photo & PDF Tools",
    title: "Passport photos and scans that match counter rules",
    body: "Pixel-exact Photos / Media Desk from the real Hub: Photo Editor and PDF Tool tiles operators open at the counter.",
    bullets: ["Exact sizes (e.g. 4.5×3.5)", "Print-ready export", "PDF tools for scans"],
    cta: { href: `${APP_URL}/app/photos`, label: "Open photo tools" },
    clip: "photo",
    clipLabel: "Hub · Photos",
  },
  {
    id: "proof-workspace",
    eyebrow: "Operator Workspace",
    title: "One signed-in desk for the whole café day",
    body: "Pixel-exact Hub Today workspace from the real app shell: queue tiles and the live sidebar (Customers, Documents, Files, Photos).",
    bullets: ["Single login", "Tools in one sidebar", "Built for Hindi + English desks"],
    cta: { href: APP_URL, label: "Sign in to workspace" },
    clip: "workspace",
    clipLabel: "Hub · Today",
    flip: true,
  },
];

export function ProofBands() {
  return (
    <div id="proof" className="border-b border-border bg-paper">
      <div className="container py-12 sm:py-16">
        <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-marigold-deep">
            See it working
          </p>
          <h2 className="font-display text-[clamp(1.85rem,3.8vw,2.85rem)] font-bold leading-tight tracking-tight text-ink">
            Proof for every part of CyberControl
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
            Silent product recordings of the real Hub + extension UI with fictional demo data — muted, looping, no soundtrack.
          </p>
        </div>

        <div className="space-y-16 sm:space-y-24">
          {BANDS.map((b) => (
            <section
              key={b.id}
              id={b.id}
              className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12"
            >
              <div className={b.flip ? "lg:order-2" : undefined}>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-marigold-deep">
                  {b.eyebrow}
                </p>
                <h3 className="font-display text-[clamp(1.45rem,2.6vw,2.1rem)] font-bold leading-tight tracking-tight text-ink">
                  {b.title}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{b.body}</p>
                <ul className="mt-4 space-y-2">
                  {b.bullets.map((x) => (
                    <li key={x} className="flex items-start gap-2 text-[13.5px] text-ink">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-confidence" aria-hidden="true" />
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={b.cta.href}
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-paper transition hover:bg-ink-soft"
                >
                  {b.cta.label}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
              <div className={b.flip ? "lg:order-1" : undefined}>
                <SilentProofVideo src={CLIP_SRC[b.clip]} label={b.clipLabel} />
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
