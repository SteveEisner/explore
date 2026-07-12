import * as React from "react";
import { play } from "cuelume";
import { useStoreValue } from "@/lib/state-store";
import type { MainView } from "@/App";
import type { VoiceStatus } from "@/hooks/use-voice";

/**
 * Sound cues (cuelume, Web Audio synthesis). Design decision 2026-07-11:
 * clicks and hovers stay silent — sounds mark only things the user did NOT
 * do themselves, i.e. server-pushed events, plus the voice mic going
 * live/closed (where "is it listening?" is otherwise invisible).
 */

/**
 * Chime when a server-pushed wiki edit lands in the document currently on
 * screen — the LLM (or voice agent) just changed what the user is reading.
 */
export function useServerEventSounds(view: MainView): void {
  const [wikiChanged] = useStoreValue<{ url: string; seq: number } | null>(
    "app/wiki-changed",
    null
  );
  // Seed with the mount-time seq so a rehydrated store value doesn't chime.
  const seenSeq = React.useRef(wikiChanged?.seq ?? 0);

  React.useEffect(() => {
    if (!wikiChanged || wikiChanged.seq === seenSeq.current) return;
    seenSeq.current = wikiChanged.seq;
    if (view.kind === "doc" && view.url === wikiChanged.url) play("chime");
  }, [wikiChanged, view]);
}

/** Statuses where the mic session is actually live (not merely requested). */
const LIVE_STATUSES: readonly VoiceStatus[] = ["listening", "speaking", "tool"];

/**
 * Voice on/off cues: a warm bloom when the realtime session becomes live
 * (mic actually listening, not just connecting) and a falling droplet when
 * it ends, so the open-mic state is always audible.
 */
export function useVoiceSounds(status: VoiceStatus | undefined): void {
  const wasLive = React.useRef(false);

  React.useEffect(() => {
    const live = status !== undefined && LIVE_STATUSES.includes(status);
    if (live !== wasLive.current) play(live ? "bloom" : "droplet");
    wasLive.current = live;
  }, [status]);
}
