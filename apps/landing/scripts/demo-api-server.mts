/**
 * Local stub API for pixel-exact proof clips (#331).
 * Fictional Ananya Demo only — never production.
 */
import http, { type IncomingMessage, type ServerResponse, type Server } from "node:http";

export const DEMO_OPERATOR = {
  id: "demo-op-1",
  workspaceId: "demo-ws-1",
  name: "Demo Operator",
  email: "demo@cybercontrol.local",
  role: "operator",
  hasPassword: true,
};

export const DEMO_PROFILE = {
  id: "demo-ananya",
  name: "Ananya Demo",
  phone: "9000000001",
  displayLabel: "Ananya Demo",
  relationship: "self",
  data: {
    name: { value: "Ananya Demo" },
    father_name: { value: "Vikram Demo" },
    dob: { value: "12/03/1995" },
    gender: { value: "Female" },
    aadhaar_number: { value: "000011112222" },
    phone: { value: "9000000001" },
    mobile: { value: "9000000001" },
    address: { value: "Demo Ward 1, Sample Nagar" },
    village: { value: "Sample Nagar" },
    district: { value: "Demo District" },
    state: { value: "Demo State" },
    pincode: { value: "800001" },
    post_office: { value: "Demo PO" },
  },
};

const HOUSEHOLDS = [
  {
    phone: "9000000001",
    person_count: "2",
    persons: [
      { id: "demo-ananya", name: "Ananya Demo", relationship: "self", displayLabel: "Ananya Demo" },
      { id: "demo-vikram", name: "Vikram Demo", relationship: "father", displayLabel: "Vikram Demo" },
    ],
  },
  {
    phone: "9000000003",
    person_count: "1",
    persons: [
      { id: "demo-priya", name: "Priya Demo", relationship: "self", displayLabel: "Priya Demo" },
    ],
  },
];

const QUEUE = [
  {
    phone: "9000000001",
    name: "Ananya Demo",
    docCount: 6,
    lastActivity: new Date().toISOString(),
    status: "ready",
    fieldCount: 12,
  },
  {
    phone: "9000000003",
    name: "Priya Demo",
    docCount: 3,
    lastActivity: new Date().toISOString(),
    status: "pending",
    fieldCount: 5,
  },
];

const DRIVE_FILES = [
  {
    id: "demo-file-aadhaar",
    name: "aadhaar_demo_front.jpg",
    mimeType: "image/jpeg",
    source: "whatsapp",
    phone: "9000000001",
    customerName: "Ananya Demo",
  },
  {
    id: "demo-file-marksheet",
    name: "marksheet_demo.pdf",
    mimeType: "application/pdf",
    source: "whatsapp",
    phone: "9000000001",
    customerName: "Ananya Demo",
  },
  {
    id: "demo-file-photo",
    name: "photo_demo.jpg",
    mimeType: "image/jpeg",
    source: "upload",
    phone: "9000000001",
    customerName: "Ananya Demo",
  },
];

function json(res: ServerResponse, status: number, body: unknown) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  });
  res.end(raw);
}

function stripApi(pathname: string) {
  return pathname.replace(/^\/api(?=\/|$)/, "") || "/";
}

function handle(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    });
    res.end();
    return;
  }

  const url = new URL(req.url || "/", "http://127.0.0.1");
  const path = stripApi(url.pathname);

  if (req.method === "GET" && (path === "/auth/me" || path === "/me")) {
    return json(res, 200, DEMO_OPERATOR);
  }
  if (req.method === "POST" && path === "/auth/refresh") {
    return json(res, 200, { accessToken: "demo-token", refreshToken: "demo-refresh" });
  }
  if (req.method === "GET" && path === "/profiles") {
    return json(res, 200, [DEMO_PROFILE]);
  }
  if (req.method === "GET" && path.startsWith("/profiles/")) {
    const id = path.slice("/profiles/".length);
    if (id === DEMO_PROFILE.id || id === "demo-ananya") return json(res, 200, DEMO_PROFILE);
    return json(res, 404, { error: "not_found" });
  }
  if (req.method === "GET" && path === "/customers/households") {
    return json(res, 200, HOUSEHOLDS);
  }
  if (req.method === "GET" && path === "/dashboard/queue") {
    return json(res, 200, QUEUE);
  }
  if (req.method === "GET" && path.startsWith("/forms/search")) {
    return json(res, 200, []);
  }
  if (req.method === "GET" && path === "/drive/status") {
    return json(res, 200, { connected: true });
  }
  if (req.method === "GET" && path === "/whatsapp/status") {
    return json(res, 200, { connected: true, phone: "9000000000", qr: null });
  }
  if (req.method === "POST" && path === "/whatsapp/connect") {
    return json(res, 200, { ok: true, connected: true });
  }
  if (req.method === "GET" && path === "/drive/files/ws") {
    const source = url.searchParams.get("source");
    const files = source === "whatsapp"
      ? DRIVE_FILES.filter((f) => f.source === "whatsapp")
      : DRIVE_FILES;
    return json(res, 200, { files, folders: [{ id: "demo-folder", name: "Ananya Demo", phone: "9000000001" }] });
  }
  if (req.method === "GET" && path.startsWith("/drive/download/")) {
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Access-Control-Allow-Origin": "*",
    });
    // 1x1 PNG
    res.end(Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ));
    return;
  }

  json(res, 200, {});
}

export type DemoApiHandle = {
  server: Server;
  port: number;
  origin: string;
  apiBase: string;
};

export function startDemoApiServer(port = 0): Promise<DemoApiHandle> {
  const server = http.createServer(handle);
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      const p = typeof addr === "object" && addr ? addr.port : port;
      resolve({
        server,
        port: p,
        origin: `http://127.0.0.1:${p}`,
        apiBase: `http://127.0.0.1:${p}/api`,
      });
    });
  });
}

const entryArg = process.argv[1] || "";
const isMain =
  entryArg.endsWith("demo-api-server.mts") ||
  entryArg.endsWith("demo-api-server.ts") ||
  entryArg.endsWith("demo-api-server.mjs");
if (isMain) {
  const fixed = Number(process.env.DEMO_API_PORT || 4077);
  const { port, apiBase } = await startDemoApiServer(fixed);
  console.log("demo-api listening", apiBase, "port", port);
}
