import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { JsonlLogger } from "./logger.js";
import { ouiLangExplainer } from "./prompt.js";
import { frontendToolNames, voiceToolSchemas } from "./voice-tools.js";

/**
 * POST /api/voice/session — mint an ephemeral OpenAI Realtime client secret
 * for the browser's voice session (decisions.md D5, voice row 1).
 *
 * The full session config is fixed server-side at mint time — model, voice,
 * the guidance document as instructions, and the tool schemas from the
 * registry — so the browser can only *use* the session we defined, and the
 * real API key never leaves this process. The browser gets back the secret,
 * the model name, and the list of tools it must execute locally.
 *
 * Endpoint/shape verified against the current Realtime API docs
 * (developers.openai.com, 2026-07-11): secrets are minted at
 * /v1/realtime/client_secrets and returned in the response's `value`; the
 * browser then POSTs its SDP offer to /v1/realtime/calls with that secret.
 */

const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";
/** Current realtime speech-to-speech model (docs, 2026-07-11). */
const DEFAULT_MODEL = "gpt-realtime-2.1";
const DEFAULT_VOICE = "marin";

// Same resolution rule as prompt.ts: works from src/ (tsx) and dist/.
const GUIDANCE_FILE = path.resolve(
  import.meta.dirname,
  "../prompts/voice-agent.md"
);

export interface VoiceSessionAnswer {
  /** The ephemeral client secret the browser presents to OpenAI. */
  value: string;
  /** Unix seconds when the secret stops working. */
  expiresAt?: number;
  model: string;
  /** Tool names the browser executes locally (all others bridge to us). */
  frontendTools: string[];
}

export function createVoiceSessionHandler(logger: JsonlLogger) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method !== "POST") {
      answer(res, 405, { error: "POST only" });
      return;
    }
    void mintSession(logger).then(
      (session) => answer(res, 200, session),
      (err: HttpError) => {
        logger.log("server", {
          type: "voice:session-error",
          status: err.status ?? 500,
          message: err.message,
        });
        answer(res, err.status ?? 500, { error: err.message });
      }
    );
  };
}

/** Error carrying the HTTP status the failure should surface as. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

async function mintSession(logger: JsonlLogger): Promise<VoiceSessionAnswer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new HttpError(
      503,
      "voice is not configured: set OPENAI_API_KEY (e.g. in .env.local at the repo root)"
    );
  }
  const model = process.env.VOICE_MODEL || DEFAULT_MODEL;
  // The guidance document is read per mint (like the chat prompts): an edit
  // applies to the next voice session with no server restart. A missing
  // file is a deployment bug — a voice session must never start unguided.
  let instructions: string;
  try {
    // The same OpenUI Lang explainer the Claude session gets (prompt.ts):
    // the voice model writes .oui through edit_artifact/create_doc, and an
    // unguided model invents syntax (seen 2026-07-12, design/explainer.oui).
    instructions =
      readFileSync(GUIDANCE_FILE, "utf8").trim() +
      "\n\n# OpenUI Lang (.oui artifacts)\n\n" +
      "The language your edit_artifact tool speaks, and the only valid " +
      "content for a .oui file you create with create_doc.\n\n" +
      ouiLangExplainer();
  } catch (err) {
    throw new HttpError(
      500,
      `could not read the voice guidance document: ${String(err)}`
    );
  }

  const session = {
    type: "realtime",
    model,
    instructions,
    tools: voiceToolSchemas(),
    audio: {
      // Input transcription feeds the shared chat transcript (voice row 8);
      // semantic VAD gives natural end-of-turn detection plus barge-in.
      input: {
        transcription: { model: "gpt-4o-mini-transcribe" },
        turn_detection: { type: "semantic_vad" },
      },
      output: { voice: process.env.VOICE_VOICE || DEFAULT_VOICE },
    },
  };

  const response = await fetch(CLIENT_SECRETS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session }),
  }).catch((err: unknown) => {
    throw new HttpError(502, `could not reach OpenAI: ${String(err)}`);
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 500);
    throw new HttpError(
      502,
      `OpenAI refused the voice session (${response.status}): ${detail}`
    );
  }

  // The docs' examples read the secret from `value`; tolerate the nested
  // `client_secret` spelling some API-reference pages show, so a shape
  // drift degrades to a clear error rather than an undefined secret.
  const data = (await response.json()) as {
    value?: string;
    expires_at?: number;
    client_secret?: { value?: string; secret?: string; expires_at?: number };
  };
  const value =
    data.value ?? data.client_secret?.value ?? data.client_secret?.secret;
  if (!value) {
    throw new HttpError(
      502,
      "OpenAI's response carried no client secret — the API shape may have changed; see server logs"
    );
  }
  logger.log("server", { type: "voice:session-minted", model });
  return {
    value,
    expiresAt: data.expires_at ?? data.client_secret?.expires_at,
    model,
    frontendTools: frontendToolNames(),
  };
}

function answer(
  res: ServerResponse,
  status: number,
  body: VoiceSessionAnswer | { error: string }
): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
