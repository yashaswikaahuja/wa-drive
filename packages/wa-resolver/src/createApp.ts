import express, { type Express } from 'express';
import type { Server } from 'node:http';
import { loadConfig, type ResolverConfig } from './config.js';
import { createResolverClient, type ResolverClient } from './client.js';
import { registerRoutes } from './routes.js';

export interface ResolverApp {
  app: Express;
  config: ResolverConfig;
  resolver: ResolverClient;
  start: () => Promise<{
    app: Express;
    server: Server;
    config: ResolverConfig;
    resolver: ResolverClient;
  }>;
}

/**
 * Build the wwebjs resolver express app. Does not listen until start().
 */
export function createApp(
  env: NodeJS.ProcessEnv = process.env,
  opts: { autoInitClient?: boolean } = {},
): ResolverApp {
  const { autoInitClient = true } = opts;
  const config = loadConfig(env);
  const resolver = createResolverClient({ sessionPath: config.SESSION_PATH });

  const app = express();
  app.use(express.json());
  registerRoutes(app, { config, resolver });

  function start() {
    return new Promise<{
      app: Express;
      server: Server;
      config: ResolverConfig;
      resolver: ResolverClient;
    }>((resolve) => {
      const server = app.listen(config.PORT, () => {
        console.log(`[Resolver] Running on port ${config.PORT}`);
        if (autoInitClient) resolver.initClient();
        resolve({ app, server, config, resolver });
      });
    });
  }

  return { app, config, resolver, start };
}
