import {
  ArrowRight,
  Check,
  FileText,
  Image as ImageIcon,
  PenLine,
  Search,
  ShieldCheck,
  Sparkles,
  Brain,
  Workflow,
  Database,
  Camera,
  MessageCircle,
  User,
  ScanLine,
  AlertTriangle,
  ExternalLink,
  Play,
  Phone,
  Store,
  MapPin,
  Loader2,
  Menu,
  X,
} from "lucide-react";
import { useState, type ChangeEvent, type FormEvent, type InputHTMLAttributes } from "react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Conversion config — single source of truth                          */
/* ------------------------------------------------------------------ */
/* The WhatsApp number is injected at BUILD TIME via VITE_WHATSAPP_NUMBER
   (e.g. a Vercel env var) so the real number is never committed to this
   public repo. While it is unset, every WhatsApp CTA gracefully falls back
   to the on-page lead form (#cta) instead of a dead/fake wa.me link. */
const WHATSAPP_NUMBER = String(import.meta.env.VITE_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
const APP_URL = String(import.meta.env.VITE_APP_URL ?? "https://app.cybercontrol.fun");
const SITE_URL = "https://cybercontrol.fun";
const waEnabled = WHATSAPP_NUMBER.length >= 10;

const waLink = (message: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

/* Default Hindi+English demo intent */
const DEMO_MESSAGE =
  "नमस्ते! मुझे CyberControl का Hindi demo चाहिए।\n(Hi — I'd like to book a Hindi demo of CyberControl.)";

/* A "Book a Hindi Demo" CTA points to WhatsApp when configured, else the form. */
const demoLinkProps = waEnabled
  ? { href: waLink(DEMO_MESSAGE), target: "_blank", rel: "noopener noreferrer" }
  : { href: "#cta" };

/* ------------------------------------------------------------------ */
/* Small visual atoms                                                  */
/* ------------------------------------------------------------------ */

const Tag = ({ children, tone = "ink" }: { children: React.ReactNode; tone?: "ink" | "chaos" | "confidence" | "teal" | "marigold" }) => {
  const map: Record<string, string> = {
    ink: "border-ink/20 text-ink bg-paper",
    chaos: "border-chaos/40 text-chaos bg-chaos/5",
    confidence: "border-confidence/40 text-confidence bg-confidence/5",
    teal: "border-teal/40 text-teal-deep bg-teal/5",
    marigold: "border-marigold/50 text-marigold-deep bg-marigold/10",
  };
  return <span className={`tag-chip ${map[tone]}`}>{children}</span>;
};

/* Mini Aadhaar card mock */
const AadhaarCard = ({ rotate = "-6deg", className = "" }: { rotate?: string; className?: string }) => (
  <div
    className={`paper-card w-[170px] overflow-hidden ${className}`}
    style={{ transform: `rotate(${rotate})` }}
  >
    <div className="flex items-center justify-between bg-gradient-to-r from-aadhaar to-marigold-deep px-2 py-1 text-[8px] font-mono uppercase tracking-wider text-white">
      <span>भारत सरकार</span>
      <span>Govt of India</span>
    </div>
    <div className="flex gap-2 p-2">
      <div className="h-12 w-10 rounded-sm bg-gradient-to-br from-muted to-ink-soft/30 ring-1 ring-ink/10" />
      <div className="flex-1 space-y-1">
        <div className="text-[8px] font-mono uppercase text-muted-foreground">Name</div>
        <div className="text-[10px] font-semibold leading-tight text-ink">Ramesh Kumar</div>
        <div className="text-[8px] font-mono uppercase text-muted-foreground">DOB · M</div>
        <div className="font-mono text-[9px] tracking-wider text-ink">2847 9201 5536</div>
      </div>
    </div>
  </div>
);

/* WhatsApp chat bubble cluster */
const WhatsAppChat = ({ className = "" }: { className?: string }) => (
  <div className={`paper-card w-[220px] overflow-hidden ${className}`}>
    <div className="flex items-center gap-2 bg-whatsapp px-2.5 py-1.5 text-[11px] font-semibold text-white">
      <div className="grid h-6 w-6 place-items-center rounded-full bg-white/20">
        <MessageCircle className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 leading-tight">
        <div>Suresh Bhai</div>
        <div className="text-[9px] font-normal opacity-80">+91 98•••• 32118</div>
      </div>
    </div>
    <div className="space-y-1.5 bg-[hsl(50_30%_94%)] p-2">
      {[
        { txt: "bhaiya aadhaar bhej raha hu", me: true },
        { kind: "img", label: "aadhaar_front.jpg" },
        { kind: "img", label: "marksheet_10th.pdf" },
        { txt: "photo bhi chahiye kya?", me: true },
        { txt: "haan signature bhi", me: false },
        { kind: "img", label: "IMG_20251104.jpg" },
      ].map((m, i) =>
        m.kind === "img" ? (
          <div key={i} className="ml-auto w-[80%] rounded-md bg-whatsapp-bubble p-1.5 shadow-sm">
            <div className="flex h-12 items-center justify-center rounded-sm bg-gradient-to-br from-paper-deep to-muted ring-1 ring-ink/5">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-1 truncate text-[9px] font-mono text-ink-soft">{m.label}</div>
          </div>
        ) : (
          <div
            key={i}
            className={`max-w-[80%] rounded-md px-2 py-1 text-[10px] leading-tight shadow-sm ${
              m.me ? "ml-auto bg-whatsapp-bubble text-ink" : "bg-white text-ink"
            }`}
          >
            {m.txt}
          </div>
        )
      )}
    </div>
  </div>
);

/* Browser tabs mock */
const TabsMess = ({ className = "" }: { className?: string }) => (
  <div className={`paper-card w-[260px] overflow-hidden ${className}`}>
    <div className="flex gap-0.5 bg-paper-deep px-1.5 pt-1.5">
      {["uidai.gov.in", "rrbcdg.gov.in", "ssc.nic.in", "passport…", "csc.gov.in", "ind…"].map((t, i) => (
        <div
          key={t}
          className={`flex max-w-[60px] items-center gap-1 truncate rounded-t px-1.5 py-1 text-[9px] ${
            i === 0 ? "bg-white text-ink" : "bg-paper-deep/60 text-muted-foreground"
          }`}
        >
          <div className="h-1.5 w-1.5 rounded-full bg-gov-blue/70" />
          <span className="truncate">{t}</span>
        </div>
      ))}
    </div>
    <div className="space-y-1.5 bg-white p-2">
      <div className="flex items-center gap-1.5 rounded border border-border bg-paper-deep/50 px-1.5 py-1">
        <Search className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">railway group d required documents 2025…</span>
      </div>
      <div className="h-1.5 w-3/4 rounded bg-paper-deep" />
      <div className="h-1.5 w-2/3 rounded bg-paper-deep" />
      <div className="h-1.5 w-4/5 rounded bg-paper-deep" />
      <div className="flex gap-1">
        <div className="h-8 flex-1 rounded bg-gov-blue/10 ring-1 ring-gov-blue/20" />
        <div className="h-8 flex-1 rounded bg-paper-deep" />
      </div>
    </div>
  </div>
);

/* Sticky note */
const StickyNote = ({ children, rotate = "4deg", className = "" }: { children: React.ReactNode; rotate?: string; className?: string }) => (
  <div
    className={`sticky-note relative px-3 py-2 text-[13px] leading-tight text-ink ${className}`}
    style={{ transform: `rotate(${rotate})`, width: 130 }}
  >
    {children}
  </div>
);

/* Document chip */
const DocChip = ({ label, icon: Icon, tone = "paper" }: { label: string; icon: any; tone?: "paper" | "ok" }) => (
  <div
    className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium ${
      tone === "ok"
        ? "border-confidence/40 bg-confidence/10 text-confidence"
        : "border-border bg-card text-ink"
    }`}
  >
    <Icon className="h-3 w-3" />
    {label}
    {tone === "ok" && <Check className="ml-0.5 h-3 w-3" />}
  </div>
);

/* ------------------------------------------------------------------ */
/* ZONE 1 — CHAOS                                                      */
/* ------------------------------------------------------------------ */

const ZoneChaos = () => (
  <div className="relative h-full overflow-hidden rounded-2xl border border-chaos/20 bg-gradient-chaos p-5">
    {/* corner label */}
    <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-chaos text-[11px] font-bold text-white">1</span>
      <span className="label-mono text-chaos">Chaos</span>
    </div>
    <div className="absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-full bg-white/70 px-2 py-1 backdrop-blur">
      <AlertTriangle className="h-3 w-3 text-chaos" />
      <span className="label-mono text-chaos">11:42 AM · Queue: 4</span>
    </div>

    {/* operator + customer dialogue */}
    <div className="relative mt-10 flex items-end gap-3">
      {/* operator */}
      <div className="relative">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-ink text-paper ring-4 ring-white/60">
          <User className="h-7 w-7" />
        </div>
        <div className="label-mono mt-1 text-center text-ink-soft">Operator</div>
      </div>
      <div className="mb-6 max-w-[160px] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-[11px] leading-snug text-ink shadow-paper">
        “Ek minute… aapki marksheet kahan hai bhej do phir se?”
      </div>
    </div>
    <div className="relative mt-3 flex items-end justify-end gap-3">
      <div className="mb-6 max-w-[150px] rounded-2xl rounded-br-sm bg-ink px-3 py-2 text-[11px] leading-snug text-paper shadow-paper">
        “Bhaiya last month bhi to diya tha…”
      </div>
      <div className="grid h-12 w-12 place-items-center rounded-full bg-marigold text-ink ring-4 ring-white/60">
        <User className="h-6 w-6" />
      </div>
    </div>

    {/* clutter cluster — scales down on mobile so the fixed composition never overflows */}
    <div className="relative mt-2 h-[190px] origin-top-left scale-[0.78] sm:h-[230px] sm:scale-100">
      <WhatsAppChat className="absolute left-0 top-0 rotate-[-4deg] shadow-lift" />
      <TabsMess className="absolute right-0 top-4 rotate-[3deg] shadow-lift" />
      <AadhaarCard rotate="-14deg" className="absolute left-[150px] top-[140px] shadow-lift" />
      <StickyNote rotate="-8deg" className="absolute left-[10px] top-[180px]">
        Rahul ka <br />
        photo 4.5×3.5
      </StickyNote>
      <StickyNote rotate="10deg" className="absolute right-[30px] top-[150px]">
        ₹150 due <br />
        Suresh bhai
      </StickyNote>

      {/* scattered marks */}
      <div className="absolute left-[80px] top-[120px] h-2 w-2 rotate-45 bg-chaos/60" />
      <div className="absolute right-[120px] top-[20px] font-hindi text-2xl text-chaos/40">?</div>
      <div className="absolute right-[80px] top-[110px] font-hindi text-3xl text-ink/30">?</div>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* ZONE 2 — CYBERCONTROL                                               */
/* ------------------------------------------------------------------ */

const ZoneControl = () => (
  <div className="relative h-full overflow-hidden rounded-2xl bg-gradient-control p-5 text-paper shadow-lift ring-1 ring-teal/30">
    {/* grid backdrop */}
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.18]"
      style={{
        backgroundImage:
          "linear-gradient(hsl(178 70% 80% / 0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(178 70% 80% / 0.4) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    />

    <div className="relative z-10 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-marigold text-[11px] font-bold text-ink">2</span>
        <span className="label-mono text-marigold">CyberControl</span>
      </div>
      <div className="label-mono opacity-70">/// the engine</div>
    </div>

    {/* center hub */}
    <div className="relative z-10 mt-6 flex flex-col items-center">
      {/* incoming docs (top) */}
      <div className="flex w-full items-start justify-between gap-2 px-2">
        {[
          { i: FileText, l: "aadhaar.jpg" },
          { i: FileText, l: "marksheet.pdf" },
          { i: ImageIcon, l: "photo.jpg" },
          { i: PenLine, l: "sign.png" },
        ].map((d, idx) => (
          <div key={idx} className="flex flex-col items-center gap-1 animate-drift" style={{ animationDelay: `${idx * 0.4}s` }}>
            <div className="grid h-9 w-9 place-items-center rounded-md bg-paper/10 ring-1 ring-paper/20 backdrop-blur">
              <d.i className="h-4 w-4 text-paper" />
            </div>
            <span className="font-mono text-[8px] uppercase tracking-wider text-paper/60">{d.l}</span>
          </div>
        ))}
      </div>

      {/* flow lines */}
      <svg className="my-1 h-10 w-full" viewBox="0 0 240 40" fill="none">
        {[20, 90, 160, 220].map((x, i) => (
          <path
            key={i}
            d={`M${x} 0 Q ${x} 20 120 38`}
            stroke="hsl(var(--marigold))"
            strokeWidth="1.2"
            strokeDasharray="3 3"
            opacity="0.8"
          />
        ))}
      </svg>

      {/* the engine core */}
      <div className="relative">
        <div className="absolute inset-0 animate-pulse-ring rounded-full bg-marigold/30" />
        <div className="absolute -inset-2 animate-pulse-ring rounded-full bg-teal/30" style={{ animationDelay: "0.6s" }} />
        <div className="relative grid h-32 w-32 place-items-center rounded-full bg-gradient-marigold shadow-lift ring-4 ring-paper/10">
          <div className="grid h-24 w-24 place-items-center rounded-full bg-ink text-paper">
            <div className="text-center">
              <div className="font-display text-[10px] uppercase tracking-[0.2em] text-marigold">Cyber</div>
              <div className="font-display text-base font-bold leading-none">CONTROL</div>
              <div className="mx-auto mt-1 h-1 w-6 rounded-full bg-marigold" />
            </div>
          </div>
        </div>
      </div>

      {/* outgoing capabilities (bottom) */}
      <div className="mt-5 grid w-full grid-cols-2 gap-2">
        {[
          { i: Brain, l: "Memory" },
          { i: Database, l: "Organize" },
          { i: Sparkles, l: "Intelligence" },
          { i: Workflow, l: "Workflow" },
        ].map((c, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 rounded-lg border border-marigold/30 bg-paper/5 px-2.5 py-1.5 backdrop-blur"
          >
            <c.i className="h-3.5 w-3.5 text-marigold" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-paper">{c.l}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* ZONE 3 — CONFIDENCE                                                 */
/* ------------------------------------------------------------------ */

const ZoneConfidence = () => (
  <div className="relative h-full overflow-hidden rounded-2xl border border-confidence/30 bg-gradient-confidence p-5">
    <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-confidence text-[11px] font-bold text-white">3</span>
      <span className="label-mono text-confidence">Confidence</span>
    </div>
    <div className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-full bg-white/70 px-2 py-1 backdrop-blur">
      <ShieldCheck className="h-3 w-3 text-confidence" />
      <span className="label-mono text-confidence">Ready · 11:43 AM</span>
    </div>

    {/* customer profile card */}
    <div className="mt-10 paper-card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border bg-paper-deep/60 px-3 py-2">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-ink text-paper">
          <User className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="font-display text-sm font-semibold text-ink">Suresh Yadav</div>
          <div className="font-mono text-[10px] text-muted-foreground">+91 98•••• 32118 · since Aug ’24</div>
        </div>
        <Tag tone="confidence">
          <Check className="h-3 w-3" /> Verified
        </Tag>
      </div>
      <div className="grid grid-cols-2 gap-1.5 p-3">
        <DocChip label="Aadhaar" icon={FileText} tone="ok" />
        <DocChip label="10th Marksheet" icon={FileText} tone="ok" />
        <DocChip label="PAN" icon={FileText} tone="ok" />
        <DocChip label="Photo 4.5×3.5" icon={ImageIcon} tone="ok" />
        <DocChip label="Signature 3×1" icon={PenLine} tone="ok" />
        <DocChip label="Caste Cert." icon={FileText} tone="ok" />
      </div>
    </div>

    {/* form ready card */}
    <div className="mt-3 paper-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-confidence/10 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className="grid h-5 w-5 place-items-center rounded-sm bg-gov-blue text-[8px] font-bold text-white">IN</div>
          <span className="text-[11px] font-semibold text-ink">RRB Group D · 2025</span>
        </div>
        <Tag tone="confidence">Form Ready</Tag>
      </div>
      <div className="space-y-1.5 p-3">
        <div className="flex items-center gap-2 text-[11px] text-ink">
          <Check className="h-3 w-3 text-confidence" /> 14 / 14 fields autofilled
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ink">
          <Check className="h-3 w-3 text-confidence" /> Photo cropped to spec
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ink">
          <Check className="h-3 w-3 text-confidence" /> Fee ₹500 · Pay via UPI
        </div>
      </div>
    </div>

    {/* operator + customer reaction */}
    <div className="mt-3 flex items-end justify-between gap-2">
      <div className="flex items-end gap-2">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-ink text-paper">
          <User className="h-5 w-5" />
        </div>
        <div className="mb-2 rounded-2xl rounded-bl-sm bg-white px-2.5 py-1.5 text-[10px] text-ink shadow-paper">
          Ho gaya. ₹500 + ₹50 service.
        </div>
      </div>
      <div className="flex items-end gap-2">
        <div className="mb-2 rounded-2xl rounded-br-sm bg-confidence px-2.5 py-1.5 text-[10px] text-white shadow-paper">
          Wah! 2 minute mein!
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-full bg-marigold text-ink">
          <User className="h-5 w-5" />
        </div>
      </div>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Arrow connector between zones                                        */
/* ------------------------------------------------------------------ */

const ZoneArrow = ({ label }: { label: string }) => (
  <div className="hidden flex-col items-center justify-center gap-2 lg:flex">
    <svg width="48" height="20" viewBox="0 0 48 20" fill="none">
      <path d="M0 10 H40" stroke="hsl(var(--ink))" strokeWidth="2" strokeDasharray="4 3" />
      <path d="M36 4 L46 10 L36 16" stroke="hsl(var(--ink))" strokeWidth="2" fill="none" />
    </svg>
    <span className="label-mono text-ink-soft">{label}</span>
  </div>
);

/* ------------------------------------------------------------------ */
/* Workflow strip                                                       */
/* ------------------------------------------------------------------ */

const workflow = [
  { icon: User, label: "Customer Arrives" },
  { icon: MessageCircle, label: "Documents Received" },
  { icon: Brain, label: "Customer Remembered" },
  { icon: Camera, label: "Photo Prepared" },
  { icon: Search, label: "Find Form" },
  { icon: PenLine, label: "Fill Form" },
  { icon: ShieldCheck, label: "Work Completed" },
];

const WorkflowStrip = () => (
  <div className="rounded-2xl border border-ink/15 bg-ink p-5 text-paper shadow-lift">
    <div className="mb-3 flex items-center justify-between">
      <span className="label-mono text-marigold">/// the loop, every customer</span>
      <span className="label-mono text-paper/60">7 steps · 2 minutes</span>
    </div>
    <div className="flex items-center gap-1 overflow-x-auto">
      {workflow.map((s, i) => (
        <div key={s.label} className="flex flex-1 items-center gap-1">
          <div className="flex min-w-[110px] flex-1 flex-col items-center gap-2 rounded-xl border border-paper/10 bg-paper/5 px-2 py-3 text-center">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-marigold text-ink">
              <s.icon className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-semibold leading-tight">{s.label}</span>
            <span className="font-mono text-[9px] uppercase tracking-widest text-paper/50">step {i + 1}</span>
          </div>
          {i < workflow.length - 1 && (
            <ArrowRight className="hidden h-4 w-4 shrink-0 text-marigold md:block" />
          )}
        </div>
      ))}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Pillars strip                                                        */
/* ------------------------------------------------------------------ */

const pillars = [
  { icon: Brain, title: "Customer Memory", sub: "Every customer, every doc, every visit — remembered forever." },
  { icon: MessageCircle, title: "WhatsApp Documents", sub: "Drop forwarded files into the right profile in one tap." },
  { icon: Sparkles, title: "Form Intelligence", sub: "Knows required docs, photo specs, fees & official link for 800+ forms." },
  { icon: Camera, title: "Photo & Signature Tool", sub: "Auto-crop, resize & background-fix to government specs." },
];

const PillarsStrip = () => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {pillars.map((p) => (
      <div key={p.title} className="paper-card group p-4 transition hover:-translate-y-0.5 hover:shadow-lift">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-marigold/15 text-marigold-deep ring-1 ring-marigold/30">
            <p.icon className="h-4 w-4" />
          </div>
          <div className="font-display text-[15px] font-semibold text-ink">{p.title}</div>
        </div>
        <p className="mt-2 text-[12.5px] leading-snug text-muted-foreground">{p.sub}</p>
      </div>
    ))}
  </div>
);

/* ------------------------------------------------------------------ */
/* Nav                                                                  */
/* ------------------------------------------------------------------ */

const Nav = () => {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "#story", label: "How it works" },
    { href: "#humse", label: "For operators" },
    { href: "#used-for", label: "Used for" },
    { href: "#memory", label: "Memory" },
  ];
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-paper/85 backdrop-blur">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-ink">
            <span className="h-2.5 w-2.5 rounded-sm bg-marigold" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-ink">
            Cyber<span className="text-marigold-deep">Control</span>
          </span>
        </div>
        <nav className="hidden items-center gap-7 text-[13px] font-medium text-ink-soft md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-ink">{l.label}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a
            href={APP_URL}
            className="hidden text-[13px] font-medium text-ink-soft hover:text-ink sm:block"
          >
            Sign in
          </a>
          <a
            {...demoLinkProps}
            aria-label="Book a Hindi demo"
            className="inline-flex items-center gap-1.5 rounded-md bg-whatsapp px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-paper transition hover:brightness-95"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Book a Hindi Demo</span>
            <span className="sm:hidden">Demo</span>
          </a>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="grid h-9 w-9 place-items-center rounded-md text-ink-soft transition hover:bg-ink/5 md:hidden"
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open && (
        <nav data-testid="mobile-menu" className="border-t border-border bg-paper md:hidden">
          <div className="container flex flex-col py-2">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-2.5 text-sm font-medium text-ink-soft hover:text-ink"
              >
                {l.label}
              </a>
            ))}
            <a
              href={APP_URL}
              onClick={() => setOpen(false)}
              className="border-t border-border py-2.5 text-sm font-medium text-ink-soft hover:text-ink"
            >
              Sign in
            </a>
          </div>
        </nav>
      )}
    </header>
  );
};

/* ------------------------------------------------------------------ */
/* Hero — the giant explainer                                           */
/* ------------------------------------------------------------------ */

const Hero = () => (
  <section className="relative">
    <div className="container pt-8 pb-6">
      {/* eyebrow row */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Tag tone="marigold">
          <span className="h-1.5 w-1.5 rounded-full bg-marigold-deep" />
          Built for India's 3 lakh cybercafes
        </Tag>
        <Tag tone="ink">Hindi · हिंदी · English</Tag>
        <Tag tone="teal">800+ government forms mapped</Tag>
      </div>

      {/* headline */}
      <div className="grid items-end gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <h1 className="font-display text-[clamp(2.4rem,5.6vw,4.6rem)] font-bold leading-[0.95] tracking-tight text-ink">
          Never Start From <span className="scribble-underline">Scratch</span> Again
          <span className="ml-2 inline-block font-hindi text-marigold-deep">।</span>
        </h1>
        <p className="text-[15.5px] leading-relaxed text-ink-soft lg:text-right">
          Remember every customer, organize every document, prepare every photo, and confidently complete any government service —
          all from one operating system built for the way <em>cybercafes actually work</em>.
        </p>
      </div>

      {/* THE GIANT INFOGRAPHIC */}
      <div className="relative mt-8 rounded-3xl border border-ink/10 bg-paper-deep/50 p-3 shadow-paper sm:p-5">
        {/* zones row */}
        <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[1fr_auto_1.05fr_auto_1fr]">
          <ZoneChaos />
          <ZoneArrow label="ingest" />
          <ZoneControl />
          <ZoneArrow label="deliver" />
          <ZoneConfidence />
        </div>

        {/* workflow */}
        <div className="mt-4">
          <WorkflowStrip />
        </div>

        {/* pillars */}
        <div className="mt-4">
          <PillarsStrip />
        </div>
      </div>

      {/* CTA row */}
      <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <a
          {...demoLinkProps}
          aria-label="Book a Hindi demo"
          className="inline-flex items-center gap-2 rounded-md bg-whatsapp px-5 py-3 text-[14px] font-semibold text-white shadow-paper transition hover:brightness-95"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Book a Hindi Demo
        </a>
        <a
          href="#demo"
          className="inline-flex items-center gap-2 rounded-md border border-ink/20 bg-paper px-5 py-3 text-[14px] font-semibold text-ink hover:bg-paper-deep"
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          Watch the 90-second story
        </a>
        <span className="text-[12px] text-muted-foreground">
          Free demo on WhatsApp · works on your existing PC · setup in 7 minutes.
        </span>
      </div>
    </div>
  </section>
);

/* ------------------------------------------------------------------ */
/* "Ye humse nahi hoga" section                                         */
/* ------------------------------------------------------------------ */

const HumseSection = () => (
  <section id="humse" className="relative border-y border-border bg-ink py-20 text-paper">
    <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{
      backgroundImage: "radial-gradient(hsl(var(--marigold)) 1px, transparent 1px)",
      backgroundSize: "24px 24px",
    }} />
    <div className="container relative">
      <div className="mx-auto max-w-3xl text-center">
        <span className="label-mono text-marigold">/// the moment that changes</span>
        <h2 className="mt-3 font-display text-[clamp(2rem,4.5vw,3.6rem)] font-bold leading-[1.02] tracking-tight">
          Never say{" "}
          <span className="font-hindi text-marigold">‘ये हमसे नहीं होगा’</span>{" "}
          again.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-paper/70">
          A customer walks in asking for an unfamiliar form. Most operators say no.
          With CyberControl, you say <span className="text-marigold">yes</span> — in seven seconds.
        </p>
      </div>

      {/* Two-panel scene */}
      <div className="mx-auto mt-12 grid max-w-6xl items-stretch gap-5 lg:grid-cols-[1fr_auto_1.3fr]">
        {/* LEFT — the ask */}
        <div className="rounded-2xl border border-paper/10 bg-paper/[0.04] p-5">
          <span className="label-mono text-paper/50">Customer · 12:18 PM</span>
          <div className="mt-4 flex items-end gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-marigold text-ink">
              <User className="h-6 w-6" />
            </div>
            <div className="rounded-2xl rounded-bl-sm bg-paper px-4 py-3 text-[14px] leading-snug text-ink shadow-paper">
              “Bhaiya, <strong>Railway Group D</strong> ka form bharna hai. Ho jayega?”
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-chaos/40 bg-chaos/10 p-3 text-[12px]">
            <div className="label-mono mb-1 text-chaos">old way</div>
            <ul className="space-y-1 text-paper/70">
              <li>· Google for 10 minutes</li>
              <li>· Not sure what docs are needed</li>
              <li>· Photo spec? No idea.</li>
              <li>· “Sir, ye humse nahi hoga.” 😞</li>
            </ul>
          </div>
        </div>

        {/* ARROW */}
        <div className="hidden items-center justify-center lg:flex">
          <div className="flex flex-col items-center gap-2">
            <Sparkles className="h-5 w-5 text-marigold" />
            <div className="h-32 w-px bg-gradient-to-b from-marigold to-transparent" />
            <span className="label-mono text-marigold">cybercontrol</span>
            <div className="h-32 w-px bg-gradient-to-t from-marigold to-transparent" />
            <ArrowRight className="h-5 w-5 text-marigold" />
          </div>
        </div>

        {/* RIGHT — CyberControl result */}
        <div className="paper-card overflow-hidden text-ink shadow-lift">
          <div className="flex items-center justify-between border-b border-border bg-paper-deep px-4 py-2.5">
            <div className="flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-teal" />
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink">
                form intel · "railway group d"
              </span>
            </div>
            <Tag tone="confidence">
              <Check className="h-3 w-3" /> Supported
            </Tag>
          </div>

          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <div>
              <span className="label-mono text-muted-foreground">Required documents</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["Aadhaar", "10th Marksheet", "Caste Cert.", "PAN", "Email", "Mobile OTP"].map((d) => (
                  <DocChip key={d} label={d} icon={FileText} />
                ))}
              </div>
            </div>

            <div>
              <span className="label-mono text-muted-foreground">Photo · Signature spec</span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-md border border-border bg-paper-deep/40 p-2">
                  <div className="flex items-center gap-1.5">
                    <Camera className="h-3.5 w-3.5 text-marigold-deep" />
                    <span className="text-[11px] font-semibold">Photo</span>
                  </div>
                  <div className="mt-1 font-mono text-[10.5px] leading-tight text-ink-soft">
                    35×45 mm<br />20–50 KB · JPG<br />white bg
                  </div>
                </div>
                <div className="rounded-md border border-border bg-paper-deep/40 p-2">
                  <div className="flex items-center gap-1.5">
                    <PenLine className="h-3.5 w-3.5 text-marigold-deep" />
                    <span className="text-[11px] font-semibold">Signature</span>
                  </div>
                  <div className="mt-1 font-mono text-[10.5px] leading-tight text-ink-soft">
                    140×60 px<br />10–20 KB · JPG<br />black ink
                  </div>
                </div>
              </div>
            </div>

            <div className="sm:col-span-2">
              <span className="label-mono text-muted-foreground">Official link</span>
              <div className="mt-2 flex items-center justify-between rounded-md border border-gov-blue/30 bg-gov-blue/5 px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="grid h-6 w-6 place-items-center rounded-sm bg-gov-blue text-[9px] font-bold text-white">IN</div>
                  <span className="font-mono text-[11.5px] text-ink">rrbcdg.gov.in/group-d-2025</span>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-gov-blue" />
              </div>
            </div>

            <div className="sm:col-span-2 flex items-center justify-between gap-3 rounded-xl bg-confidence/10 px-4 py-3 ring-1 ring-confidence/30">
              <div>
                <div className="font-display text-[15px] font-semibold text-ink">
                  Confidence: ready to file
                </div>
                <div className="text-[11.5px] text-muted-foreground">
                  Suresh's profile has 5/6 docs. One photo retake needed.
                </div>
              </div>
              <div
                aria-hidden="true"
                className="inline-flex select-none items-center gap-1.5 rounded-md bg-confidence px-3 py-2 text-[12px] font-semibold text-white"
              >
                Accept work <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* operator final reaction */}
      <div className="mx-auto mt-8 flex max-w-xl items-end justify-end gap-3">
        <div className="rounded-2xl rounded-br-sm bg-marigold px-4 py-3 text-[14px] font-semibold text-ink shadow-paper">
          “Haan ji, abhi ho jayega.” ✅
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-full bg-paper text-ink">
          <User className="h-6 w-6" />
        </div>
      </div>
    </div>
  </section>
);

/* ------------------------------------------------------------------ */
/* "Remembers every customer" section                                   */
/* ------------------------------------------------------------------ */

const MemorySection = () => (
  <section id="memory" className="relative py-20">
    <div className="container">
      <div className="grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <span className="label-mono text-marigold-deep">/// returning customer</span>
          <h2 className="mt-3 font-display text-[clamp(2rem,4vw,3.4rem)] font-bold leading-[1.02] tracking-tight text-ink">
            CyberControl <span className="scribble-underline">remembers</span> every customer.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
            Suresh visited last August for his PAN card. Today he's back for a passport renewal.
            You don't ask. You don't search WhatsApp. You don't request the same documents twice.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
            One search — and a complete profile opens with everything already where it should be.
          </p>

          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { k: "98%", v: "repeat customer recall" },
              { k: "0", v: "duplicate document asks" },
              { k: "2m", v: "from arrival to filing" },
            ].map((s) => (
              <div key={s.k} className="paper-card p-3">
                <div className="font-display text-2xl font-bold text-ink">{s.k}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Profile reveal */}
        <div className="paper-card overflow-hidden shadow-lift">
          {/* search bar */}
          <div className="flex items-center gap-2 border-b border-border bg-paper-deep px-4 py-2.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-[12px] text-ink">suresh 32118</span>
            <span className="ml-auto label-mono text-confidence">1 match · 0.2s</span>
          </div>

          {/* profile body */}
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-2">
              <div className="grid h-20 w-20 place-items-center rounded-xl bg-gradient-marigold text-ink ring-4 ring-marigold/20">
                <User className="h-10 w-10" />
              </div>
              <Tag tone="confidence"><Check className="h-3 w-3"/>KYC ok</Tag>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                4 visits
              </span>
            </div>

            <div>
              <div className="font-display text-xl font-semibold text-ink">Suresh Yadav</div>
              <div className="font-mono text-[11px] text-muted-foreground">
                +91 98•••• 32118 · Patna · since 12 Aug 2024
              </div>

              <div className="mt-4">
                <span className="label-mono text-muted-foreground">Documents on file</span>
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {[
                    "Aadhaar",
                    "PAN",
                    "10th Marksheet",
                    "12th Marksheet",
                    "Photo 4.5×3.5",
                    "Signature",
                  ].map((d) => (
                    <DocChip key={d} label={d} icon={FileText} tone="ok" />
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-border bg-paper-deep/40 p-3">
                <span className="label-mono text-muted-foreground">Past services</span>
                <ul className="mt-2 space-y-1.5 text-[12.5px] text-ink">
                  <li className="flex items-center justify-between">
                    <span>· PAN application</span>
                    <span className="font-mono text-[10px] text-muted-foreground">12 Aug 2024</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>· Aadhaar address update</span>
                    <span className="font-mono text-[10px] text-muted-foreground">04 Jan 2025</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>· Voter ID correction</span>
                    <span className="font-mono text-[10px] text-muted-foreground">19 Mar 2025</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* footer cta */}
          <div className="flex items-center justify-between gap-3 border-t border-border bg-confidence/10 px-5 py-3">
            <span className="text-[13px] text-ink">
              Today: <strong>Passport renewal</strong> — all docs present.
            </span>
            <div
              aria-hidden="true"
              className="inline-flex select-none items-center gap-1.5 rounded-md bg-ink px-3 py-2 text-[12px] font-semibold text-paper"
            >
              Open profile <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

/* ------------------------------------------------------------------ */
/* "Used For" — trust strip (operators think in services)               */
/* ------------------------------------------------------------------ */

const usedFor = [
  "SSC Forms",
  "Railway Forms",
  "Scholarship Forms",
  "Passport Services",
  "Bihar Government Forms",
  "University Admissions",
];

const UsedForSection = () => (
  <section id="used-for" className="border-y border-border bg-paper-deep/40 py-12">
    <div className="container">
      <div className="flex flex-col items-center gap-7 lg:flex-row lg:justify-between">
        <div className="text-center lg:max-w-xs lg:text-left">
          <span className="label-mono text-marigold-deep">/// used every day for</span>
          <h2 className="mt-2 font-display text-2xl font-bold leading-tight tracking-tight text-ink">
            The real services your customers walk in for
          </h2>
        </div>
        <ul className="grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2 lg:w-auto">
          {usedFor.map((s) => (
            <li
              key={s}
              className="flex items-center gap-2.5 rounded-lg border border-confidence/30 bg-confidence/5 px-3.5 py-2.5 text-[13px] font-medium text-ink"
            >
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-confidence text-white">
                <Check className="h-2.5 w-2.5" aria-hidden="true" />
              </span>
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  </section>
);

/* ------------------------------------------------------------------ */
/* Demo video — reserved placeholder (no video yet)                     */
/* ------------------------------------------------------------------ */

const DemoVideoSection = () => (
  <section id="demo" className="container py-16">
    <div className="mx-auto max-w-3xl text-center">
      <span className="label-mono text-marigold-deep">/// see it in action</span>
      <h2 className="mt-2 font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-bold leading-tight tracking-tight text-ink">
        90 seconds, chaos to confidence
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-[14.5px] leading-relaxed text-ink-soft">
        Watch a real cybercafe handle a Railway form end-to-end — a short Hindi walkthrough.
      </p>
    </div>

    <div className="relative mx-auto mt-8 aspect-video max-w-4xl overflow-hidden rounded-2xl border border-ink/15 bg-ink shadow-lift">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(178 70% 80% / 0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(178 70% 80% / 0.4) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-3 text-paper">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-marigold text-ink shadow-lift">
            <Play className="h-7 w-7 translate-x-0.5" aria-hidden="true" />
          </span>
          <span className="label-mono text-marigold">demo video coming soon</span>
          <span className="text-[12px] text-paper/60">45–60 second Hindi walkthrough</span>
        </div>
      </div>
    </div>
  </section>
);

/* ------------------------------------------------------------------ */
/* Lead capture form — composes a WhatsApp message (no backend needed)  */
/* ------------------------------------------------------------------ */

const Field = ({
  id,
  label,
  icon: Icon,
  ...props
}: {
  id: string;
  label: string;
  icon: any;
} & InputHTMLAttributes<HTMLInputElement>) => (
  <label htmlFor={id} className="block">
    <span className="label-mono mb-1 block text-ink-soft">{label}</span>
    <span className="flex items-center gap-2 rounded-md border border-ink/15 bg-paper px-3 py-2 focus-within:ring-2 focus-within:ring-marigold/50">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        id={id}
        {...props}
        className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-muted-foreground/60"
      />
    </span>
  </label>
);

const LeadForm = () => {
  const [form, setForm] = useState({ name: "", mobile: "", shop: "", city: "" });
  const [submitting, setSubmitting] = useState(false);
  const update =
    (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const mobile = form.mobile.replace(/\D/g, "");
    if (!form.name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (mobile.length < 10) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }
    setSubmitting(true);
    const msg =
      "नमस्ते! मुझे CyberControl का Hindi demo चाहिए।\n\n" +
      `Name: ${form.name.trim()}\n` +
      `Mobile: ${mobile}\n` +
      (form.shop.trim() ? `Shop: ${form.shop.trim()}\n` : "") +
      (form.city.trim() ? `City: ${form.city.trim()}\n` : "");
    if (waEnabled) {
      window.open(waLink(msg), "_blank", "noopener,noreferrer");
      toast.success("Opening WhatsApp — send the message to confirm your demo.");
    } else {
      // No WhatsApp channel wired yet (production phase). Acknowledge gracefully.
      toast.success(`Thanks, ${form.name.trim().split(" ")[0]}! Our team will reach out shortly.`);
      setForm({ name: "", mobile: "", shop: "", city: "" });
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="lead-name" label="Your name" icon={User} value={form.name} onChange={update("name")} placeholder="Ramesh Kumar" autoComplete="name" required />
        <Field id="lead-mobile" label="Mobile number" icon={Phone} value={form.mobile} onChange={update("mobile")} placeholder="98XXXXXXXX" type="tel" inputMode="numeric" autoComplete="tel" required />
        <Field id="lead-shop" label="Shop name" icon={Store} value={form.shop} onChange={update("shop")} placeholder="Sharma Cyber Cafe" />
        <Field id="lead-city" label="City" icon={MapPin} value={form.city} onChange={update("city")} placeholder="Patna" />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-whatsapp px-5 py-3 text-[14px] font-semibold text-white shadow-paper transition hover:brightness-95 disabled:opacity-70"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
        )}
        Book my Hindi demo on WhatsApp
      </button>
      <p className="text-center text-[11px] text-muted-foreground">
        No spam — we message you on WhatsApp to schedule. Takes 2 minutes.
      </p>
    </form>
  );
};

/* ------------------------------------------------------------------ */
/* Floating WhatsApp button                                             */
/* ------------------------------------------------------------------ */

const FloatingWhatsApp = () => (
  <a
    {...demoLinkProps}
    aria-label="Book a Hindi demo"
    className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full bg-whatsapp px-4 py-3 text-[13px] font-semibold text-white shadow-lift ring-2 ring-white/40 transition hover:brightness-95"
  >
    <MessageCircle className="h-5 w-5" aria-hidden="true" />
    <span className="hidden sm:inline">Book a Hindi Demo</span>
  </a>
);

/* ------------------------------------------------------------------ */
/* Final CTA + footer                                                   */
/* ------------------------------------------------------------------ */

const FinalCTA = () => (
  <section id="cta" className="container py-20">
    <div className="overflow-hidden rounded-3xl bg-gradient-marigold p-6 shadow-lift sm:p-8 md:p-12">
      <div className="grid items-center gap-7 md:grid-cols-[1.05fr_1fr]">
        <div>
          <span className="label-mono text-ink/70">/// the upgrade</span>
          <h3 className="mt-2 font-display text-[clamp(1.8rem,3.6vw,2.8rem)] font-bold leading-[1.02] text-ink">
            Your cybercafe, finally <span className="font-hindi">सुव्यवस्थित</span>.
          </h3>
          <p className="mt-3 max-w-lg text-[14.5px] leading-relaxed text-ink/80">
            Stop starting from zero with every customer. Book a free Hindi demo and watch chaos
            turn into confidence by tomorrow morning.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Tag tone="ink">₹499 / month after trial</Tag>
            <Tag tone="ink">UPI accepted</Tag>
            <Tag tone="ink">Cancel anytime</Tag>
          </div>
          {waEnabled && (
            <p className="mt-4 text-[12.5px] text-ink/70">
              Prefer to talk first?{" "}
              <a
                href={waLink(DEMO_MESSAGE)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-ink underline underline-offset-2"
              >
                Message us on WhatsApp
              </a>
              .
            </p>
          )}
        </div>

        <div className="rounded-2xl bg-paper/95 p-5 shadow-lift ring-1 ring-ink/5">
          <div className="mb-3">
            <div className="font-display text-[16px] font-semibold text-ink">Book a free Hindi demo</div>
            <div className="text-[12px] text-muted-foreground">
              See it run on a real government form — in 2 minutes.
            </div>
          </div>
          <LeadForm />
        </div>
      </div>
    </div>
  </section>
);

const Footer = () => (
  <footer className="border-t border-border bg-paper-deep/60">
    <div className="container flex flex-col items-start justify-between gap-3 py-6 text-[12px] text-muted-foreground md:flex-row md:items-center">
      <div className="flex items-center gap-2">
        <div className="grid h-5 w-5 place-items-center rounded bg-ink">
          <span className="h-1.5 w-1.5 rounded-sm bg-marigold" />
        </div>
        <span className="font-display font-semibold text-ink">CyberControl</span>
        <span>· Made in India for India's cybercafes</span>
      </div>
      <div className="flex items-center gap-5">
        <a href="#used-for" className="hover:text-ink">Services</a>
        <a href={APP_URL} className="hover:text-ink">Sign in</a>
        <a {...demoLinkProps} className="hover:text-ink">
          Contact
        </a>
      </div>
    </div>
  </footer>
);

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

const Index = () => (
  <div className="min-h-screen bg-background text-foreground">
    <Nav />
    <main id="story">
      <Hero />
      <DemoVideoSection />
      <UsedForSection />
      <HumseSection />
      <MemorySection />
      <FinalCTA />
    </main>
    <Footer />
    <FloatingWhatsApp />
  </div>
);

export default Index;
