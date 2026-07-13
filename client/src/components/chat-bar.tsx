import {
  ChevronDownIcon,
  MicIcon,
  MicOffIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatState } from "@/hooks/use-chat";
import type { VoiceState } from "@/hooks/use-voice";

/**
 * Chat's resting face, inline in the main toolbar: just the voice cluster —
 * mic toggle, live input level — plus the expander that drops the
 * conversation pane (bubbles, composer) down below the toolbar. Collapsed
 * chat is for *talking*; anything needing text or reading back lives in
 * the expanded pane.
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
  const micTitle = voice.warning ?? voice.error ?? voiceStatusTitle(voice);

  return (
    <div className="flex h-8 shrink-0 items-center gap-1 rounded-md border bg-muted/40 px-1">
      <Button
        type="button"
        size="icon-sm"
        variant={voice.active ? "destructive" : "ghost"}
        onClick={voice.toggle}
        aria-label={
          voice.active ? "End the voice conversation" : "Start a voice conversation"
        }
        title={micTitle}
        className={
          voice.active
            ? "animate-pulse"
            : voice.status === "error"
              ? "text-destructive"
              : voice.warning
                ? "text-amber-600 dark:text-amber-500"
                : undefined
        }
      >
        {/* A live mic shows a pulsing mic (recording); mic-off only on a
            failed session — it reads as "muted/disabled". */}
        {voice.status === "error" ? <MicOffIcon /> : <MicIcon />}
      </Button>
      {voice.active && (
        <span
          aria-label="Microphone input level"
          title={`Mic level — device: ${voice.micLabel ?? "unknown"}`}
          className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-muted"
        >
          <span
            className="block h-full rounded-full bg-green-500 transition-[width] duration-150"
            style={{ width: `${Math.round(Math.min(1, voice.inputLevel) * 100)}%` }}
          />
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

/** Tooltip phrasing for a healthy session, by state. */
function voiceStatusTitle(voice: VoiceState): string {
  switch (voice.status) {
    case "connecting":
      return "Connecting voice…";
    case "listening":
      return "Listening…";
    case "speaking":
      return "Speaking…";
    case "tool":
      // A delegation runs for minutes; say so (the expanded pane's progress
      // strip carries the live detail).
      return voice.runningTools.includes("ask_artifact_agent")
        ? "Claude is working on a delegated job — expand the chat for progress"
        : "Working on it…";
    default:
      return "Voice off";
  }
}
