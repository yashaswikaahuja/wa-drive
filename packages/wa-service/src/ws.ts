import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';

type WorkspaceSocket = WebSocket & { workspaceId?: string | null };

export function attachWorkspaceWs(
  server: HttpServer,
  {
    path: wsPath = '/ws',
    port,
  }: {
    path?: string;
    port: number;
  },
) {
  const wss = new WebSocketServer({ server, path: wsPath });

  function broadcastToWs(workspaceId: string, data: object) {
    wss.clients.forEach((client) => {
      const ws = client as WorkspaceSocket;
      if (ws.readyState === 1 && ws.workspaceId === workspaceId) {
        ws.send(JSON.stringify(data));
      }
    });
  }

  wss.on('connection', (ws, req) => {
    const socket = ws as WorkspaceSocket;
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    socket.workspaceId = url.searchParams.get('workspaceId');
    socket.on('close', () => {});
  });

  return { wss, broadcastToWs };
}
