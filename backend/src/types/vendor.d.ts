declare module 'uuid' {
  export function v4(): string;
}

declare module 'node-cron' {
  export interface ScheduleOptions { timezone?: string; scheduled?: boolean; }
  export function schedule(expression: string, task: () => void, options?: ScheduleOptions): { stop: () => void; start: () => void };
  const nodeCron: { schedule: typeof schedule };
  export default nodeCron;
}

declare module 'qrcode' {
  export function toDataURL(input: string): Promise<string>;

  const qrcode: {
    toDataURL: typeof toDataURL;
  };

  export default qrcode;
}

declare module 'qrcode-terminal' {
  export interface GenerateOptions {
    small?: boolean;
  }

  export function generate(input: string, options?: GenerateOptions): void;

  const qrcodeTerminal: {
    generate: typeof generate;
  };

  export default qrcodeTerminal;
}
