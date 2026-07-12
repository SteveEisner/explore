import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import path from "node:path";

/**
 * Where events reaching the back end are recorded. Each line is one JSON
 * object: { ts, source, ...event }. Sources:
 *   "client"   — websocket messages received from the front end
 *   "frontend" — browser-side log entries forwarded over the websocket
 *   "claude"   — raw Claude CLI stream events
 *   "server"   — back-end lifecycle (connections, spawn/exit, stderr, errors)
 */
const DEFAULT_LOG_FILE = "/tmp/explore-events.jsonl";

export type LogSource = "client" | "frontend" | "claude" | "server";

/**
 * Minimum shape of a log line's payload. Every event flowing through the
 * server — protocol messages, Claude stream events, ad-hoc lifecycle
 * records — carries a `type` discriminant; whatever other fields the event
 * has are spread into the log line at write time.
 */
export interface LoggableEvent {
  type: string;
}

export class JsonlLogger {
  private stream: WriteStream;
  readonly file: string;

  constructor(file = process.env.EVENTS_LOG ?? DEFAULT_LOG_FILE) {
    this.file = file;
    mkdirSync(path.dirname(file), { recursive: true });
    this.stream = createWriteStream(file, { flags: "a" });
  }

  log<E extends LoggableEvent>(source: LogSource, event: E): void {
    // Never let observability break the app: swallow serialization errors.
    try {
      this.stream.write(
        JSON.stringify({ ts: new Date().toISOString(), source, ...event }) +
          "\n"
      );
    } catch {
      // ignored
    }
  }
}
