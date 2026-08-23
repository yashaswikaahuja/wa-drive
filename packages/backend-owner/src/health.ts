/**
 * Per-café health score (0-100) — the composite churn/engagement signal for the owner panel.
 * Follows the SaaS customer-health pattern: weight by VALUE delivered (real product usage),
 * not vanity metrics. Trend matters as much as absolutes. Output → a band + action.
 *
 *   Recency   30%   how recently they processed a document
 *   Volume    35%   how much they process (30-day)
 *   Adoption  20%   breadth of setup: WhatsApp connected · Drive linked · has an operator
 *   Trend     15%   this week vs last week (growing / steady / cooling)
 *
 * Bands:  healthy ≥75 · watch 50-74 · at-risk <50 · onboarding (new, not yet activated)
 */
export interface HealthSignals {
  createdAt: string | Date | null;
  lastUpload: string | Date | null;
  filesLast7: number;
  filesPrev7: number;      // 8–14 days ago
  filesLast30: number;
  whatsappConnected: boolean;
  driveLinked: boolean;
  operators: number;
}

export type HealthBand = 'healthy' | 'watch' | 'at-risk' | 'onboarding';

export interface Health {
  score: number;
  band: HealthBand;
  flags: string[];
}

const daysSince = (d: string | Date | null): number => {
  if (!d) return Infinity;
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 86_400_000;
};

function recencyScore(lastUpload: string | Date | null): number {
  const d = daysSince(lastUpload);
  if (d <= 3) return 100;
  if (d <= 7) return 80;
  if (d <= 14) return 55;
  if (d <= 30) return 30;
  return 0;
}

function volumeScore(v30: number): number {
  if (v30 >= 40) return 100;
  if (v30 >= 15) return 80;
  if (v30 >= 5) return 55;
  if (v30 >= 1) return 30;
  return 0;
}

function adoptionScore(s: HealthSignals): number {
  return (s.whatsappConnected ? 50 : 0) + (s.driveLinked ? 30 : 0) + (s.operators > 1 ? 20 : 0);
}

function trendScore(w0: number, w1: number): number {
  if (w0 > w1) return 100;              // growing (incl. new activity vs 0)
  if (w0 === w1) return w0 > 0 ? 75 : 25;  // steady, or flat-and-idle
  return w0 === 0 ? 20 : 45;           // dropped off entirely, or cooling
}

export function computeHealth(s: HealthSignals): Health {
  const activated = !!s.lastUpload;                 // has ever processed a document
  const ageDays = daysSince(s.createdAt);

  const score = Math.round(
    0.30 * recencyScore(s.lastUpload) +
    0.35 * volumeScore(s.filesLast30) +
    0.20 * adoptionScore(s) +
    0.15 * trendScore(s.filesLast7, s.filesPrev7)
  );

  const flags: string[] = [];
  if (!s.whatsappConnected) flags.push('no-whatsapp');
  if (!s.driveLinked) flags.push('no-drive');
  if (s.whatsappConnected && !activated) flags.push('connected-no-files');
  if (s.filesPrev7 > 0 && s.filesLast7 < s.filesPrev7) flags.push('cooling');
  if (activated && daysSince(s.lastUpload) > 30) flags.push('dormant');

  // Band: a brand-new, not-yet-activated café is "onboarding" (don't penalise it as at-risk).
  let band: HealthBand;
  if (!activated) {
    band = ageDays <= 14 ? 'onboarding' : 'at-risk';
  } else {
    band = score >= 75 ? 'healthy' : score >= 50 ? 'watch' : 'at-risk';
  }

  return { score, band, flags };
}
