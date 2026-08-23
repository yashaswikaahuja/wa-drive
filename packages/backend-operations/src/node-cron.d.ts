declare module 'node-cron' {
  interface ScheduledTask { stop(): void; }
  function schedule(expression: string, callback: () => void, options?: object): ScheduledTask;
  export default { schedule };
}
