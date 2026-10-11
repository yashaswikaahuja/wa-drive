/**
 * NPCI-style product proof: large visual "clips" that show the product working,
 * not just marketing copy. Form fill is an animated sequence operators can watch.
 */
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Camera,
  Check,
  FileText,
  MessageCircle,
  PenLine,
  Store,
  User,
} from "lucide-react";

const APP_URL = String(import.meta.env.VITE_APP_URL ?? "https://app.cybercontrol.fun");

/* ------------------------------------------------------------------ */
/* Animated form-fill clip — the proof people ask for                  */
/* ------------------------------------------------------------------ */

const FORM_FIELDS = [
  { label: "Full name", key: "name", value: "Ramesh Kumar" },
  { label: "Date of birth", key: "dob", value: "14/08/1992" },
  { label: "Aadhaar / ID", key: "id", value: "2847 9201 5536" },
  { label: "Mobile", key: "mobile", value: "98765 44120" },
  { label: "Father's name", key: "father", value: "Suresh Kumar" },
  { label: "Address", key: "address", value: "Ward 4, Near Bus Stand, Patna" },
] as const;

export function FormFillClip({ autoPlay = true }: { autoPlay?: boolean }) {
  const [step, setStep] = useState(0); // 0 idle, 1 profile, 2..fields, done
  const filledCount = Math.max(0, Math.min(FORM_FIELDS.length, step - 1));
  const done = step > FORM_FIELDS.length;

  useEffect(() => {
    if (!autoPlay) return;
    let i = 0;
    const tick = () => {
      i += 1;
      if (i === 1) setStep(1);
      else if (i <= FORM_FIELDS.length + 1) setStep(i);
      else {
        // pause on done, then loop
        setTimeout(() => {
          setStep(0);
          i = 0;
        }, 2200);
        return;
      }
    };
    const id = window.setInterval(tick, 900);
    return () => window.clearInterval(id);
  }, [autoPlay]);

  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10 bg-[#1a1f2e] shadow-lift">
      {/* fake browser chrome */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-black/30 px-3 py-2">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        </div>
        <div className="ml-2 flex-1 truncate rounded-md bg-white/10 px-2 py-1 font-mono text-[10px] text-white/70">
          https://serviceonline.bihar.gov.in/…/application
        </div>
        <span className="rounded-full bg-marigold/20 px-2 py-0.5 text-[10px] font-semibold text-marigold">
          Live fill
        </span>
      </div>

      <div className="grid gap-0 lg:grid-cols-[200px_1fr]">
        {/* side panel — CyberControl profile picker */}
        <div className="border-b border-white/10 bg-black/25 p-3 lg:border-b-0 lg:border-r">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/50">
            CyberControl
          </div>
          <div
            className={`rounded-lg border p-2 transition ${
              step >= 1 ? "border-marigold/50 bg-marigold/15" : "border-white/10 bg-white/5"
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-marigold text-[11px] font-bold text-ink">
                RK
              </div>
              <div>
                <div className="text-[12px] font-semibold text-white">Ramesh Kumar</div>
                <div className="text-[10px] text-white/55">6 documents · ready</div>
              </div>
            </div>
            {step >= 1 && (
              <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-marigold">
                <Check className="h-3 w-3" /> Profile selected
              </div>
            )}
          </div>
          <button
            type="button"
            className={`mt-3 w-full rounded-md px-2 py-2 text-[11px] font-semibold transition ${
              step >= 1 ? "bg-marigold text-ink" : "bg-white/10 text-white/70"
            }`}
          >
            {done ? "Filled ✓" : step >= 1 ? "AutoFill running…" : "Select & AutoFill"}
          </button>
        </div>

        {/* form being filled */}
        <div className="space-y-2.5 bg-[#f7f4ee] p-4">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[12px] font-semibold text-ink">Application form</div>
            <div className="text-[10px] text-muted-foreground">
              {done ? "Complete" : filledCount > 0 ? `${filledCount}/${FORM_FIELDS.length} fields` : "Empty"}
            </div>
          </div>
          {FORM_FIELDS.map((f, idx) => {
            const filled = filledCount > idx;
            const filling = filledCount === idx && step > 1 && !done;
            return (
              <label key={f.key} className="block">
                <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-ink/50">
                  {f.label}
                </span>
                <div
                  className={`flex h-9 items-center rounded-md border px-2.5 text-[13px] transition ${
                    filled
                      ? "border-confidence/40 bg-white text-ink shadow-sm"
                      : filling
                        ? "border-marigold bg-marigold/10 text-ink"
                        : "border-ink/10 bg-white/70 text-ink/25"
                  }`}
                >
                  {filled ? (
                    <span className="animate-[fadeIn_0.35s_ease]">{f.value}</span>
                  ) : filling ? (
                    <span className="inline-flex items-center gap-1 text-marigold-deep">
                      <span className="h-3.5 w-0.5 animate-pulse bg-marigold-deep" />
                      filling…
                    </span>
                  ) : (
                    <span>—</span>
                  )}
                </div>
              </label>
            );
          })}
          {done && (
            <div className="flex items-center gap-2 rounded-md border border-confidence/30 bg-confidence/10 px-3 py-2 text-[12px] font-semibold text-confidence">
              <Check className="h-4 w-4" /> Form filled from customer profile — review & submit
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Feature proof clips (UI recreations that look like product footage) */
/* ------------------------------------------------------------------ */

function ClipChrome({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-lift">
      <div className="flex items-center gap-2 border-b border-border bg-ink px-3 py-2">
        <div className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-white/25" />
          <span className="h-2 w-2 rounded-full bg-white/25" />
          <span className="h-2 w-2 rounded-full bg-white/25" />
        </div>
        <div className="text-[11px] font-medium text-paper/80">{title}</div>
        <span className="ml-auto rounded-full bg-marigold/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-marigold">
          Product clip
        </span>
      </div>
      <div className="bg-paper-deep/40 p-3 sm:p-4">{children}</div>
    </div>
  );
}

export function WhatsAppProofClip() {
  return (
    <ClipChrome title="CyberControl · WhatsApp Documents">
      <div className="grid gap-3 sm:grid-cols-[1fr_1.1fr]">
        <div className="rounded-xl bg-[#0b141a] p-2 text-white shadow-inner">
          <div className="mb-2 flex items-center gap-2 border-b border-white/10 pb-2">
            <MessageCircle className="h-4 w-4 text-whatsapp" />
            <span className="text-[12px] font-semibold">Suresh Bhai</span>
          </div>
          <div className="space-y-1.5 text-[11px]">
            <div className="ml-auto max-w-[85%] rounded-lg bg-[#005c4b] px-2 py-1.5">bhaiya aadhaar bhej raha hu</div>
            <div className="max-w-[90%] rounded-lg bg-[#1f2c34] px-2 py-2">
              <div className="mb-1 flex h-14 items-center justify-center rounded bg-white/10 text-[10px] text-white/70">
                📄 aadhaar_front.jpg
              </div>
              <div className="text-white/50">today 10:42</div>
            </div>
            <div className="max-w-[90%] rounded-lg bg-[#1f2c34] px-2 py-2">
              <div className="mb-1 flex h-14 items-center justify-center rounded bg-white/10 text-[10px] text-white/70">
                📄 marksheet_10th.pdf
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-white p-3">
          <div className="mb-2 text-[11px] font-semibold text-ink">Saved to customer folder</div>
          <div className="space-y-2">
            {["aadhaar_front.jpg", "marksheet_10th.pdf", "IMG_signature.jpg"].map((f, i) => (
              <div
                key={f}
                className="flex items-center gap-2 rounded-lg border border-ink/10 bg-paper px-2 py-2 text-[12px] text-ink animate-[fadeIn_0.5s_ease]"
                style={{ animationDelay: `${i * 0.15}s`, animationFillMode: "both" }}
              >
                <FileText className="h-4 w-4 text-teal-deep" />
                <span className="flex-1 truncate font-medium">{f}</span>
                <Check className="h-3.5 w-3.5 text-confidence" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </ClipChrome>
  );
}

export function CustomersProofClip() {
  return (
    <ClipChrome title="CyberControl · Customer Profiles">
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { n: "Ramesh Kumar", p: "98765 44120", d: "6 docs · last: Aadhaar" },
          { n: "Priya Devi", p: "98001 22314", d: "4 docs · last: Photo" },
          { n: "Amit Singh", p: "99314 77820", d: "9 docs · last: Form" },
          { n: "Suman Ji", p: "91234 55667", d: "3 docs · last: PDF" },
        ].map((c) => (
          <div key={c.n} className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white p-3 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-marigold/20 text-[12px] font-bold text-marigold-deep">
              {c.n.split(" ").map((x) => x[0]).join("").slice(0, 2)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-ink">{c.n}</div>
              <div className="text-[11px] text-muted-foreground">{c.p}</div>
              <div className="text-[10px] text-teal-deep">{c.d}</div>
            </div>
          </div>
        ))}
      </div>
    </ClipChrome>
  );
}

export function FilesProofClip() {
  return (
    <ClipChrome title="CyberControl · File Manager">
      <div className="mb-2 text-[11px] text-muted-foreground">Customers / Ramesh Kumar</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { t: "Aadhaar", k: "JPG" },
          { t: "Marksheet", k: "PDF" },
          { t: "Photo 4.5×3.5", k: "JPG" },
          { t: "Signature", k: "PNG" },
        ].map((f) => (
          <div key={f.t} className="rounded-xl border border-ink/10 bg-white p-2 shadow-sm">
            <div className="mb-2 flex aspect-[4/3] items-center justify-center rounded-lg bg-gradient-to-br from-paper-deep to-muted">
              <FileText className="h-6 w-6 text-ink/35" />
            </div>
            <div className="truncate text-[11px] font-semibold text-ink">{f.t}</div>
            <div className="text-[10px] text-muted-foreground">{f.k}</div>
          </div>
        ))}
      </div>
    </ClipChrome>
  );
}

export function PhotoProofClip() {
  return (
    <ClipChrome title="CyberControl · Photo & PDF Tools">
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div className="rounded-xl border border-dashed border-ink/20 bg-white p-3">
          <div className="mb-1 text-center text-[10px] font-medium uppercase text-muted-foreground">Before</div>
          <div className="h-28 w-24 rounded-md bg-gradient-to-br from-ink/20 to-ink/5" />
        </div>
        <ArrowRight className="hidden h-5 w-5 text-marigold-deep sm:block" />
        <div className="rounded-xl border-2 border-teal/40 bg-white p-3 shadow-paper">
          <div className="mb-1 text-center text-[10px] font-medium uppercase text-teal-deep">Print ready</div>
          <div className="relative mx-auto h-28 w-[84px] overflow-hidden rounded-sm bg-white ring-1 ring-ink/15">
            <div className="absolute inset-x-2 top-2 bottom-8 rounded-sm bg-gradient-to-br from-muted to-ink-soft/30" />
            <div className="absolute inset-x-0 bottom-0 bg-paper-deep py-1 text-center text-[8px] font-mono text-ink/60">
              4.5 × 3.5 cm
            </div>
          </div>
        </div>
        <div className="space-y-1 text-[12px] text-ink-soft sm:ml-2">
          <div className="flex items-center gap-1.5 font-semibold text-ink">
            <Camera className="h-4 w-4 text-teal-deep" /> Passport size
          </div>
          <div>✓ White background</div>
          <div>✓ Exact dimensions</div>
          <div>✓ PDF / print export</div>
        </div>
      </div>
    </ClipChrome>
  );
}

export function WorkspaceProofClip() {
  return (
    <ClipChrome title="CyberControl · Operator Workspace">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { icon: User, label: "Customers" },
          { icon: MessageCircle, label: "WhatsApp" },
          { icon: FileText, label: "Files" },
          { icon: Camera, label: "Photos" },
          { icon: PenLine, label: "Forms" },
          { icon: Store, label: "Desk" },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2 rounded-xl border border-ink/10 bg-white px-3 py-3 shadow-sm">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-ink/5">
              <Icon className="h-4 w-4 text-ink" />
            </div>
            <span className="text-[12px] font-semibold text-ink">{label}</span>
          </div>
        ))}
      </div>
    </ClipChrome>
  );
}

/* ------------------------------------------------------------------ */
/* Full proof bands — NPCI-style “show the product” sections           */
/* ------------------------------------------------------------------ */

type ProofBand = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  cta: { href: string; label: string };
  clip: "form" | "wa" | "customers" | "files" | "photo" | "workspace";
  flip?: boolean;
};

const BANDS: ProofBand[] = [
  {
    id: "proof-forms",
    eyebrow: "Form AutoFill",
    title: "Watch a government form fill from a saved profile",
    body: "This is the proof operators ask for: pick the customer, run AutoFill, see fields populate — instead of typing the same Aadhaar details for the hundredth time.",
    bullets: [
      "Works with the CyberControl Chrome extension",
      "Uses the customer profile already in your workspace",
      "You review before submit — control stays with the café",
    ],
    cta: { href: "#extension", label: "Get the AutoFill extension" },
    clip: "form",
  },
  {
    id: "proof-wa",
    eyebrow: "WhatsApp Documents",
    title: "From WhatsApp chat → customer folder, not phone chaos",
    body: "Customers send Aadhaar and marksheets on WhatsApp. CyberControl captures them into the right profile so the desk is not hunting through chats.",
    bullets: ["Chat + files in one place", "Linked to the customer", "Ready for forms and printing"],
    cta: { href: `${APP_URL}/app/whatsapp`, label: "Open WhatsApp desk" },
    clip: "wa",
    flip: true,
  },
  {
    id: "proof-customers",
    eyebrow: "Customer Profiles",
    title: "Every return visit starts with memory, not a blank form",
    body: "Profiles hold identity, phone, and documents. The café stops asking for the same papers every time someone walks in.",
    bullets: ["Search by name or phone", "Documents attached", "History across visits"],
    cta: { href: `${APP_URL}/app/customers`, label: "See customer list" },
    clip: "customers",
  },
  {
    id: "proof-files",
    eyebrow: "File Manager",
    title: "Browse documents like a real drive — per customer",
    body: "Preview images and PDFs, open what you need, keep folders tidy. Built for the café desk, not a generic cloud dump.",
    bullets: ["Per-customer folders", "Preview before print", "Fast find at the counter"],
    cta: { href: `${APP_URL}/app/files`, label: "Open File Manager" },
    clip: "files",
    flip: true,
  },
  {
    id: "proof-photo",
    eyebrow: "Photo & PDF Tools",
    title: "Passport photos and scans that match counter rules",
    body: "Size, crop, background, export — the boring rules that reject applications if you get them wrong.",
    bullets: ["Exact sizes (e.g. 4.5×3.5)", "Print-ready export", "PDF tools for scans"],
    cta: { href: `${APP_URL}/app/photos`, label: "Open photo tools" },
    clip: "photo",
  },
  {
    id: "proof-workspace",
    eyebrow: "Operator Workspace",
    title: "One signed-in desk for the whole café day",
    body: "Customers, WhatsApp, files, photos, forms — one operating system your staff can run without juggling five apps.",
    bullets: ["Single login", "Tools in one sidebar", "Built for Hindi + English desks"],
    cta: { href: APP_URL, label: "Sign in to workspace" },
    clip: "workspace",
    flip: true,
  },
];

function Clip({ kind }: { kind: ProofBand["clip"] }) {
  switch (kind) {
    case "form":
      return <FormFillClip />;
    case "wa":
      return <WhatsAppProofClip />;
    case "customers":
      return <CustomersProofClip />;
    case "files":
      return <FilesProofClip />;
    case "photo":
      return <PhotoProofClip />;
    case "workspace":
      return <WorkspaceProofClip />;
  }
}

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
            People believe clips and walkthroughs — not slogans. Watch how each product behaves, starting with real form fill.
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
                <Clip kind={b.clip} />
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
