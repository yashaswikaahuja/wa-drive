import express, { type Express } from 'express';
import http, { type Server as HttpServer } from 'http';
import { loadConfig, type WaServiceConfig } from './config.js';
import { createParentBridge } from './parent.js';
import { attachWorkspaceWs } from './ws.js';
import { createSessionManager } from './session.js';
import { createHeartbeat } from './heartbeat.js';
import { registerRoutes } from './routes.js';

export interface WaServiceApp {
  app: Express;
  server: HttpServer;
  config: WaServiceConfig;
  sessions: Map<string, unknown>;
  startSession: (workspaceId: string) => Promise<unknown>;
  stopSession: (workspaceId: string) => Promise<unknown>;
  start: () => Promise<{
    app: Express;
    server: HttpServer;
    config: WaServiceConfig;
    sessions: Map<string, unknown>;
  }>;
}

/**
 * Build the WhatsApp Baileys service (express + http + ws). Does not listen until start().
 */
export function createApp(env: NodeJS.ProcessEnv = process.env): WaServiceApp {
  const config = loadConfig(env);
  const parent = createParentBridge(config);

  const app = express();
  app.use(express.json());
  const server = http.createServer(app);

  const { broadcastToWs } = attachWorkspaceWs(server, { port: config.PORT });
  const { sessions, startSession, stopSession } = createSessionManager({
    config,
    parent,
    broadcastToWs,
  });
  const heartbeat = createHeartbeat({ config, sessions, parent, startSession });

  registerRoutes(app, { config, sessions, startSession, stopSession });

  function start() {
    return new Promise<{
      app: Express;
      server: HttpServer;
      config: WaServiceConfig;
      sessions: Map<string, unknown>;
    }>((resolve) => {
      server.listen(config.PORT, () => {
        console.log(`[WhatsApp Service] Running on port ${config.PORT}`);
        console.log(`[WhatsApp Service] Parent: ${config.PARENT_URL}`);
        console.log(
          `[WhatsApp Service] Auth backend: ${config.WA_AUTH_BACKEND}${config.pgPool ? ' (DB)' : ' (local files)'}`,
        );
        console.log(`[WhatsApp Service] Sessions dir: ${config.AUTH_DIR}`);
        if (config.WA_INSTANCE_NAME) {
          console.log(
            `[WhatsApp Service] Instance: ${config.WA_INSTANCE_NAME} (heartbeat every ${config.HEARTBEAT_MS}ms)`,
          );
          heartbeat.startHeartbeatLoop();
          heartbeat.resumeAssignedSessions();
        }
        resolve({ app, server, config, sessions });
      });
    });
  }

  return { app, server, config, sessions, startSession, stopSession, start };
}
