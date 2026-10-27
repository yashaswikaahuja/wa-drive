/** Café passport / ID background presets — many options, not only white/blue. */
export type BgPresetId =
  | 'white'
  | 'offwhite'
  | 'lightblue'
  | 'sky'
  | 'blue'
  | 'navy'
  | 'red'
  | 'grey'
  | 'cream'
  | 'green'
  | 'black'
  | 'transparent'
  | 'custom';

export interface BgPreset {
  id: BgPresetId;
  label: string;
  /** CSS / canvas fill; null = keep alpha (PNG transparent) */
  hex: string | null;
}

export const BG_PRESETS: BgPreset[] = [
  { id: 'white', label: 'White', hex: '#ffffff' },
  { id: 'offwhite', label: 'Off-white', hex: '#f5f5f0' },
  { id: 'lightblue', label: 'Light blue', hex: '#a8c8e8' },
  { id: 'sky', label: 'Sky', hex: '#cfe8f7' },
  { id: 'blue', label: 'Blue', hex: '#4a90d9' },
  { id: 'navy', label: 'Navy', hex: '#1e3a5f' },
  { id: 'red', label: 'Red', hex: '#c8102e' },
  { id: 'grey', label: 'Grey', hex: '#d0d0d0' },
  { id: 'cream', label: 'Cream', hex: '#f5e6c8' },
  { id: 'green', label: 'Green', hex: '#2d6a4f' },
  { id: 'black', label: 'Black', hex: '#111111' },
  { id: 'transparent', label: 'Transparent', hex: null },
  { id: 'custom', label: 'Custom', hex: '#ffffff' },
];

export const PORTAL_PRESETS = [
  { id: 'bihar_rtps', label: 'Bihar RTPS', width: 413, height: 531, maxKb: 50, note: '≈35×45 mm, ≤50 KB' },
  { id: 'ssc', label: 'SSC / exam', width: 100, height: 120, maxKb: 12, minKb: 4, note: '100×120, 4–12 KB' },
  { id: 'passport_india', label: 'Passport Seva', width: 600, height: 600, maxKb: 300, note: '600×600' },
  { id: 'pan', label: 'PAN', width: 213, height: 213, maxKb: 100, note: 'Square' },
  { id: 'custom_35x45', label: '35×45 mm @300dpi', width: 413, height: 531, maxKb: 200, note: 'Print-quality' },
] as const;
