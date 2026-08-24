import { WebSocketServer } from 'ws';

export function attachWorkspaceWs(server, { path: wsPath = '/ws', port }) {
  const wss = new WebSocketServer({ server, path: wsPath });

  function broadcastToWs(workspaceId, data) {
    wss.clients.forEach((client) => {
      if (client.readyState === 1 && client.workspaceId === workspaceId) {
        client.send(JSON.stringify(data));
      }
    });
  }

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    ws.workspaceId = url.searchParams.get('workspaceId');
    ws.on('close', () => {});
  });

  return { wss, broadcastToWs };
}
