export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'cc-theme';

export function getThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* private mode */ }
  return 'system';
}

export function resolveTheme(pref: ThemePreference = getThemePreference()): ResolvedTheme {
  if (pref === 'light' || pref === 'dark') return pref;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Apply resolved theme to <html data-theme>. */
export function applyTheme(pref: ThemePreference = getThemePreference()): ResolvedTheme {
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  return resolved;
}

function pushThemeToExtension(pref: ThemePreference): void {
  // Best-effort — Hub still works when the extension is offline.
  void import('./extensionBridge')
    .then(({ extensionBridge }) => extensionBridge.setTheme(pref))
    .catch(() => {});
}

export function setThemePreference(pref: ThemePreference): ResolvedTheme {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch { /* private mode */ }
  const resolved = applyTheme(pref);
  window.dispatchEvent(new CustomEvent('cc-theme', { detail: { preference: pref, resolved } }));
  pushThemeToExtension(pref);
  return resolved;
}

/** Call once at boot. Keeps system preference in sync when mode is system. */
export function initTheme(): void {
  const pref = getThemePreference();
  applyTheme(pref);
  pushThemeToExtension(pref);
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (getThemePreference() === 'system') applyTheme('system');
    };
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
    else if (typeof (mq as any).addListener === 'function') (mq as any).addListener(onChange);
  } catch { /* ignore */ }
}
