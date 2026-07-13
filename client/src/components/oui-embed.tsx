import * as React from "react";
import { FileWarningIcon, LoaderIcon, Maximize2Icon } from "lucide-react";
import type { OpenUIError } from "@openuidev/react-lang";
import { Button } from "@/components/ui/button";
import type { ExpandedArtifactRef } from "@/lib/expanded-ref";
import { frontendLog } from "@/lib/frontend-log";
import { GenerativeView } from "@/lib/openui";
import { useStoreValue } from "@/lib/state-store";
import { cn } from "@/lib/utils";

/**
 * Track whether a GenerativeView is fatally broken — the artifact failed to
 * parse or parsed to no renderable root, the two cases where the Renderer
 * renders nothing at all (both reported with these codes; other errors are
 * partial and still render). Returns the fatal error's message, or null, plus
 * the callback to pass as GenerativeView's onError. The Renderer re-reports
 * on every response change (including `[]` on recovery), so a wiki hot-reload
 * that fixes the file clears the message — keep the GenerativeView mounted
 * while showing the error.
 */
export function useOuiFatalError(): [
  string | null,
  (errors: OpenUIError[]) => void,
] {
  const [message, setMessage] = React.useState<string | null>(null);
  const onError = React.useCallback((errors: OpenUIError[]) => {
    const fatal = errors.find(
      (e) => e.code === "parse-exception" || e.code === "parse-failed"
    );
    setMessage(fatal ? fatal.message : null);
  }, []);
  return [message, onError];
}

/**
 * The destructive-tinted card shown in place of a broken artifact, so a
 * parse failure says why instead of collapsing to nothing. Shared by the
 * embed preview and the full-page .oui view (file-viewer).
 */
export function OuiErrorCard({
  url,
  message,
  className,
}: {
  url: string;
  message: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive",
        className
      )}
    >
      <FileWarningIcon className="mt-0.5 size-4 shrink-0" />
      <span>
        Broken artifact {url}: {message}
      </span>
    </div>
  );
}

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
    // Same-origin only, checked by resolving against our origin — a bare
    // "://" test misses protocol-relative "//host/path" sources. The /docs/
    // base makes bare names wiki-relative while "/", "//host", and full
    // URLs all resolve per URL semantics and must land on our origin.
    try {
      const resolved = new URL(src, location.origin + "/docs/");
      if (resolved.origin !== location.origin) return null;
      return resolved.pathname;
    } catch {
      return null;
    }
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
          <ArtifactPreview
            text={state.text}
            expandRef={url}
            label={url.split("/").pop() ?? url}
          />
        )}
      </div>
      {children}
    </>
  );
}

/**
 * An inline OpenUI block (decisions.md D8): a ```oui fence in a wiki page,
 * rendered as the same launchable preview an embed gets. Maximize is
 * addressed as {doc, line} — the page URL plus the fence's source line — so
 * the expanded view re-reads the block from the document (and hot-reloads
 * with it) instead of carrying the whole program through the store.
 */
export function InlineArtifact({
  program,
  docUrl,
  line,
}: {
  program: string;
  docUrl: string;
  line: number;
}) {
  return (
    <div className="not-typeset my-6">
      <ArtifactPreview
        text={program}
        expandRef={{ doc: docUrl, line }}
        label={`${docUrl.split("/").pop()} artifact`}
      />
    </div>
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
 * `expandRef` is what Expand writes to `app/expanded-artifact`: a .oui URL
 * for file embeds, a {doc, line} reference for inline blocks.
 */
function ArtifactPreview({
  text,
  expandRef,
  label,
}: {
  text: string;
  expandRef: ExpandedArtifactRef;
  label: string;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(0.65);
  const [contentHeight, setContentHeight] = React.useState(PREVIEW_MAX_HEIGHT);
  const [, setExpanded] = useStoreValue<ExpandedArtifactRef | null>(
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

  const [fatalError, onOuiError] = useOuiFatalError();

  // Cursor shine: a radial highlight that follows the pointer across the
  // shader, giving the launchable card a glassy, raised feel. Driven by
  // direct style mutation (not state) — pointermove is too hot for renders.
  const shineRef = React.useRef<HTMLDivElement>(null);
  const moveShine = (e: React.PointerEvent<HTMLDivElement>) => {
    const shine = shineRef.current;
    if (!shine) return;
    const rect = e.currentTarget.getBoundingClientRect();
    shine.style.setProperty("--shine-x", `${e.clientX - rect.left}px`);
    shine.style.setProperty("--shine-y", `${e.clientY - rect.top}px`);
    shine.style.opacity = "1";
  };
  const hideShine = () => {
    if (shineRef.current) shineRef.current.style.opacity = "0";
  };

  const height = Math.min(PREVIEW_MAX_HEIGHT, Math.ceil(contentHeight * scale));
  const expand = () => setExpanded(expandRef);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden rounded-xl bg-background",
        // Broken artifact: the Renderer produced nothing, so the preview
        // would collapse to an empty sliver — show the error card instead.
        // The (zero-height) GenerativeView stays mounted below so a wiki
        // hot-reload that fixes the file clears the error and restores the
        // preview.
        fatalError === null &&
          // A thin raised surface, not an inline image: hairline ring plus a
          // close contact shadow and a soft drop shadow.
          "border ring-1 ring-black/5 shadow-[0_1px_2px_rgba(0,0,0,0.10),0_6px_20px_rgba(0,0,0,0.12)] dark:ring-white/10 dark:shadow-[0_1px_2px_rgba(0,0,0,0.5),0_8px_24px_rgba(0,0,0,0.55)]"
      )}
      style={fatalError === null ? { height } : undefined}
    >
      {fatalError !== null && <OuiErrorCard url={label} message={fatalError} />}
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
        <GenerativeView response={text} onError={onOuiError} />
      </div>
      {/* The shader: dims and desaturates toward the bottom so the card
          reads as a launchable preview, not a live surface; it also eats
          every click except Expand. Dropped for a broken artifact — there
          is nothing to preview or expand, and it would sit over the error
          card. */}
      {fatalError === null && (
        <div
          className="absolute inset-0 flex cursor-pointer items-end justify-center bg-gradient-to-b from-transparent via-background/25 to-background/85 backdrop-saturate-[.35]"
          onClick={expand}
          onPointerMove={moveShine}
          onPointerLeave={hideShine}
          role="button"
          aria-label={`Expand ${label}`}
        >
          {/* The shine: a soft radial highlight under the cursor, fading in
              on hover — the "glass over an app" cue that this is launchable. */}
          <div
            ref={shineRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300"
            style={{
              background:
                "radial-gradient(340px circle at var(--shine-x, 50%) var(--shine-y, 40%), color-mix(in oklab, white 26%, transparent), transparent 65%)",
            }}
          />
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
      )}
    </div>
  );
}
