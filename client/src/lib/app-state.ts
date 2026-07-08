/**
 * Registry connecting the websocket layer to the app's live state. App
 * registers a provider; when the back end forwards a state:request (the
 * LLM's `state` MCP tool), the chat hook calls the provider and ships the
 * snapshot back.
 */

export interface AppStateResult {
  state: unknown;
  /** PNG data URL of the main window, when requested. */
  screenshot?: string;
}

export type AppStateProvider = (options: {
  screenshot: boolean;
}) => Promise<AppStateResult>;

let provider: AppStateProvider | null = null;

export function registerAppStateProvider(p: AppStateProvider): () => void {
  provider = p;
  return () => {
    if (provider === p) provider = null;
  };
}

export async function collectAppState(options: {
  screenshot: boolean;
}): Promise<AppStateResult> {
  if (!provider) throw new Error("no app state provider registered");
  return provider(options);
}
