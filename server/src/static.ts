import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

/**
 * Minimal static file handler. The web serving engine exists only to serve
 * the built front-end application — there are no HTTP API routes. Unknown
 * paths fall back to index.html (SPA routing).
 */
export function createStaticHandler(rootDir: string) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let filePath = path.join(rootDir, path.normalize(url.pathname));
    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = path.join(rootDir, "index.html");
    }
    if (!existsSync(filePath)) {
      res
        .writeHead(404, { "content-type": "text/plain" })
        .end("front end not built yet — run: npm run build -w client");
      return;
    }
    const mime = MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream";
    res.writeHead(200, { "content-type": mime });
    createReadStream(filePath).pipe(res);
  };
}
