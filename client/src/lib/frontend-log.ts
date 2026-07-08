/**
 * Front-end observability. Entries are queued locally and shipped to the
 * back end over the existing websocket as {type: "log"} messages; the back
 * end appends them to its JSONL event log tagged source: "frontend".
 */

interface Entry {
  ts: number;
  type: string;
  data?: unknown;
}

let socket: WebSocket | null = null;
let queue: Entry[] = [];
let installed = false;

/** Called by the chat hook whenever the (re)connected socket changes. */
export function attachLogSocket(ws: WebSocket | null): void {
  socket = ws;
  flush();
}

/** Record a front-end event; delivered when the websocket is open. */
export function frontendLog(type: string, data?: unknown): void {
  queue.push({ ts: Date.now(), type, data });
  flush();
}

function flush(): void {
  if (!socket || socket.readyState !== WebSocket.OPEN || queue.length === 0) {
    return;
  }
  const entries = queue;
  queue = [];
  try {
    socket.send(JSON.stringify({ type: "log", entries }));
  } catch {
    queue = entries.concat(queue); // retry on next flush
  }
}

/** Capture uncaught errors and rejections once per page load. */
export function installErrorLogging(): void {
  if (installed) return;
  installed = true;
  window.addEventListener("error", (e) =>
    frontendLog("window:error", {
      message: e.message,
      source: e.filename,
      line: e.lineno,
    })
  );
  window.addEventListener("unhandledrejection", (e) =>
    frontendLog("window:unhandledrejection", { reason: String(e.reason) })
  );
}
