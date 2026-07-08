import {
  FileCodeIcon,
  FileTextIcon,
  FlaskConicalIcon,
  HomeIcon,
  PencilIcon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { MainView } from "@/App";

const HOME_URL = "/docs/README.md";

/**
 * Toolbar across the top of the main viewing area, shaped like a filename
 * selector: home on the left, the current document's name in the middle
 * (greyed "New Artifact" while authoring), authoring mode on the right.
 */
export function MainToolbar({
  view,
  onView,
  onTest,
  disabled,
}: {
  view: MainView;
  onView: (view: MainView) => void;
  onTest: () => void;
  disabled?: boolean;
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

      <Button size="sm" variant="outline" onClick={onTest} disabled={disabled}>
        <FlaskConicalIcon /> Test
      </Button>

      <Separator orientation="vertical" className="mx-1 !h-6" />

      <Button
        size="icon-sm"
        variant={view.kind === "authoring" ? "secondary" : "ghost"}
        onClick={() => onView({ kind: "authoring" })}
        aria-label="Authoring mode"
      >
        <PencilIcon />
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
          face.muted ? "truncate text-muted-foreground" : "truncate font-medium"
        }
      >
        {face.name}
      </span>
    </div>
  );
}
