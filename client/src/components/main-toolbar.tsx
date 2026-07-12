import {
  FileTextIcon,
  HomeIcon,
  MessageSquareIcon,
  PanelRightCloseIcon,
  PenLineIcon,
  SaveIcon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStoreValue } from "@/lib/state-store";
import type { MainView } from "@/App";

/**
 * Toolbar across the top of the main viewing area, shaped like a filename
 * selector: home on the left, the current document's name in the middle
 * (an editable name + Save button while authoring), the line-drawing tool
 * and chat toggle on the right. Authoring mode is entered via the floating
 * "New Artifact" button over the main pane; screenshots are sent from the
 * chat pane's composer.
 */
export function MainToolbar({
  view,
  onView,
  drawMode,
  onToggleDraw,
  chatOpen,
  onToggleChat,
  chatBusy,
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
  onSaveArtifact: (name: string) => void;
  /** There is a finished program to save (not empty, not mid-stream). */
  canSave: boolean;
  saving: boolean;
  saveError: string | null;
}) {
  return (
    // mr-96 tracks the floating chat panel (same width and duration as its
    // slide in App.tsx) so the right-side buttons never sit under it.
    <div
      className={
        "flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3 " +
        "transition-[margin] duration-200 " +
        (chatOpen ? "mr-96" : "")
      }
    >
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

      <div className="mx-1 h-5 w-px bg-border" aria-hidden />

      <Button
        size="icon-sm"
        variant={drawMode ? "secondary" : "ghost"}
        onClick={onToggleDraw}
        aria-pressed={drawMode}
        aria-label="Line drawing mode"
      >
        <PenLineIcon />
      </Button>

      <div className="mx-1 h-5 w-px bg-border" aria-hidden />

      {/* Doubles as the panel's close button while chat is open — the
          sidebar has no close control of its own. */}
      <Button
        size="icon-sm"
        variant={chatOpen ? "secondary" : "ghost"}
        onClick={onToggleChat}
        aria-pressed={chatOpen}
        aria-label={chatOpen ? "Close chat panel" : "Open chat panel"}
        className="relative"
      >
        {chatOpen ? <PanelRightCloseIcon /> : <MessageSquareIcon />}
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
        <span className="truncate text-xs text-destructive" role="alert">
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
    </div>
  );
}
