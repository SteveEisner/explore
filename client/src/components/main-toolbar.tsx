import {
  FileCodeIcon,
  FileTextIcon,
  FlaskConicalIcon,
  PencilIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Separator } from "@/components/ui/separator";
import type { MainView } from "@/App";

/** Wiki files loadable from the toolbar (served by the back end at /docs). */
const DOCS = [
  { label: "README.md", url: "/docs/README.md", icon: FileTextIcon },
  { label: "PR.oui", url: "/docs/PR.oui", icon: FileCodeIcon },
  { label: "pr-review.oui", url: "/docs/pr-review.oui", icon: FileCodeIcon },
];

/**
 * Toolbar across the top of the main viewing area: switch between viewing
 * wiki files and authoring mode, plus the Test chat trigger.
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
      <ButtonGroup>
        {DOCS.map((doc) => (
          <Button
            key={doc.url}
            size="sm"
            variant={
              view.kind === "doc" && view.url === doc.url
                ? "secondary"
                : "outline"
            }
            onClick={() => onView({ kind: "doc", url: doc.url })}
          >
            <doc.icon /> {doc.label}
          </Button>
        ))}
      </ButtonGroup>

      <Button
        size="sm"
        variant={view.kind === "authoring" ? "secondary" : "outline"}
        onClick={() => onView({ kind: "authoring" })}
      >
        <PencilIcon /> Author
      </Button>

      <Separator orientation="vertical" className="mx-1 !h-6" />

      <Button size="sm" onClick={onTest} disabled={disabled}>
        <FlaskConicalIcon /> Test
      </Button>
    </div>
  );
}
