export interface ResolverConfig {
  PORT: number;
  SECRET: string;
  SESSION_PATH: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ResolverConfig {
  return {
    PORT: Number(env.PORT || env.RESOLVER_PORT || 3200),
    // Compose / AWS MVP pass WA_SECRET; local docker-compose uses SERVICE_SECRET.
    SECRET: env.SERVICE_SECRET || env.WA_SECRET || 'wa-service-secret-2024',
    SESSION_PATH: env.RESOLVER_SESSION_PATH || './session',
  };
}
