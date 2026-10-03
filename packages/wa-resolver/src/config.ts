export interface ResolverConfig {
  PORT: number;
  SECRET: string;
  SESSION_PATH: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ResolverConfig {
  return {
    PORT: Number(env.PORT || env.RESOLVER_PORT || 3200),
    SECRET: env.SERVICE_SECRET || 'wa-service-secret-2024',
    SESSION_PATH: env.RESOLVER_SESSION_PATH || './session',
  };
}
