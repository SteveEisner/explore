import type * as React from "react";
import {
  FileTextIcon,
  HomeIcon,
  MessageSquareIcon,
  PenLineIcon,
  SaveIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { expandedRefLabel, normalizeExpandedRef } from "@/lib/expanded-ref";
import { useStoreValue } from "@/lib/state-store";
import type { MainView } from "@/App";

/**
 * Toolbar across the top of the main viewing area, shaped like a filename
 * selector: home on the left, the current document's name in the middle
 * (an editable name + Save button while authoring), the line-drawing tool
 * and chat toggle on the right. Chat lives *in* the toolbar: toggling it
 * slides the voice cluster (`chatBar` — mic, level, expander) open beside
 * the title; the conversation pane (bubbles + typed composer) only appears
 * via that bar's expander. Authoring mode is entered via the floating
 * "New Artifact" button over the main pane.
 */
export function MainToolbar({
  view,
  onView,
  drawMode,
  onToggleDraw,
  chatOpen,
  onToggleChat,
  chatBusy,
  chatBar,
  onSaveArtifact,
  canSave,
  saving,
  saveError,
}: {
  view: MainView;
  onView: (view: MainView) => void;
  drawMode: boolean;
  onToggleDraw: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  chatBusy: boolean;
  /** The inline chat composer, rendered beside the title while chat is on. */
  chatBar?: React.ReactNode;
  onSaveArtifact: (name: string) => void;
  /** There is a finished program to save (not empty, not mid-stream). */
  canSave: boolean;
  saving: boolean;
  saveError: string | null;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={() => onView({ kind: "home" })}
        aria-label="Home (wiki folder view)"
      >
        <HomeIcon />
      </Button>

      {view.kind === "authoring" ? (
        <ArtifactNameBar
          onSave={onSaveArtifact}
          canSave={canSave}
          saving={saving}
          saveError={saveError}
        />
      ) : (
        <ViewTitle view={view} />
      )}

      {/* The voice cluster is compact (fixed width) — the title keeps the
          middle and just cedes a little room when chat slides open. */}
      {chatOpen && chatBar}

      <div className="mx-1 h-5 w-px bg-border" aria-hidden />

      {/* Toggles read filled-primary when ON, ghost when off — the same
          on = filled language as the chat bar's live mic button. */}
      <Button
        size="icon-sm"
        variant={drawMode ? "default" : "ghost"}
        onClick={onToggleDraw}
        aria-pressed={drawMode}
        aria-label="Line drawing mode"
      >
        <PenLineIcon />
      </Button>

      <div className="mx-1 h-5 w-px bg-border" aria-hidden />

      <Button
        size="icon-sm"
        variant={chatOpen ? "default" : "ghost"}
        onClick={onToggleChat}
        aria-pressed={chatOpen}
        aria-label={chatOpen ? "Close chat" : "Open chat"}
        className="relative"
      >
        <MessageSquareIcon />
        {chatBusy && !chatOpen && (
          <span className="absolute top-0.5 right-0.5 size-1.5 animate-pulse rounded-full bg-primary" />
        )}
      </Button>
    </div>
  );
}

/**
 * The filename bar while authoring a new artifact (J4): click into it to
 * name the artifact, then Save (far right, inside the bar) writes it to the
 * wiki as <name>.oui. A saved artifact is *viewed* (doc mode), so the Save
 * button only ever appears for a not-yet-saved artifact. The name lives in
 * the state store so the LLM can read it and suggest a default.
 */
function ArtifactNameBar({
  onSave,
  canSave,
  saving,
  saveError,
}: {
  onSave: (name: string) => void;
  canSave: boolean;
  saving: boolean;
  saveError: string | null;
}) {
  const [name, setName] = useStoreValue<string>("app/artifact-name", "");
  const saveable = canSave && !saving && name.trim().length > 0;

  return (
    <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border bg-muted/40 pl-3 pr-1 text-sm">
      <SparklesIcon className="size-4 shrink-0 text-muted-foreground" />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && saveable) onSave(name);
        }}
        placeholder="New Artifact — name it to save"
        aria-label="Artifact name"
        className="min-w-0 flex-1 bg-transparent font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground"
      />
      {saveError && (
        // The explanatory message can outgrow the bar; title keeps the full
        // reason reachable when the span truncates.
        <span
          className="truncate text-xs text-destructive"
          role="alert"
          title={saveError}
        >
          {saveError}
        </span>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={!saveable}
        onClick={() => onSave(name)}
        className="h-6 shrink-0 px-2 text-xs"
      >
        <SaveIcon data-icon="inline-start" />
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

/** The filename-selector face: current document name, or the artifact state. */
function ViewTitle({ view }: { view: MainView }) {
  // A launched artifact (the full-panel overlay) rides the right side of the
  // file bar as a closable pill — the document name stays put, saying the
  // page is still open underneath.
  const [rawExpanded, setExpandedArtifact] = useStoreValue<unknown>(
    "app/expanded-artifact",
    null
  );
  const expandedArtifact = normalizeExpandedRef(rawExpanded);
  // Sparkles = artifact (.oui / authoring), file = ordinary wiki document.
  const face =
    view.kind === "home"
      ? { icon: HomeIcon, name: "Home", muted: true }
      : view.kind === "authoring"
        ? { icon: SparklesIcon, name: "New Artifact", muted: true }
        : view.url === null
          ? { icon: SparklesIcon, name: "Untitled.oui", muted: true }
          : {
              icon: view.url.endsWith(".oui") ? SparklesIcon : FileTextIcon,
              name: view.url.split("/").pop()!,
              muted: false,
            };

  return (
    <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm">
      <face.icon className="size-4 shrink-0 text-muted-foreground" />
      <span
        className={
          face.muted
            ? "truncate text-muted-foreground select-text"
            : "truncate font-medium select-text"
        }
      >
        {face.name}
      </span>
      {expandedArtifact && (
        <span className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5 rounded-full border bg-background py-0.5 pr-1 pl-2.5 text-xs shadow-sm">
          <SparklesIcon className="size-3 shrink-0 text-primary" />
          <span className="max-w-48 truncate font-medium">
            {expandedRefLabel(expandedArtifact)}
          </span>
          <button
            type="button"
            onClick={() => setExpandedArtifact(null)}
            aria-label="Minimize the expanded artifact"
            className="cursor-pointer rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        </span>
      )}
    </div>
  );
}
