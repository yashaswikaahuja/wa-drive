import type { AxiosInstance } from 'axios';
import type { ComponentType, CSSProperties, ReactNode } from 'react';

export type PrintBlobOpts = {
  widthMm?: number;
  heightMm?: number;
  fileName?: string;
};

export type DrivePickerProps = {
  open: boolean;
  onClose: () => void;
  onPick: (file: File) => void;
  imagesOnly?: boolean;
  folderHint?: {
    customerId?: string;
    customerName?: string;
    fileId?: string;
  };
};

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export type RevealOptions = {
  auto?: boolean;
  stepMs?: number;
  durationMs?: number;
  distancePx?: number;
};

export type RevealApi = {
  mounted: boolean;
  setMounted: (value: boolean) => void;
  trigger: () => void;
  reveal: (index: number) => CSSProperties;
};

type Hub = {
  api: AxiosInstance;
  toast: {
    error: (message: string) => void;
    success: (message: string) => void;
    info: (message: string) => void;
  };
  printBlob: (blob: Blob, opts?: PrintBlobOpts) => void;
  getCachedBlob: (fileId: string, fetcher: () => Promise<Blob>) => Promise<Blob>;
  PageHeader: ComponentType<PageHeaderProps>;
  useReveal: (opts?: RevealOptions) => RevealApi;
  useIsNarrow: (query?: string) => boolean;
  DrivePicker: ComponentType<DrivePickerProps>;
};

let hub: Hub | null = null;

/** Called once from the Hub app before any Photos screen renders. */
export function configureMediaTools(next: Hub) {
  hub = next;
}

function requireHub(): Hub {
  if (!hub) throw new Error('Media tools are not configured');
  return hub;
}

export const api: AxiosInstance = new Proxy({} as AxiosInstance, {
  get(_target, prop) {
    const real = requireHub().api as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

export const toast = {
  error: (message: string) => requireHub().toast.error(message),
  success: (message: string) => requireHub().toast.success(message),
  info: (message: string) => requireHub().toast.info(message),
};

export function printBlob(blob: Blob, opts?: PrintBlobOpts) {
  requireHub().printBlob(blob, opts);
}

export function getCachedBlob(fileId: string, fetcher: () => Promise<Blob>) {
  return requireHub().getCachedBlob(fileId, fetcher);
}

export function PageHeader(props: PageHeaderProps) {
  const Header = requireHub().PageHeader;
  return <Header {...props} />;
}

export function useReveal(opts?: RevealOptions): RevealApi {
  return requireHub().useReveal(opts);
}

export function useIsNarrow(query?: string): boolean {
  return requireHub().useIsNarrow(query);
}

export function DrivePicker(props: DrivePickerProps) {
  const Picker = requireHub().DrivePicker;
  return <Picker {...props} />;
}
