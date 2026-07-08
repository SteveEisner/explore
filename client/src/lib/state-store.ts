import * as React from "react";
import { frontendLog } from "@/lib/frontend-log";

/**
 * The hierarchical key-value store for app and artifact UI state
 * (decisions.md D3). Every interactive control reads its state from here and
 * writes back on interaction, so a server-driven state change (the LLM's
 * `set_state` tool) takes exactly the same path as a local click.
 *
 * Keys are hierarchical strings. App-level keys live under `app/` (e.g.
 * `app/view`, `app/context-level`); artifact component selections live under
 * the component's `stateKey` prop or `artifact/<type>/<statementId>`.
 *
 * Every write is shipped to the back end's JSONL log (`state:write`), which
 * is the store→server half of the sync: the LLM reads the full store through
 * its `state` tool snapshot, and interaction signals can be mined from the
 * log.
 */

const values = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();

function emit(key: string): void {
  for (const listener of listeners.get(key) ?? []) listener();
}

export function getState(key: string): unknown {
  return values.get(key);
}

/** Write one key. `null`/`undefined` deletes it (the key reverts to its default). */
export function setState(
  key: string,
  value: unknown,
  source: "user" | "server" = "user"
): void {
  if (value == null) values.delete(key);
  else values.set(key, value);
  frontendLog("state:write", { key, value, source });
  emit(key);
}

/** Apply a batch of server-driven updates; returns the keys that changed. */
export function applyServerUpdates(
  updates: Record<string, unknown>
): string[] {
  const applied: string[] = [];
  for (const [key, value] of Object.entries(updates ?? {})) {
    setState(key, value, "server");
    applied.push(key);
  }
  return applied;
}

/** The whole store, for state-tool snapshots (keys sorted for stable output). */
export function stateSnapshot(): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const key of [...values.keys()].sort()) snapshot[key] = values.get(key);
  return snapshot;
}

export function subscribeState(key: string, listener: () => void): () => void {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

/**
 * useState backed by the store. The default is seeded into the store on
 * first render (idempotent), so getSnapshot always returns a referentially
 * stable store value and the key is visible in state-tool snapshots even
 * before the first interaction.
 */
export function useStoreValue<T>(
  key: string,
  initial: T
): [T, (value: T) => void] {
  if (!values.has(key) && initial != null) values.set(key, initial);
  const subscribe = React.useCallback(
    (listener: () => void) => subscribeState(key, listener),
    [key]
  );
  const initialRef = React.useRef(initial);
  initialRef.current = initial;
  const getSnapshot = React.useCallback(
    () => (values.has(key) ? (values.get(key) as T) : initialRef.current),
    [key]
  );
  const value = React.useSyncExternalStore(subscribe, getSnapshot);
  const set = React.useCallback((v: T) => setState(key, v), [key]);
  return [value, set];
}
