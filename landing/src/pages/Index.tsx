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
  Download,
  Menu,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent, type InputHTMLAttributes } from "react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Conversion config ‚Äî single source of truth                          */
/* ------------------------------------------------------------------ */
/* The WhatsApp number is injected at BUILD TIME via VITE_WHATSAPP_NUMBER
   (e.g. a Vercel env var) so the real number is never committed to this
   public repo. While it is unset, every WhatsApp CTA gracefully falls back
   to the on-page lead form (#cta) instead of a dead/fake wa.me link. */
const WHATSAPP_NUMBER = String(import.meta.env.VITE_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
const APP_URL = String(import.meta.env.VITE_APP_URL ?? "https://app.cybercontrol.fun");
const SITE_URL = "https://cybercontrol.fun";
const EXTENSION_URL = "/cybercontrol-extension.zip";
const EXTENSION_VERSION = "5.79";
const waEnabled = WHATSAPP_NUMBER.length >= 10;

const waLink = (message: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

/* Default Hindi+English demo intent */
const DEMO_MESSAGE =
  "‡§®‡§Æ‡§∏‡•ç‡§§‡•á! ‡§Æ‡•Å‡§ù‡•á CyberControl ‡§ï‡§æ Hindi demo ‡§ö‡§æ‡§π‡§ø‡§è‡•§\n(Hi ‚Äî I'd like to book a Hindi demo of CyberControl.)";

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
      <span>‡§≠‡§æ‡§∞‡§§ ‡§∏‡§∞‡§ï‡§æ‡§∞</span>
      <span>Govt of India</span>
    </div>
    <div className="flex gap-2 p-2">
      <div className="h-12 w-10 rounded-sm bg-gradient-to-br from-muted to-ink-soft/30 ring-1 ring-ink/10" />
      <div className="flex-1 space-y-1">
        <div className="text-[8px] font-mono uppercase text-muted-foreground">Name</div>
        <div className="text-[10px] font-semibold leading-tight text-ink">Ramesh Kumar</div>
        <div className="text-[8px] font-mono uppercase text-muted-foreground">DOB ¬∑ M</div>
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
        <div className="text-[9px] font-normal opacity-80">+91 98‚Ä¢‚Ä¢‚Ä¢‚Ä¢ 32118</div>
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
      {["uidai.gov.in", "rrbcdg.gov.in", "ssc.nic.in", "passport‚Ä¶", "csc.gov.in", "ind‚Ä¶"].map((t, i) => (
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
        <span className="text-[10px] text-muted-foreground">railway group d required documents 2025‚Ä¶</span>
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
const DocChip = ({ label, icon: Icon, tone = "paper" }: { label: string; icon: LucideIcon; tone?: "paper" | "ok" }) => (
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
/* ZONE 1 ‚Äî CHAOS                                                      */
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
      <span className="label-mono text-chaos">11:42 AM ¬∑ Queue: 4</span>
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
        ‚ÄúEk minute‚Ä¶ aapki marksheet kahan hai bhej do phir se?‚Äù
      </div>
    </div>
    <div className="relative mt-3 flex items-end justify-end gap-3">
      <div className="mb-6 max-w-[150px] rounded-2xl rounded-br-sm bg-ink px-3 py-2 text-[11px] leading-snug text-paper shadow-paper">
        ‚ÄúBhaiya last month bhi to diya tha‚Ä¶‚Äù
      </div>
      <div className="grid h-12 w-12 place-items-center rounded-full bg-marigold text-ink ring-4 ring-white/60">
        <User className="h-6 w-6" />
      </div>
    </div>

    {/* clutter cluster ‚Äî scales down on mobile so the fixed composition never overflows */}
    <div className="relative mt-2 h-[190px] origin-top-left scale-[0.78] sm:h-[230px] sm:scale-100">
      <WhatsAppChat className="absolute left-0 top-0 rotate-[-4deg] shadow-lift" />
      <TabsMess className="absolute right-0 top-4 rotate-[3deg] shadow-lift" />
      <AadhaarCard rotate="-14deg" className="absolute left-[150px] top-[140px] shadow-lift" />
      <StickyNote rotate="-8deg" className="absolute left-[10px] top-[180px]">
        Rahul ka <br />
        photo 4.5√ó3.5
      </StickyNote>
      <StickyNote rotate="10deg" className="absolute right-[30px] top-[150px]">
        ‚Çπ150 due <br />
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
/* ZONE 2 ‚Äî CYBERCONTROL                                               */
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
          <div˜è9∂âûÀk∫wµÁ@ÄÄΩ±§¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩ’∞¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯4(4(ÄÄÄÄÄÄÄÄÄÅÏº®ÅôΩΩ—ï»Åç—ÑÄ®ΩÙ4(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâô±ï‡Å•—ïµÃµçïπ—ï»Å©’Õ—•ô‰µâï—›ïï∏ÅùÖ¿¥ÃÅâΩ…ëï»µ–ÅâΩ…ëï»µâΩ…ëï»ÅâúµçΩπô•ëïπçîºƒ¿Å¡‡¥‘Å¡‰¥Ãà¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ—ï·–µlƒÕ¡·tÅ—ï·–µ•π¨à¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅQΩëÖ‰ËÄÒÕ—…Ωπú˘AÖÕÕ¡Ω…–Å…ïπï›Ö∞ΩÕ—…Ωπú¯ÉäPÅÖ±∞ÅëΩçÃÅ¡…ïÕïπ–∏4(ÄÄÄÄÄÄÄÄÄÄÄÄΩÕ¡Ö∏¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿ4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖ…•Ñµ°•ëëï∏Ùâ—…’îà4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅç±ÖÕÕ9ÖµîÙâ•π±•πîµô±ï‡ÅÕï±ïç–µπΩπîÅ•—ïµÃµçïπ—ï»ÅùÖ¿¥ƒ∏‘Å…Ω’πëïêµµêÅâúµ•π¨Å¡‡¥ÃÅ¡‰¥»Å—ï·–µlƒ…¡·tÅôΩπ–µÕïµ•âΩ±êÅ—ï·–µ¡Ö¡ï»à4(ÄÄÄÄÄÄÄÄÄÄÄÄ¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ=¡ï∏Å¡…Ωô•±îÄÒ……Ω›I•ù°–Åç±ÖÕÕ9ÖµîÙâ†¥Ã∏‘Å‹¥Ã∏‘àÄº¯4(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄΩë•ÿ¯4(ÄÄΩÕïç—•Ω∏¯4(§Ï4(4(º®Ä¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥Ä®º4(º®ÄâUÕïêÅΩ»àÉäPÅ—…’Õ–ÅÕ—…•¿Ä°Ω¡ï…Ö—Ω…ÃÅ—°•π¨Å•∏ÅÕï…Ÿ•çïÃ§ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ®º4(º®Ä¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥Ä®º4(4)çΩπÕ–Å’ÕïëΩ»ÄÙÅl4(ÄÄâMMÅΩ…µÃà∞4(ÄÄâIÖ•±›Ö‰ÅΩ…µÃà∞4(ÄÄâMç°Ω±Ö…Õ°•¿ÅΩ…µÃà∞4(ÄÄâAÖÕÕ¡Ω…–ÅMï…Ÿ•çïÃà∞4(ÄÄâ	•°Ö»ÅΩŸï…πµïπ–ÅΩ…µÃà∞4(ÄÄâUπ•Ÿï…Õ•—‰Åëµ•ÕÕ•ΩπÃà∞4)tÏ4(4)çΩπÕ–ÅUÕïëΩ…Mïç—•Ω∏ÄÙÄ†§ÄÙ¯Ä†4(ÄÄÒÕïç—•Ω∏Å•êÙâ’ÕïêµôΩ»àÅç±ÖÕÕ9ÖµîÙââΩ…ëï»µ‰ÅâΩ…ëï»µâΩ…ëï»Åâúµ¡Ö¡ï»µëïï¿º–¿Å¡‰¥ƒ»à¯4(ÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâçΩπ—Ö•πï»à¯4(ÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâô±ï‡Åô±ï‡µçΩ∞Å•—ïµÃµçïπ—ï»ÅùÖ¿¥‹Å±úÈô±ï‡µ…Ω‹Å±úÈ©’Õ—•ô‰µâï—›ïï∏à¯4(ÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ—ï·–µçïπ—ï»Å±úÈµÖ‡µ‹µ·ÃÅ±úÈ—ï·–µ±ïô–à¯4(ÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ±Öâï∞µµΩπºÅ—ï·–µµÖ…•ùΩ±êµëïï¿à¯ºººÅ’ÕïêÅïŸï…‰ÅëÖ‰ÅôΩ»ΩÕ¡Ö∏¯4(ÄÄÄÄÄÄÄÄÄÄÒ†»Åç±ÖÕÕ9ÖµîÙâµ–¥»ÅôΩπ–µë•Õ¡±Ö‰Å—ï·–¥…·∞ÅôΩπ–µâΩ±êÅ±ïÖë•πúµ—•ù°–Å—…Öç≠•πúµ—•ù°–Å—ï·–µ•π¨à¯4(ÄÄÄÄÄÄÄÄÄÄÄÅQ°îÅ…ïÖ∞ÅÕï…Ÿ•çïÃÅÂΩ’»Åç’Õ—Ωµï…ÃÅ›Ö±¨Å•∏ÅôΩ»4(ÄÄÄÄÄÄÄÄÄÄΩ†»¯4(ÄÄÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄÄÄÄÄÒ’∞Åç±ÖÕÕ9ÖµîÙâù…•êÅ‹µô’±∞ÅµÖ‡µ‹¥…·∞Åù…•êµçΩ±Ã¥ƒÅùÖ¿¥»∏‘ÅÕ¥Èù…•êµçΩ±Ã¥»Å±úÈ‹µÖ’—ºà¯4(ÄÄÄÄÄÄÄÄÄÅÌ’ÕïëΩ»πµÖ¿†°Ã§ÄÙ¯Ä†4(ÄÄÄÄÄÄÄÄÄÄÄÄÒ±§4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ≠ï‰ıÌÕÙ4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅç±ÖÕÕ9ÖµîÙâô±ï‡Å•—ïµÃµçïπ—ï»ÅùÖ¿¥»∏‘Å…Ω’πëïêµ±úÅâΩ…ëï»ÅâΩ…ëï»µçΩπô•ëïπçîºÃ¿ÅâúµçΩπô•ëïπçîº‘Å¡‡¥Ã∏‘Å¡‰¥»∏‘Å—ï·–µlƒÕ¡·tÅôΩπ–µµïë•’¥Å—ï·–µ•π¨à4(ÄÄÄÄÄÄÄÄÄÄÄÄ¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâù…•êÅ†¥–Å‹¥–ÅÕ°…•π¨¥¿Å¡±Öçîµ•—ïµÃµçïπ—ï»Å…Ω’πëïêµô’±∞ÅâúµçΩπô•ëïπçîÅ—ï·–µ›°•—îà¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒ°ïç¨Åç±ÖÕÕ9ÖµîÙâ†¥»∏‘Å‹¥»∏‘àÅÖ…•Ñµ°•ëëï∏Ùâ—…’îàÄº¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩÕ¡Ö∏¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌÕÙ4(ÄÄÄÄÄÄÄÄÄÄÄÄΩ±§¯4(ÄÄÄÄÄÄÄÄÄÄ§•Ù4(ÄÄÄÄÄÄÄÄΩ’∞¯4(ÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄΩë•ÿ¯4(ÄÄΩÕïç—•Ω∏¯4(§Ï4(4(º®Ä¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥Ä®º4(º®ÅïµºÅŸ•ëïºÉäPÅ…ïÕï…ŸïêÅ¡±Öçï°Ω±ëï»Ä°πºÅŸ•ëïºÅÂï–§ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ®º4(º®Ä¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥Ä®º4(4)çΩπÕ–ÅïµΩY•ëïΩMïç—•Ω∏ÄÙÄ†§ÄÙ¯Ä†4(ÄÄÒÕïç—•Ω∏Å•êÙâëïµºàÅç±ÖÕÕ9ÖµîÙâçΩπ—Ö•πï»Å¡‰¥ƒÿà¯4(ÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâµ‡µÖ’—ºÅµÖ‡µ‹¥Õ·∞Å—ï·–µçïπ—ï»à¯4(ÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ±Öâï∞µµΩπºÅ—ï·–µµÖ…•ùΩ±êµëïï¿à¯ºººÅÕïîÅ•–Å•∏ÅÖç—•Ω∏ΩÕ¡Ö∏¯4(ÄÄÄÄÄÄÒ†»Åç±ÖÕÕ9ÖµîÙâµ–¥»ÅôΩπ–µë•Õ¡±Ö‰Å—ï·–µmç±Öµ¿†ƒ∏·…ï¥∞Ã∏—Ÿ‹∞»∏Ÿ…ï¥•tÅôΩπ–µâΩ±êÅ±ïÖë•πúµ—•ù°–Å—…Öç≠•πúµ—•ù°–Å—ï·–µ•π¨à¯4(ÄÄÄÄÄÄÄÄ‰¿ÅÕïçΩπëÃ∞Åç°ÖΩÃÅ—ºÅçΩπô•ëïπçî4(ÄÄÄÄÄÄΩ†»¯4(ÄÄÄÄÄÄÒ¿Åç±ÖÕÕ9ÖµîÙâµ‡µÖ’—ºÅµ–¥ÃÅµÖ‡µ‹µ±úÅ—ï·–µlƒ–∏’¡·tÅ±ïÖë•πúµ…ï±Ö·ïêÅ—ï·–µ•π¨µÕΩô–à¯4(ÄÄÄÄÄÄÄÅ]Ö—ç†ÅÑÅ…ïÖ∞ÅçÂâï…çÖôîÅ°Öπë±îÅÑÅIÖ•±›Ö‰ÅôΩ…¥Åïπêµ—ºµïπêÉäPÅÑÅÕ°Ω…–Å!•πë§Å›Ö±≠—°…Ω’ù†∏4(ÄÄÄÄÄÄΩ¿¯4(ÄÄÄÄΩë•ÿ¯4(4(ÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ…ï±Ö—•ŸîÅµ‡µÖ’—ºÅµ–¥‡ÅÖÕ¡ïç–µŸ•ëïºÅµÖ‡µ‹¥—·∞ÅΩŸï…ô±Ω‹µ°•ëëï∏Å…Ω’πëïê¥…·∞ÅâΩ…ëï»ÅâΩ…ëï»µ•π¨ºƒ‘Åâúµ•π¨ÅÕ°ÖëΩ‹µ±•ô–à¯4(ÄÄÄÄÄÄÒë•ÿ4(ÄÄÄÄÄÄÄÅç±ÖÕÕ9ÖµîÙâ¡Ω•π—ï»µïŸïπ—ÃµπΩπîÅÖâÕΩ±’—îÅ•πÕï–¥¿ÅΩ¡Öç•—‰µl¿∏ƒ’tà4(ÄÄÄÄÄÄÄÅÕ—Â±îıÌÏ4(ÄÄÄÄÄÄÄÄÄÅâÖç≠ù…Ω’πë%µÖùîË4(ÄÄÄÄÄÄÄÄÄÄÄÄâ±•πïÖ»µù…Öë•ïπ–°°Õ∞†ƒ‹‡Ä‹¿îÄ‡¿îÄºÄ¿∏–§Ä≈¡‡∞Å—…ÖπÕ¡Ö…ïπ–Ä≈¡‡§∞Å±•πïÖ»µù…Öë•ïπ–†‰¡ëïú∞Å°Õ∞†ƒ‹‡Ä‹¿îÄ‡¿îÄºÄ¿∏–§Ä≈¡‡∞Å—…ÖπÕ¡Ö…ïπ–Ä≈¡‡§à∞4(ÄÄÄÄÄÄÄÄÄÅâÖç≠ù…Ω’πëM•ÈîËÄàÃ…¡‡ÄÃ…¡‡à∞4(ÄÄÄÄÄÄÄÅıÙ4(ÄÄÄÄÄÄº¯4(ÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâÖâÕΩ±’—îÅ•πÕï–¥¿Åù…•êÅ¡±Öçîµ•—ïµÃµçïπ—ï»à¯4(ÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâô±ï‡Åô±ï‡µçΩ∞Å•—ïµÃµçïπ—ï»ÅùÖ¿¥ÃÅ—ï·–µ¡Ö¡ï»à¯4(ÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâù…•êÅ†¥ƒÿÅ‹¥ƒÿÅ¡±Öçîµ•—ïµÃµçïπ—ï»Å…Ω’πëïêµô’±∞ÅâúµµÖ…•ùΩ±êÅ—ï·–µ•π¨ÅÕ°ÖëΩ‹µ±•ô–à¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÒA±Ö‰Åç±ÖÕÕ9ÖµîÙâ†¥‹Å‹¥‹Å—…ÖπÕ±Ö—îµ‡¥¿∏‘àÅÖ…•Ñµ°•ëëï∏Ùâ—…’îàÄº¯4(ÄÄÄÄÄÄÄÄÄÄΩÕ¡Ö∏¯4(ÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ±Öâï∞µµΩπºÅ—ï·–µµÖ…•ùΩ±êà˘ëïµºÅŸ•ëïºÅçΩµ•πúÅÕΩΩ∏ΩÕ¡Ö∏¯4(ÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ—ï·–µlƒ…¡·tÅ—ï·–µ¡Ö¡ï»ºÿ¿à¯–◊äLÿ¿ÅÕïçΩπêÅ!•πë§Å›Ö±≠—°…Ω’ù†ΩÕ¡Ö∏¯4(ÄÄÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄΩë•ÿ¯4(ÄÄΩÕïç—•Ω∏¯4(§Ï4(4(º®Ä¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥Ä®º4(º®Å1ïÖêÅçÖ¡—’…îÅôΩ…¥ÉäPÅçΩµ¡ΩÕïÃÅÑÅ]°Ö—Õ¡¿ÅµïÕÕÖùîÄ°πºÅâÖç≠ïπêÅπïïëïê§ÄÄ®º4(º®Ä¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥Ä®º4(4)çΩπÕ–Å•ï±êÄÙÄ°Ï4(ÄÅ•ê∞4(ÄÅ±Öâï∞∞4(ÄÅ•çΩ∏ËÅ%çΩ∏∞4(ÄÄ∏∏π¡…Ω¡Ã4)ÙËÅÏ4(ÄÅ•êËÅÕ—…•πúÏ4(ÄÅ±Öâï∞ËÅÕ—…•πúÏ4(ÄÅ•çΩ∏ËÅ1’ç•ëï%çΩ∏Ï)ÙÄòÅ%π¡’—!Q51——…•â’—ïÃÒ!Q51%π¡’—±ïµïπ–¯§ÄÙ¯Ä†4(ÄÄÒ±Öâï∞Å°—µ±Ω»ıÌ•ëÙÅç±ÖÕÕ9ÖµîÙââ±Ωç¨à¯4(ÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ±Öâï∞µµΩπºÅµà¥ƒÅâ±Ωç¨Å—ï·–µ•π¨µÕΩô–à˘Ì±Öâï±ÙΩÕ¡Ö∏¯4(ÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâô±ï‡Å•—ïµÃµçïπ—ï»ÅùÖ¿¥»Å…Ω’πëïêµµêÅâΩ…ëï»ÅâΩ…ëï»µ•π¨ºƒ‘Åâúµ¡Ö¡ï»Å¡‡¥ÃÅ¡‰¥»ÅôΩç’Ãµ›•—°•∏È…•πú¥»ÅôΩç’Ãµ›•—°•∏È…•πúµµÖ…•ùΩ±êº‘¿à¯4(ÄÄÄÄÄÄÒ%çΩ∏Åç±ÖÕÕ9ÖµîÙâ†¥–Å‹¥–ÅÕ°…•π¨¥¿Å—ï·–µµ’—ïêµôΩ…ïù…Ω’πêàÅÖ…•Ñµ°•ëëï∏Ùâ—…’îàÄº¯4(ÄÄÄÄÄÄÒ•π¡’–4(ÄÄÄÄÄÄÄÅ•êıÌ•ëÙ4(ÄÄÄÄÄÄÄÅÏ∏∏π¡…Ω¡ÕÙ4(ÄÄÄÄÄÄÄÅç±ÖÕÕ9ÖµîÙâ‹µô’±∞Åâúµ—…ÖπÕ¡Ö…ïπ–Å—ï·–µlƒ—¡·tÅ—ï·–µ•π¨ÅΩ’—±•πîµπΩπîÅ¡±Öçï°Ω±ëï»È—ï·–µµ’—ïêµôΩ…ïù…Ω’πêºÿ¿à4(ÄÄÄÄÄÄº¯4(ÄÄÄÄΩÕ¡Ö∏¯4(ÄÄΩ±Öâï∞¯4(§Ï4(4)çΩπÕ–Å1ïÖëΩ…¥ÄÙÄ†§ÄÙ¯ÅÏ4(ÄÅçΩπÕ–ÅmôΩ…¥∞ÅÕï—Ω…µtÄÙÅ’ÕïM—Ö—î°ÏÅπÖµîËÄàà∞ÅµΩâ•±îËÄàà∞ÅÕ°Ω¿ËÄàà∞Åç•—‰ËÄààÅÙ§Ï4(ÄÅçΩπÕ–ÅmÕ’âµ•——•πú∞ÅÕï—M’âµ•——•πùtÄÙÅ’ÕïM—Ö—î°ôÖ±Õî§Ï4(ÄÅçΩπÕ–Å’¡ëÖ—îÄÙ4(ÄÄÄÄ°¨ËÅ≠ïÂΩòÅ—Â¡ïΩòÅôΩ…¥§ÄÙ¯Ä°îËÅ°ÖπùïŸïπ–Ò!Q51%π¡’—±ïµïπ–¯§ÄÙ¯4(ÄÄÄÄÄÅÕï—Ω…¥†°ò§ÄÙ¯Ä°ÏÄ∏∏πò∞Åm≠tËÅîπ—Ö…ùï–πŸÖ±’îÅÙ§§Ï4(4(ÄÅçΩπÕ–ÅΩπM’âµ•–ÄÙÄ°îËÅΩ…µŸïπ–§ÄÙ¯ÅÏ4(ÄÄÄÅîπ¡…ïŸïπ—ïôÖ’±–†§Ï4(ÄÄÄÅçΩπÕ–ÅµΩâ•±îÄÙÅôΩ…¥πµΩâ•±îπ…ï¡±Öçî†ΩqΩú∞Äàà§Ï4(ÄÄÄÅ•òÄ†ÖôΩ…¥ππÖµîπ—…•¥†§§ÅÏ4(ÄÄÄÄÄÅ—ΩÖÕ–πï……Ω»†âA±ïÖÕîÅïπ—ï»ÅÂΩ’»ÅπÖµîà§Ï4(ÄÄÄÄÄÅ…ï—’…∏Ï4(ÄÄÄÅÙ4(ÄÄÄÅ•òÄ°µΩâ•±îπ±ïπù—†ÄÄƒ¿§ÅÏ4(ÄÄÄÄÄÅ—ΩÖÕ–πï……Ω»†âA±ïÖÕîÅïπ—ï»ÅÑÅŸÖ±•êÄƒ¿µë•ù•–ÅµΩâ•±îÅπ’µâï»à§Ï4(ÄÄÄÄÄÅ…ï—’…∏Ï4(ÄÄÄÅÙ4(ÄÄÄÅÕï—M’âµ•——•πú°—…’î§Ï4(ÄÄÄÅçΩπÕ–ÅµÕúÄÙ4(ÄÄÄÄÄÄãÇí£ÇíªÇí„Çñ7ÇíìÇñÑÉÇíªÇñÇíwÇñÅÂâï…Ωπ—…Ω∞ÉÇíWÇí¯Å!•πë§ÅëïµºÉÇíkÇí˚ÇíÁÇíˇÇí?Çñëqπq∏àÄ¨4(ÄÄÄÄÄÅÅ9ÖµîËÄëÌôΩ…¥ππÖµîπ—…•¥†•ıqπÄÄ¨4(ÄÄÄÄÄÅÅ5Ωâ•±îËÄëÌµΩâ•±ïıqπÄÄ¨4(ÄÄÄÄÄÄ°ôΩ…¥πÕ°Ω¿π—…•¥†§Ä¸ÅÅM°Ω¿ËÄëÌôΩ…¥πÕ°Ω¿π—…•¥†•ıqπÄÄËÄàà§Ä¨4(ÄÄÄÄÄÄ°ôΩ…¥πç•—‰π—…•¥†§Ä¸ÅÅ•—‰ËÄëÌôΩ…¥πç•—‰π—…•¥†•ıqπÄÄËÄàà§Ï4(ÄÄÄÅ•òÄ°›ÖπÖâ±ïê§ÅÏ4(ÄÄÄÄÄÅ›•πëΩ‹πΩ¡ï∏°›Ö1•π¨°µÕú§∞Äâ}â±Öπ¨à∞ÄâπΩΩ¡ïπï»±πΩ…ïôï……ï»à§Ï4(ÄÄÄÄÄÅ—ΩÖÕ–πÕ’ççïÕÃ†â=¡ïπ•πúÅ]°Ö—Õ¡¿ÉäPÅÕïπêÅ—°îÅµïÕÕÖùîÅ—ºÅçΩπô•…¥ÅÂΩ’»Åëïµº∏à§Ï4(ÄÄÄÅÙÅï±ÕîÅÏ4(ÄÄÄÄÄÄººÅ9ºÅ]°Ö—Õ¡¿Åç°Öππï∞Å›•…ïêÅÂï–Ä°¡…Ωë’ç—•Ω∏Å¡°ÖÕî§∏Åç≠πΩ›±ïëùîÅù…Öçïô’±±‰∏4(ÄÄÄÄÄÅ—ΩÖÕ–πÕ’ççïÕÃ°ÅQ°Öπ≠Ã∞ÄëÌôΩ…¥ππÖµîπ—…•¥†§πÕ¡±•–†àÄà•l¡uÙÑÅ=’»Å—ïÖ¥Å›•±∞Å…ïÖç†ÅΩ’–ÅÕ°Ω…—±‰πÄ§Ï4(ÄÄÄÄÄÅÕï—Ω…¥°ÏÅπÖµîËÄàà∞ÅµΩâ•±îËÄàà∞ÅÕ°Ω¿ËÄàà∞Åç•—‰ËÄààÅÙ§Ï4(ÄÄÄÅÙ4(ÄÄÄÅÕï—M’âµ•——•πú°ôÖ±Õî§Ï4(ÄÅÙÏ4(4(ÄÅ…ï—’…∏Ä†4(ÄÄÄÄÒôΩ…¥ÅΩπM’âµ•–ıÌΩπM’âµ•—ÙÅç±ÖÕÕ9ÖµîÙâÕ¡Öçîµ‰¥ÃàÅπΩYÖ±•ëÖ—î¯4(ÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâù…•êÅù…•êµçΩ±Ã¥ƒÅùÖ¿¥ÃÅÕ¥Èù…•êµçΩ±Ã¥»à¯4(ÄÄÄÄÄÄÄÄÒ•ï±êÅ•êÙâ±ïÖêµπÖµîàÅ±Öâï∞ÙâeΩ’»ÅπÖµîàÅ•çΩ∏ıÌUÕï…ÙÅŸÖ±’îıÌôΩ…¥ππÖµïÙÅΩπ°ÖπùîıÌ’¡ëÖ—î†âπÖµîà•ÙÅ¡±Öçï°Ω±ëï»ÙâIÖµïÕ†Å-’µÖ»àÅÖ’—ΩΩµ¡±ï—îÙâπÖµîàÅ…ï≈’•…ïêÄº¯4(ÄÄÄÄÄÄÄÄÒ•ï±êÅ•êÙâ±ïÖêµµΩâ•±îàÅ±Öâï∞Ùâ5Ωâ•±îÅπ’µâï»àÅ•çΩ∏ıÌA°ΩπïÙÅŸÖ±’îıÌôΩ…¥πµΩâ•±ïÙÅΩπ°ÖπùîıÌ’¡ëÖ—î†âµΩâ•±îà•ÙÅ¡±Öçï°Ω±ëï»Ùà‰·aaaaaaa`àÅ—Â¡îÙâ—ï∞àÅ•π¡’—5ΩëîÙâπ’µï…•åàÅÖ’—ΩΩµ¡±ï—îÙâ—ï∞àÅ…ï≈’•…ïêÄº¯4(ÄÄÄÄÄÄÄÄÒ•ï±êÅ•êÙâ±ïÖêµÕ°Ω¿àÅ±Öâï∞ÙâM°Ω¿ÅπÖµîàÅ•çΩ∏ıÌM—Ω…ïÙÅŸÖ±’îıÌôΩ…¥πÕ°Ω¡ÙÅΩπ°ÖπùîıÌ’¡ëÖ—î†âÕ°Ω¿à•ÙÅ¡±Öçï°Ω±ëï»ÙâM°Ö…µÑÅÂâï»ÅÖôîàÄº¯4(ÄÄÄÄÄÄÄÄÒ•ï±êÅ•êÙâ±ïÖêµç•—‰àÅ±Öâï∞Ùâ•—‰àÅ•çΩ∏ıÌ5Ö¡A•πÙÅŸÖ±’îıÌôΩ…¥πç•—ÂÙÅΩπ°ÖπùîıÌ’¡ëÖ—î†âç•—‰à•ÙÅ¡±Öçï°Ω±ëï»ÙâAÖ—πÑàÄº¯4(ÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄÄÄÒâ’——Ω∏4(ÄÄÄÄÄÄÄÅ—Â¡îÙâÕ’âµ•–à4(ÄÄÄÄÄÄÄÅë•ÕÖâ±ïêıÌÕ’âµ•——•πùÙ4(ÄÄÄÄÄÄÄÅç±ÖÕÕ9ÖµîÙâ•π±•πîµô±ï‡Å‹µô’±∞Å•—ïµÃµçïπ—ï»Å©’Õ—•ô‰µçïπ—ï»ÅùÖ¿¥»Å…Ω’πëïêµµêÅâúµ›°Ö—ÕÖ¡¿Å¡‡¥‘Å¡‰¥ÃÅ—ï·–µlƒ—¡·tÅôΩπ–µÕïµ•âΩ±êÅ—ï·–µ›°•—îÅÕ°ÖëΩ‹µ¡Ö¡ï»Å—…ÖπÕ•—•Ω∏Å°ΩŸï»Èâ…•ù°—πïÕÃ¥‰‘Åë•ÕÖâ±ïêÈΩ¡Öç•—‰¥‹¿à4(ÄÄÄÄÄÄ¯4(ÄÄÄÄÄÄÄÅÌÕ’âµ•——•πúÄ¸Ä†4(ÄÄÄÄÄÄÄÄÄÄÒ1ΩÖëï»»Åç±ÖÕÕ9ÖµîÙâ†¥–Å‹¥–ÅÖπ•µÖ—îµÕ¡•∏àÅÖ…•Ñµ°•ëëï∏Ùâ—…’îàÄº¯4(ÄÄÄÄÄÄÄÄ§ÄËÄ†4(ÄÄÄÄÄÄÄÄÄÄÒ5ïÕÕÖùï•…ç±îÅç±ÖÕÕ9ÖµîÙâ†¥–Å‹¥–àÅÖ…•Ñµ°•ëëï∏Ùâ—…’îàÄº¯4(ÄÄÄÄÄÄÄÄ•Ù4(ÄÄÄÄÄÄÄÅ	ΩΩ¨Åµ‰Å!•πë§ÅëïµºÅΩ∏Å]°Ö—Õ¡¿4(ÄÄÄÄÄÄΩâ’——Ω∏¯4(ÄÄÄÄÄÄÒ¿Åç±ÖÕÕ9ÖµîÙâ—ï·–µçïπ—ï»Å—ï·–µlƒ≈¡·tÅ—ï·–µµ’—ïêµôΩ…ïù…Ω’πêà¯4(ÄÄÄÄÄÄÄÅ9ºÅÕ¡Ö¥ÉäPÅ›îÅµïÕÕÖùîÅÂΩ‘ÅΩ∏Å]°Ö—Õ¡¿Å—ºÅÕç°ïë’±î∏ÅQÖ≠ïÃÄ»Åµ•π’—ïÃ∏4(ÄÄÄÄÄÄΩ¿¯4(ÄÄÄÄΩôΩ…¥¯4(ÄÄ§Ï4)ÙÏ4(4(º®Ä¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥Ä®º4(º®Å±ΩÖ—•πúÅ]°Ö—Õ¡¿Åâ’——Ω∏ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ®º4(º®Ä¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥Ä®º4(4)çΩπÕ–Å±ΩÖ—•πù]°Ö—Õ¡¿ÄÙÄ†§ÄÙ¯Ä†4(ÄÄÒÑ4(ÄÄÄÅÏ∏∏πëïµΩ1•π≠A…Ω¡ÕÙ4(ÄÄÄÅÖ…•Ñµ±Öâï∞Ùâ	ΩΩ¨ÅÑÅ!•πë§Åëïµºà4(ÄÄÄÅç±ÖÕÕ9ÖµîÙâô•·ïêÅâΩ——Ω¥¥‘Å…•ù°–¥‘ÅË¥‘¿Å•π±•πîµô±ï‡Å•—ïµÃµçïπ—ï»ÅùÖ¿¥»Å…Ω’πëïêµô’±∞Åâúµ›°Ö—ÕÖ¡¿Å¡‡¥–Å¡‰¥ÃÅ—ï·–µlƒÕ¡·tÅôΩπ–µÕïµ•âΩ±êÅ—ï·–µ›°•—îÅÕ°ÖëΩ‹µ±•ô–Å…•πú¥»Å…•πúµ›°•—îº–¿Å—…ÖπÕ•—•Ω∏Å°ΩŸï»Èâ…•ù°—πïÕÃ¥‰‘à4(ÄÄ¯4(ÄÄÄÄÒ5ïÕÕÖùï•…ç±îÅç±ÖÕÕ9ÖµîÙâ†¥‘Å‹¥‘àÅÖ…•Ñµ°•ëëï∏Ùâ—…’îàÄº¯4(ÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ°•ëëï∏ÅÕ¥È•π±•πîà˘	ΩΩ¨ÅÑÅ!•πë§ÅïµºΩÕ¡Ö∏¯4(ÄÄΩÑ¯4(§Ï4(4(º®Ä¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥Ä®º4(º®Å•πÖ∞ÅQÄ¨ÅôΩΩ—ï»ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ®º4(º®Ä¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥Ä®º4(4)çΩπÕ–ÅaQ9M%=9}MQALËÅ…ïÖëΩπ±‰Ä°…ïÖëΩπ±‰ÅmÕ—…•πú∞ÅÕ—…•πùt•mtÄÙÅl4(ÄÅlâUπÈ•¿Å—°îÅô•±îà∞ÄâI•ù°–µç±•ç¨Å—°îÅëΩ›π±ΩÖëïêÅô•±îÉäHÅ·—…Öç–Å±∞∏ât∞4(ÄÅlâ=¡ï∏Å°…ΩµîÅï·—ïπÕ•ΩπÃà∞ÄâQÂ¡îÅç°…ΩµîËºΩï·—ïπÕ•ΩπÃÅ•∏Å—°îÅÖëë…ïÕÃÅâÖ»∏ât∞4(ÄÅlâπÖâ±îÅïŸï±Ω¡ï»ÅµΩëîà∞ÄâQΩùù±îÅ•–ÅΩ∏ÉäPÅ—Ω¿µ…•ù°–ÅçΩ…πï»ÅΩòÅ—°îÅ¡Öùî∏ât∞4(ÄÅlâ1ΩÖêÅ’π¡Öç≠ïêà∞Äù±•ç¨Äâ1ΩÖêÅ’π¡Öç≠ïêàÅÖπêÅ¡•ç¨Å—°îÅ’πÈ•¡¡ïêÅôΩ±ëï»∏ùt∞4)tÏ4(4)çΩπÕ–Å·—ïπÕ•ΩπMïç—•Ω∏ÄÙÄ†§ÄÙ¯Ä†4(ÄÄÒÕïç—•Ω∏Å•êÙâï·—ïπÕ•Ω∏àÅç±ÖÕÕ9ÖµîÙâçΩπ—Ö•πï»Å¡‰¥ƒÿà¯4(ÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ…Ω’πëïê¥Õ·∞ÅâΩ…ëï»ÅâΩ…ëï»µâΩ…ëï»Åâúµ¡Ö¡ï»Å¿¥ÿÅÕ°ÖëΩ‹µ¡Ö¡ï»ÅÕ¥È¿¥ƒ¿à¯4(ÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâù…•êÅùÖ¿¥‡ÅµêÈù…•êµçΩ±Ãµl≈ô…|ƒ∏≈ô…tÅµêÈ•—ïµÃµçïπ—ï»à¯4(ÄÄÄÄÄÄÄÄÒë•ÿ¯4(ÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ±Öâï∞µµΩπºÅ—ï·–µ•π¨ºÿ¿à¯ºººÅâ…Ω›Õï»Åï·—ïπÕ•Ω∏ΩÕ¡Ö∏¯4(ÄÄÄÄÄÄÄÄÄÄÒ†ÃÅç±ÖÕÕ9ÖµîÙâµ–¥»ÅôΩπ–µë•Õ¡±Ö‰Å—ï·–µmç±Öµ¿†ƒ∏’…ï¥∞ÕŸ‹∞»∏……ï¥•tÅôΩπ–µâΩ±êÅ±ïÖë•πúµ—•ù°–Å—ï·–µ•π¨à¯4(ÄÄÄÄÄÄÄÄÄÄÄÅ’—Ωô•±∞ÅΩ∏Å—°îÅ…ïÖ∞ÅùΩŸï…πµïπ–ÅôΩ…µÃ∏4(ÄÄÄÄÄÄÄÄÄÄΩ†Ã¯4(ÄÄÄÄÄÄÄÄÄÄÒ¿Åç±ÖÕÕ9ÖµîÙâµ–¥ÃÅµÖ‡µ‹µµêÅ—ï·–µlƒ–∏’¡·tÅ±ïÖë•πúµ…ï±Ö·ïêÅ—ï·–µ•π¨º‹‘à¯4(ÄÄÄÄÄÄÄÄÄÄÄÅ%πÕ—Ö±∞Å—°îÅ°…ΩµîÅï·—ïπÕ•Ω∏ÅΩπçî∏Å%–Åô•±±ÃÅMM∞ÅIÖ•±›Ö‰∞Å9PÅÖπêÅµΩ…î4(ÄÄÄÄÄÄÄÄÄÄÄÅÕ—…Ö•ù°–Åô…Ω¥ÅÑÅç’Õ—Ωµï»ùÃÅÕÖŸïêÅ¡…Ωô•±îÉäPÅπºÅ…ï—Â¡•πú∏4(ÄÄÄÄÄÄÄÄÄÄΩ¿¯4(ÄÄÄÄÄÄÄÄÄÄÒÑ4(ÄÄÄÄÄÄÄÄÄÄÄÅ°…ïòıÌaQ9M%=9}UI1Ù4(ÄÄÄÄÄÄÄÄÄÄÄÅëΩ›π±ΩÖê4(ÄÄÄÄÄÄÄÄÄÄÄÅç±ÖÕÕ9ÖµîÙâµ–¥‘Å•π±•πîµô±ï‡Å•—ïµÃµçïπ—ï»ÅùÖ¿¥»Å…Ω’πëïêµµêÅâúµ•π¨Å¡‡¥–Å¡‰¥»∏‘Å—ï·–µlƒÕ¡·tÅôΩπ–µÕïµ•âΩ±êÅ—ï·–µ¡Ö¡ï»ÅÕ°ÖëΩ‹µ¡Ö¡ï»Å—…ÖπÕ•—•Ω∏Å°ΩŸï»Èâ…•ù°—πïÕÃ¥ƒƒ¿à4(ÄÄÄÄÄÄÄÄÄÄ¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÒΩ›π±ΩÖêÅç±ÖÕÕ9ÖµîÙâ†¥–Å‹¥–àÅÖ…•Ñµ°•ëëï∏Ùâ—…’îàÄº¯ÅΩ›π±ΩÖêÅï·—ïπÕ•Ω∏Ä°ŸÌaQ9M%=9}YIM%=9Ù§4(ÄÄÄÄÄÄÄÄÄÄΩÑ¯4(ÄÄÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄÄÄÄÄÒΩ∞Åç±ÖÕÕ9ÖµîÙâÕ¡Öçîµ‰¥Ãà¯4(ÄÄÄÄÄÄÄÄÄÅÌaQ9M%=9}MQALπµÖ¿†°m—•—±î∞ÅëïÕçt∞Å§§ÄÙ¯Ä†4(ÄÄÄÄÄÄÄÄÄÄÄÄÒ±§Å≠ï‰ıÌ•ÙÅç±ÖÕÕ9ÖµîÙâô±ï‡ÅùÖ¿¥ÃÅ…Ω’πëïêµ·∞ÅâΩ…ëï»ÅâΩ…ëï»µâΩ…ëï»Åâúµ¡Ö¡ï»µëïï¿º–¿Å¿¥Ãà¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâù…•êÅ†¥ÿÅ‹¥ÿÅÕ°…•π¨¥¿Å¡±Öçîµ•—ïµÃµçïπ—ï»Å…Ω’πëïêµô’±∞ÅâúµµÖ…•ùΩ±êÅ—ï·–µlƒ…¡·tÅôΩπ–µâΩ±êÅ—ï·–µ•π¨à˘Ì§Ä¨Ä≈ÙΩÕ¡Ö∏¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿ¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ—ï·–µlƒÃ∏’¡·tÅôΩπ–µÕïµ•âΩ±êÅ—ï·–µ•π¨à˘Ì—•—±ïÙΩë•ÿ¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ—ï·–µlƒ»∏’¡·tÅ—ï·–µ•π¨º‹¿à˘ÌëïÕçÙΩë•ÿ¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄÄÄÄÄÄÄÄÄΩ±§¯4(ÄÄÄÄÄÄÄÄÄÄ§•Ù4(ÄÄÄÄÄÄÄÄΩΩ∞¯4(ÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄΩë•ÿ¯4(ÄÄΩÕïç—•Ω∏¯4(§Ï4(4)çΩπÕ–Å•πÖ±QÄÙÄ†§ÄÙ¯Ä†4(ÄÄÒÕïç—•Ω∏Å•êÙâç—ÑàÅç±ÖÕÕ9ÖµîÙâçΩπ—Ö•πï»Å¡‰¥»¿à¯4(ÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâΩŸï…ô±Ω‹µ°•ëëï∏Å…Ω’πëïê¥Õ·∞Åâúµù…Öë•ïπ–µµÖ…•ùΩ±êÅ¿¥ÿÅÕ°ÖëΩ‹µ±•ô–ÅÕ¥È¿¥‡ÅµêÈ¿¥ƒ»à¯4(ÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâù…•êÅ•—ïµÃµçïπ—ï»ÅùÖ¿¥‹ÅµêÈù…•êµçΩ±Ãµlƒ∏¿’ô…|≈ô…tà¯4(ÄÄÄÄÄÄÄÄÒë•ÿ¯4(ÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ±Öâï∞µµΩπºÅ—ï·–µ•π¨º‹¿à¯ºººÅ—°îÅ’¡ù…ÖëîΩÕ¡Ö∏¯4(ÄÄÄÄÄÄÄÄÄÄÒ†ÃÅç±ÖÕÕ9ÖµîÙâµ–¥»ÅôΩπ–µë•Õ¡±Ö‰Å—ï·–µmç±Öµ¿†ƒ∏·…ï¥∞Ã∏ŸŸ‹∞»∏·…ï¥•tÅôΩπ–µâΩ±êÅ±ïÖë•πúµlƒ∏¿…tÅ—ï·–µ•π¨à¯4(ÄÄÄÄÄÄÄÄÄÄÄÅeΩ’»ÅçÂâï…çÖôî∞Åô•πÖ±±‰ÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâôΩπ–µ°•πë§à˚Çí„ÇñÇí◊Çñ7ÇíøÇí◊Çí„Çñ7ÇíóÇíˇÇíêΩÕ¡Ö∏¯∏4(ÄÄÄÄÄÄÄÄÄÄΩ†Ã¯4(ÄÄÄÄÄÄÄÄÄÄÒ¿Åç±ÖÕÕ9ÖµîÙâµ–¥ÃÅµÖ‡µ‹µ±úÅ—ï·–µlƒ–∏’¡·tÅ±ïÖë•πúµ…ï±Ö·ïêÅ—ï·–µ•π¨º‡¿à¯4(ÄÄÄÄÄÄÄÄÄÄÄÅM—Ω¿ÅÕ—Ö…—•πúÅô…Ω¥ÅÈï…ºÅ›•—†ÅïŸï…‰Åç’Õ—Ωµï»∏Å	ΩΩ¨ÅÑÅô…ïîÅ!•πë§ÅëïµºÅÖπêÅ›Ö—ç†Åç°ÖΩÃ4(ÄÄÄÄÄÄÄÄÄÄÄÅ—’…∏Å•π—ºÅçΩπô•ëïπçîÅâ‰Å—ΩµΩ……Ω‹ÅµΩ…π•πú∏4(ÄÄÄÄÄÄÄÄÄÄΩ¿¯4(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâµ–¥‘Åô±ï‡Åô±ï‡µ›…Ö¿Å•—ïµÃµçïπ—ï»ÅùÖ¿¥»à¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÒQÖúÅ—ΩπîÙâ•π¨à˚ä
‰–‰‰ÄºÅµΩπ—†ÅÖô—ï»Å—…•Ö∞ΩQÖú¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÒQÖúÅ—ΩπîÙâ•π¨à˘UA$ÅÖççï¡—ïêΩQÖú¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÒQÖúÅ—ΩπîÙâ•π¨à˘Öπçï∞ÅÖπÂ—•µîΩQÖú¯4(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄÄÄÄÄÄÅÌ›ÖπÖâ±ïêÄòòÄ†4(ÄÄÄÄÄÄÄÄÄÄÄÄÒ¿Åç±ÖÕÕ9ÖµîÙâµ–¥–Å—ï·–µlƒ»∏’¡·tÅ—ï·–µ•π¨º‹¿à¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅA…ïôï»Å—ºÅ—Ö±¨Åô•…Õ–˝ÏàÄâÙ4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÑ4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ°…ïòıÌ›Ö1•π¨°5=}5MM•Ù4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—Ö…ùï–Ùâ}â±Öπ¨à4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï∞ÙâπΩΩ¡ïπï»ÅπΩ…ïôï……ï»à4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅç±ÖÕÕ9ÖµîÙâôΩπ–µÕïµ•âΩ±êÅ—ï·–µ•π¨Å’πëï…±•πîÅ’πëï…±•πîµΩôôÕï–¥»à4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ5ïÕÕÖùîÅ’ÃÅΩ∏Å]°Ö—Õ¡¿4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩÑ¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ∏4(ÄÄÄÄÄÄÄÄÄÄÄÄΩ¿¯4(ÄÄÄÄÄÄÄÄÄÄ•Ù4(ÄÄÄÄÄÄÄÄΩë•ÿ¯4(4(ÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ…Ω’πëïê¥…·∞Åâúµ¡Ö¡ï»º‰‘Å¿¥‘ÅÕ°ÖëΩ‹µ±•ô–Å…•πú¥ƒÅ…•πúµ•π¨º‘à¯4(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâµà¥Ãà¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâôΩπ–µë•Õ¡±Ö‰Å—ï·–µlƒŸ¡·tÅôΩπ–µÕïµ•âΩ±êÅ—ï·–µ•π¨à˘	ΩΩ¨ÅÑÅô…ïîÅ!•πë§ÅëïµºΩë•ÿ¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ—ï·–µlƒ…¡·tÅ—ï·–µµ’—ïêµôΩ…ïù…Ω’πêà¯4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅMïîÅ•–Å…’∏ÅΩ∏ÅÑÅ…ïÖ∞ÅùΩŸï…πµïπ–ÅôΩ…¥ÉäPÅ•∏Ä»Åµ•π’—ïÃ∏4(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄÄÄÄÄÄÄÒ1ïÖëΩ…¥Äº¯4(ÄÄÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄΩë•ÿ¯4(ÄÄΩÕïç—•Ω∏¯4(§Ï4(4)çΩπÕ–ÅΩΩ—ï»ÄÙÄ†§ÄÙ¯Ä†4(ÄÄÒôΩΩ—ï»Åç±ÖÕÕ9ÖµîÙââΩ…ëï»µ–ÅâΩ…ëï»µâΩ…ëï»Åâúµ¡Ö¡ï»µëïï¿ºÿ¿à¯4(ÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâçΩπ—Ö•πï»Åô±ï‡Åô±ï‡µçΩ∞Å•—ïµÃµÕ—Ö…–Å©’Õ—•ô‰µâï—›ïï∏ÅùÖ¿¥ÃÅ¡‰¥ÿÅ—ï·–µlƒ…¡·tÅ—ï·–µµ’—ïêµôΩ…ïù…Ω’πêÅµêÈô±ï‡µ…Ω‹ÅµêÈ•—ïµÃµçïπ—ï»à¯4(ÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâô±ï‡Å•—ïµÃµçïπ—ï»ÅùÖ¿¥»à¯4(ÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâù…•êÅ†¥‘Å‹¥‘Å¡±Öçîµ•—ïµÃµçïπ—ï»Å…Ω’πëïêÅâúµ•π¨à¯4(ÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ†¥ƒ∏‘Å‹¥ƒ∏‘Å…Ω’πëïêµÕ¥ÅâúµµÖ…•ùΩ±êàÄº¯4(ÄÄÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâôΩπ–µë•Õ¡±Ö‰ÅôΩπ–µÕïµ•âΩ±êÅ—ï·–µ•π¨à˘Ââï…Ωπ—…Ω∞ΩÕ¡Ö∏¯4(ÄÄÄÄÄÄÄÄÒÕ¡Ö∏˚
‹Å5ÖëîÅ•∏Å%πë•ÑÅôΩ»Å%πë•ÑùÃÅçÂâï…çÖôïÃΩÕ¡Ö∏¯4(ÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâô±ï‡Å•—ïµÃµçïπ—ï»ÅùÖ¿¥‘à¯4(ÄÄÄÄÄÄÄÄÒÑÅ°…ïòÙàç’ÕïêµôΩ»àÅç±ÖÕÕ9ÖµîÙâ°ΩŸï»È—ï·–µ•π¨à˘Mï…Ÿ•çïÃΩÑ¯4(ÄÄÄÄÄÄÄÄÒÑÅ°…ïòÙàçï·—ïπÕ•Ω∏àÅç±ÖÕÕ9ÖµîÙâ°ΩŸï»È—ï·–µ•π¨à˘·—ïπÕ•Ω∏ΩÑ¯4(ÄÄÄÄÄÄÄÄÒÑÅ°…ïòıÌAA}UI1ÙÅç±ÖÕÕ9ÖµîÙâ°ΩŸï»È—ï·–µ•π¨à˘M•ù∏Å•∏ΩÑ¯4(ÄÄÄÄÄÄÄÄÒÑÅÏ∏∏πëïµΩ1•π≠A…Ω¡ÕÙÅç±ÖÕÕ9ÖµîÙâ°ΩŸï»È—ï·–µ•π¨à¯4(ÄÄÄÄÄÄÄÄÄÅΩπ—Öç–4(ÄÄÄÄÄÄÄÄΩÑ¯4(ÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄΩë•ÿ¯4(ÄÄΩôΩΩ—ï»¯4(§Ï4(4(º®Ä¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥Ä®º4(º®ÅAÖùîÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ®º4(º®Ä¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥¥Ä®º4(4)çΩπÕ–Å%πëï‡ÄÙÄ†§ÄÙ¯Ä†4(ÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâµ•∏µ†µÕç…ïï∏ÅâúµâÖç≠ù…Ω’πêÅ—ï·–µôΩ…ïù…Ω’πêà¯4(ÄÄÄÄÒ9ÖÿÄº¯4(ÄÄÄÄÒµÖ•∏Å•êÙâÕ—Ω…‰à¯4(ÄÄÄÄÄÄÒ!ï…ºÄº¯4(ÄÄÄÄÄÄÒïµΩY•ëïΩMïç—•Ω∏Äº¯4(ÄÄÄÄÄÄÒUÕïëΩ…Mïç—•Ω∏Äº¯4(ÄÄÄÄÄÄÒ!’µÕïMïç—•Ω∏Äº¯4(ÄÄÄÄÄÄÒ5ïµΩ…ÂMïç—•Ω∏Äº¯4(ÄÄÄÄÄÄÒ·—ïπÕ•ΩπMïç—•Ω∏Äº¯4(ÄÄÄÄÄÄÒ•πÖ±QÄº¯4(ÄÄÄÄΩµÖ•∏¯4(ÄÄÄÄÒΩΩ—ï»Äº¯4(ÄÄÄÄÒ±ΩÖ—•πù]°Ö—Õ¡¿Äº¯4(ÄÄΩë•ÿ¯4(§Ï4(4)ï·¡Ω…–ÅëïôÖ’±–Å%πëï‡Ï4(