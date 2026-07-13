import {
  ChevronDownIcon,
  MicIcon,
  MicOffIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatItem, ChatState } from "@/hooks/use-chat";
import type { VoiceState, VoiceStatus } from "@/hooks/use-voice";

/**
 * Chat's resting face, inline in the main toolbar: an *on-air pill* that
 * makes the open mic unmistakable for the whole life of the chat — a green
 * "mic live" wash (green = recording, per the macOS/meeting convention;
 * red is reserved for failures), a live equalizer dancing with the
 * microphone input, and the session state spelled out (Listening /
 * Speaking / Working) — plus the expander that drops the conversation
 * pane (bubbles, composer) down below the toolbar. Collapsed chat is for
 * *talking*; anything needing text or reading back lives in the expanded
 * pane.
 */
export function ChatBar({
  chat,
  voice,
  expanded,
  onToggleExpanded,
}: {
  chat: ChatState;
  voice: VoiceState;
  /** The conversation pane is currently dropped down. */
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  // With the pane collapsed, the bar is chat's only visible surface — the
  // mic button doubles as the problem indicator: amber for a live-session
  // warning (silent mic), red icon for a failed session; the message rides
  // in the tooltip, and expanding the pane shows it in full.
  const micTitle = voice.warning ?? voice.error ?? statusTitle(voice);

  return (
    <div
      className={
        "flex h-8 shrink-0 items-center gap-1.5 rounded-md border pl-1 pr-1 " +
        pillClass(voice.status)
      }
    >
      <Button
        type="button"
        size="icon-sm"
        variant={voice.active ? "default" : "ghost"}
        onClick={voice.toggle}
        aria-label={
          voice.active ? "End the voice conversation" : "Start a voice conversation"
        }
        title={micTitle}
        className={
          voice.status === "error"
            ? "text-destructive"
            : voice.warning
              ? "text-amber-600 dark:text-amber-500"
              : undefined
        }
      >
        {/* A live mic shows a mic (recording); mic-off only on a failed
            session — it reads as "muted/disabled". */}
        {voice.status === "error" ? <MicOffIcon /> : <MicIcon />}
      </Button>

      {voice.active && (
        <LevelBars status={voice.status} level={voice.inputLevel} />
      )}

      {/* The state, spelled out for the whole session — the pill never goes
          quiet while the mic is hot. Fixed width so Listening ↔ Speaking
          flips don't make the toolbar jitter. */}
      <span
        className={"w-16 shrink-0 text-xs font-medium " + labelClass(voice.status)}
        title={micTitle}
        aria-live="polite"
      >
        {statusLabel(voice.status)}
      </span>

      {/* Latest-action ticker: a glimpse of what just happened in the
          conversation (last utterance, running tool, error) so the
          collapsed bar isn't a black box; the full story lives behind the
          expander. */}
      {latestAction(chat.items) && (
        <span
          className="min-w-0 max-w-64 truncate text-xs text-muted-foreground"
          title={latestAction(chat.items) ?? undefined}
        >
          {latestAction(chat.items)}
        </span>
      )}

      {/* The expander: the only way the conversation pane (and the typed
          composer) appears. The busy dot mirrors the closed chat button's
          "answer in progress" signal, so a reply arriving while collapsed
          is never invisible. */}
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        aria-label={expanded ? "Hide the conversation" : "Show the conversation"}
        className="relative"
      >
        <ChevronDownIcon
          className={"transition-transform " + (expanded ? "rotate-180" : "")}
        />
        {chat.busy && !expanded && (
          <span className="absolute top-0.5 right-0.5 size-1.5 animate-pulse rounded-full bg-primary" />
        )}
      </Button>
    </div>
  );
}

/** Per-bar height factors — an equalizer silhouette, tallest in the middle. */
const EQ_BARS = [0.5, 0.85, 1, 0.7, 0.45];

/**
 * The "we're talking" heartbeat. While listening, bar heights track the
 * live mic level (amplified — conversational peaks sit well under 1.0), so
 * the pill visibly dances when the user speaks and sits at a resting
 * baseline when the room is quiet. While the model speaks or works, the
 * bars pulse on a stagger instead — activity without a local level to show.
 */
function LevelBars({ status, level }: { status: VoiceStatus; level: number }) {
  const pulsing = status !== "listening";
  return (
    <span className="flex h-5 items-center gap-0.5" aria-hidden>
      {EQ_BARS.map((factor, i) => (
        <span
          key={i}
          className={
            "w-1 rounded-full transition-[height] duration-150 " +
            (status === "tool" ? "bg-amber-500 " : "bg-emerald-500 ") +
            (pulsing ? "animate-pulse" : "")
          }
          style={{
            height: pulsing
              ? `${Math.round(5 + factor * 11)}px`
              : `${Math.round(4 + factor * Math.min(1, level * 3) * 14)}px`,
            animationDelay: `${i * 120}ms`,
          }}
        />
      ))}
    </span>
  );
}

/**
 * The pill's wash: a distinct green "on air" while the mic is hot —
 * attention-grabbing without reading as an error (red is failures only).
 */
function pillClass(status: VoiceStatus): string {
  switch (status) {
    case "listening":
    case "speaking":
    case "tool":
      return "border-emerald-300/80 bg-emerald-500/10 dark:border-emerald-800";
    case "connecting":
      return "animate-pulse bg-muted/40";
    case "error":
      return "border-destructive/50 bg-destructive/10";
    case "idle":
      return "bg-muted/40";
  }
}

function labelClass(status: VoiceStatus): string {
  switch (status) {
    case "listening":
    case "speaking":
      return "text-emerald-700 dark:text-emerald-400";
    case "tool":
      return "text-amber-700 dark:text-amber-500";
    case "error":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

/**
 * The newest conversation event worth a glance: an utterance (either side),
 * a tool being invoked, or an error — walking past lifecycle noise
 * (finished-tool ticks, status rows, turn results). Null before the first
 * real event.
 */
function latestAction(items: ChatItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    switch (item.kind) {
      case "user":
        return `You: ${item.text}`;
      case "assistant":
      case "error":
        return item.text;
      case "tool":
        // An in-flight tool names real work; "tool finished" is noise.
        if (!item.finished) return item.text;
        continue;
      default:
        continue;
    }
  }
  return null;
}

/** Tooltip text: the label, except delegations get the fuller story. */
function statusTitle(voice: VoiceState): string {
  if (
    voice.status === "tool" &&
    voice.runningTools.includes("ask_artifact_agent")
  ) {
    // A delegation runs for minutes; say so (the expanded pane's progress
    // strip carries the live detail).
    return "Claude is working on a delegated job — expand the chat for progress";
  }
  return statusLabel(voice.status);
}

function statusLabel(status: VoiceStatus): string {
  switch (status) {
    case "connecting":
      return "Connecting…";
    case "listening":
      return "Listening…";
    case "speaking":
      return "Speaking…";
    case "tool":
      return "Working…";
    case "error":
      return "Voice failed";
    case "idle":
      return "Voice off";
  }
}
