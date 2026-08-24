import express from 'express';
import { loadConfig } from './config.js';
import { createResolverClient } from './client.js';
import { registerRoutes } from './routes.js';

/**
 * Build the wwebjs resolver express app. Does not listen until start().
 * @param {{ autoInitClient?: boolean }} [opts]
 */
export function createApp(env = process.env, opts = {}) {
  const { autoInitClient = true } = opts;
  const config = loadConfig(env);
  const resolver = createResolverClient({ sessionPath: config.SESSION_PATH });

  const app = express();
  app.use(express.json());
  registerRoutes(app, { config, resolver });

  function start() {
    return new Promise((resolve) => {
      const server = app.listen(config.PORT, () => {
        console.log(`[Resolver] Running on port ${config.PORT}`);
        if (autoInitClient) resolver.initClient();
        resolve({ app, server, config, resolver });
      });
    });
  }

  return { app, config, resolver, start };
}
