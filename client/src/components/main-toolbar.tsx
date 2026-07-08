import {
  FileCodeIcon,
  FileTextIcon,
  HomeIcon,
  MessageSquareIcon,
  PencilIcon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MainView } from "@/App";

export const HOME_URL = "/docs/README.md";

/**
 * Toolbar across the top of the main viewing area, shaped like a filename
 * selector: home on the left, the current document's name in the middle
 * (greyed "New Artifact" while authoring), authoring mode on the right.
 */
export function MainToolbar({
  view,
  onView,
  chatOpen,
  onToggleChat,
  chatBusy,
}: {
  view: MainView;
  onView: (view: MainView) => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  chatBusy: boolean;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={() => onView({ kind: "doc", url: HOME_URL })}
        aria-label="Home (README.md)"
      >
        <HomeIcon />
      </Button>

      <ViewTitle view={view} />

      <Button
        size="icon-sm"
        variant={view.kind === "authoring" ? "secondary" : "ghost"}
        onClick={() => onView({ kind: "authoring" })}
        aria-label="Authoring mode"
      >
        <PencilIcon />
      </Button>

      <div className="mx-1 h-5 w-px bg-border" aria-hidden />

      <Button
        size="icon-sm"
        variant={chatOpen ? "secondary" : "ghost"}
        onClick={onToggleChat}
        aria-pressed={chatOpen}
        aria-label="Toggle chat panel"
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

/** The filename-selector face: current document name, or the artifact state. */
function ViewTitle({ view }: { view: MainView }) {
  const face =
    view.kind === "authoring"
      ? { icon: SparklesIcon, name: "New Artifact", muted: true }
      : view.url === null
        ? { icon: FileCodeIcon, name: "Untitled.oui", muted: true }
        : {
            icon: view.url.endsWith(".oui") ? FileCodeIcon : FileTextIcon,
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
