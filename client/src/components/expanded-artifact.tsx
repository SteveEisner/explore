import { FileTextIcon, SparklesIcon } from "lucide-react";
import { FileViewer } from "@/components/file-viewer";
import { Button } from "@/components/ui/button";

/**
 * A launched artifact, taking over the content panel: full-screen view of a
 * wiki .oui file above the (still-mounted) document view. Driven by the
 * `app/expanded-artifact` store key — an embed's Expand button, the user,
 * or either agent can set it; the title bar's Source button clears it,
 * dropping back to the document exactly as it was left.
 */
export function ExpandedArtifact({
  url,
  onMinimize,
  onNavigate,
}: {
  url: string;
  onMinimize: () => void;
  onNavigate: (url: string) => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
        <SparklesIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">
          {url.split("/").pop()}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={onMinimize}
          aria-label="Minimize and return to the document"
        >
          <FileTextIcon data-icon="inline-start" />
          Source
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-none select-text">
        <FileViewer url={url} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
