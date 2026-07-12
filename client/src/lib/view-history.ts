import * as React from "react";
import type { MainView } from "@/App";
import { getState, setState, subscribeState } from "@/lib/state-store";

/**
 * Browser-history integration for the main view (TASKS.md, Web app):
 * pressing Back used to unload the whole SPA. Every view change flows
 * through the "app/view" store key (toolbar, wiki links, LLM set_state),
 * so this module mirrors that single key into `history` entries with a
 * hash URL — Back/Forward then move between views instead of leaving.
 *
 * Hash (not path) URLs: the client is served by Vite dev / static dist
 * with no catch-all SPA route on the server, so `#/doc/...` needs no
 * server changes and survives reloads.
 */

/**
 * The view lives in the state store, so it can be written by the LLM's
 * set_state tool as well as our own components — tolerate the shapes an LLM
 * plausibly writes: a bare "/docs/..." string means "open that file".
 */
export function normalizeView(raw: unknown): MainView {
  if (typeof raw === "string") return { kind: "doc", url: raw };
  if (raw && typeof raw === "object") {
    const v = raw as { kind?: unknown; url?: unknown };
    if (v.kind === "home") return { kind: "home" };
    if (v.kind === "authoring") return { kind: "authoring" };
    if (v.kind === "doc" && (typeof v.url === "string" || v.url === null)) {
      return { kind: "doc", url: v.url };
    }
  }
  return { kind: "home" };
}

/**
 * "#/home" | "#/authoring" | "#/doc" (empty in-memory doc) |
 * "#/doc/<url>" with each url segment percent-encoded — a wiki url like
 * "/docs/notes.md" round-trips losslessly as "#/doc//docs/notes.md".
 */
export function viewToHash(view: MainView): string {
  switch (view.kind) {
    case "home":
      return "#/home";
    case "authoring":
      return "#/authoring";
    case "doc":
      return view.url === null
        ? "#/doc"
        : "#/doc/" + view.url.split("/").map(encodeURIComponent).join("/");
  }
}

/** Inverse of viewToHash; null when the hash names no known view. */
export function hashToView(hash: string): MainView | null {
  if (hash === "#/" || hash === "#/home") return { kind: "home" };
  if (hash === "#/authoring") return { kind: "authoring" };
  if (hash === "#/doc") return { kind: "doc", url: null };
  if (hash.startsWith("#/doc/")) {
    const url = hash
      .slice("#/doc/".length)
      .split("/")
      .map(decodeURIComponent)
      .join("/");
    return { kind: "doc", url };
  }
  return null;
}

/** Views compare by content, not identity (store writes make fresh objects). */
function viewJson(view: MainView): string {
  return JSON.stringify(view);
}

/**
 * Mount-once effect (called from App, mirroring sound-cues' pattern):
 *
 * - On load, a view-naming URL hash seeds the store (deep link / reload),
 *   then the current view is replaceState'd as the first entry.
 * - Each genuine "app/view" change (different view than the entry we're on,
 *   whatever its source — click or server/LLM set_state) pushes an entry.
 * - popstate writes the entry's view back into the store.
 *
 * Loop guards: `applyingHistory` stops the store write we make during
 * popstate from being seen as a new navigation, and `trackedJson` dedupes
 * store writes that don't actually change the view. drawMode/chatOpen live
 * under other keys and never enter history.
 */
export function useViewHistory(): void {
  React.useEffect(() => {
    let applyingHistory = false;
    let trackedJson = "";

    // Store writes triggered by history traversal must not push new entries;
    // setState emits synchronously, so a simple flag brackets the listener.
    const applyToStore = (view: MainView): void => {
      trackedJson = viewJson(view);
      applyingHistory = true;
      try {
        setState("app/view", view);
      } finally {
        applyingHistory = false;
      }
    };

    // Initial load: a hash like "#/doc//docs/notes.md" wins over the store
    // default, then the resulting view becomes the first history entry.
    const fromHash = hashToView(window.location.hash);
    if (
      fromHash &&
      viewJson(fromHash) !== viewJson(normalizeView(getState("app/view")))
    ) {
      applyToStore(fromHash);
    }
    const initial = normalizeView(getState("app/view"));
    trackedJson = viewJson(initial);
    history.replaceState({ view: initial }, "", viewToHash(initial));

    const unsubscribe = subscribeState("app/view", () => {
      if (applyingHistory) return;
      const view = normalizeView(getState("app/view"));
      const json = viewJson(view);
      if (json === trackedJson) return; // same view — not a navigation
      trackedJson = json;
      history.pushState({ view }, "", viewToHash(view));
    });

    const onPopState = (event: PopStateEvent): void => {
      // Entries we pushed carry the view in state; a bare hash entry (user
      // edited the URL by hand) falls back to parsing the hash.
      const state = event.state as { view?: unknown } | null;
      const view =
        state && state.view !== undefined
          ? normalizeView(state.view)
          : (hashToView(window.location.hash) ?? { kind: "home" as const });
      applyToStore(view);
    };
    window.addEventListener("popstate", onPopState);

    return () => {
      unsubscribe();
      window.removeEventListener("popstate", onPopState);
    };
  }, []);
}
