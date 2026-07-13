import * as React from "react";
import { FileWarningIcon, LoaderIcon, Maximize2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { frontendLog } from "@/lib/frontend-log";
import { GenerativeView } from "@/lib/openui";
import { useStoreValue } from "@/lib/state-store";

/**
 * Renders an embedded OpenUI application inside markdown. Wiki pages use a
 * custom tag (allowed through rehype-raw + the sanitize schema, mapped in
 * markdown.tsx):
 *
 *     <oui-embed src="pr-502764-review.oui"></oui-embed>
 *
 * A bare filename resolves inside the wiki (/docs); a leading slash is a
 * site-absolute path. Cross-origin sources are refused. Like the file
 * viewer, the embed refetches when the wiki reports its file changed, so a
 * co-editing session updates embeds live.
 *
 * The embed stays inside the document margins as a *preview*: the artifact
 * renders at a wider virtual width and is scaled down (aspect ratio kept)
 * so more of it fits, with a shader over it that says "ready to launch, not
 * for interacting here". The Expand button writes the `app/expanded-artifact`
 * store key; App mounts the full-screen view over the content panel (the
 * markdown view stays mounted and open underneath).
 *
 * Always use an explicit closing tag: the HTML parser treats an unknown
 * self-closing tag as an open tag and nests the rest of the page inside it
 * (which we render as `children` below so the content still shows).
 */
export function OuiEmbed({
  src,
  children,
}: {
  src?: string;
  children?: React.ReactNode;
}) {
  const url = React.useMemo(() => {
    if (!src) return null;
    if (src.includes("://")) return null; // same-origin only
    return src.startsWith("/") ? src : `/docs/${src}`;
  }, [src]);

  const [state, setState] = React.useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; text: string }
  >({ status: "loading" });

  // Wiki hot-reload, same contract as FileViewer: refetch when the change
  // event names the file we're embedding.
  const [wikiChanged] = useStoreValue<{ url: string; seq: number } | null>(
    "app/wiki-changed",
    null
  );
  const reloadSeq = url !== null && wikiChanged?.url === url ? wikiChanged.seq : 0;

  React.useEffect(() => {
    if (url === null) return;
    let stale = false;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.text();
      })
      .then((text) => {
        if (!stale) setState({ status: "ready", text });
      })
      .catch((err: Error) => {
        frontendLog("oui-embed:error", { url, message: err.message });
        if (!stale) setState({ status: "error", message: err.message });
      });
    return () => {
      stale = true;
    };
  }, [url, reloadSeq]);

  if (url === null) {
    return (
      <p className="flex items-center gap-2 text-sm text-destructive">
        <FileWarningIcon className="size-4" /> oui-embed needs a same-origin
        src attribute.
      </p>
    );
  }

  return (
    <>
      <div className="not-typeset my-6">
        {state.status === "loading" && (
          <p className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
            <LoaderIcon className="size-4 animate-spin" /> Loading {url}…
          </p>
        )}
        {state.status === "error" && (
          <p className="flex items-center gap-2 rounded-lg border p-4 text-sm text-destructive">
            <FileWarningIcon className="size-4" /> Couldn’t load {url}:{" "}
            {state.message}
          </p>
        )}
        {state.status === "ready" && (
          <ArtifactPreview url={url} text={state.text} />
        )}
      </div>
      {children}
    </>
  );
}

/**
 * Virtual width the artifact renders at before scaling down to the reading
 * column — wider than the column so the preview shows more content at once;
 * the uniform scale keeps the aspect ratio.
 */
const PREVIEW_WIDTH = 1024;
/** Tallest a preview card gets; taller artifacts clip under the shader. */
const PREVIEW_MAX_HEIGHT = 360;

/**
 * The scaled, non-interactive "ready to launch" card: artifact content
 * rendered live (so it's a real preview, not a screenshot) but blocked from
 * pointer events under a gradient shader, with Expand as the one action.
 */
function ArtifactPreview({ url, text }: { url: string; text: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(0.65);
  const [contentHeight, setContentHeight] = React.useState(PREVIEW_MAX_HEIGHT);
  const [, setExpanded] = useStoreValue<string | null>(
    "app/expanded-artifact",
    null
  );

  // Track both the column width (→ scale) and the artifact's own rendered
  // height (→ card height), so short artifacts get a snug card and tall
  // ones clip at the cap.
  React.useLayoutEffect(() => {
    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;
    const update = () => {
      const width = container.clientWidth;
      if (width > 0) setScale(Math.min(1, width / PREVIEW_WIDTH));
      setContentHeight(inner.offsetHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  const height = Math.min(PREVIEW_MAX_HEIGHT, Math.ceil(contentHeight * scale));
  const expand = () => setExpanded(url);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-lg border bg-background"
      style={{ height }}
    >
      <div
        ref={innerRef}
        aria-hidden
        className="pointer-events-none select-none"
        style={{
          width: PREVIEW_WIDTH,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <GenerativeView response={text} />
      </div>
      {/* The shader: dims and desaturates toward the bottom so the card
          reads as a launchable preview, not a live surface; it also eats
          every click except Expand. */}
      <div
        className="absolute inset-0 flex cursor-pointer items-end justify-center bg-gradient-to-b from-transparent via-background/25 to-background/85 backdrop-saturate-[.35]"
        onClick={expand}
        role="button"
        aria-label={`Expand ${url}`}
      >
        <Button
          size="sm"
          variant="secondary"
          className="mb-3 shadow-md"
          onClick={(e) => {
            e.stopPropagation();
            expand();
          }}
        >
          <Maximize2Icon data-icon="inline-start" />
          Expand
        </Button>
      </div>
    </div>
  );
}
