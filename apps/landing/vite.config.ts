import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
function servePrivacyHtml() {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    if (req.url === "/privacy" || req.url === "/privacy/") req.url = "/privacy.html";
    next();
  };
  return {
    name: "privacy-html",
    configureServer(server: { middlewares: { use: (fn: typeof rewrite) => void } }) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server: { middlewares: { use: (fn: typeof rewrite) => void } }) {
      server.middlewares.use(rewrite);
    },
  };
}

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [servePrivacyHtml(), react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
