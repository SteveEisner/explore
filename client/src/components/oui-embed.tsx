import * as React from "react";
import { FileWarningIcon, LoaderIcon } from "lucide-react";
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
      {/* Artifacts adapt to narrow containers (fixed columns cap at 40% of
          the container), but wide ones still benefit from extra room, so the
          embed breaks out of the reading measure: grow up to 72rem via
          symmetric negative margins (44rem = the max-w-3xl column minus its
          px-8 padding), and scroll horizontally rather than squeeze. */}
      <div className="not-typeset my-6 overflow-x-auto rounded-lg border mx-[min(0rem,calc((44rem-min(72rem,100vw-6rem))/2))]">
        {state.status === "loading" && (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <LoaderIcon className="size-4 animate-spin" /> Loading {url}…
          </p>
        )}
        {state.status === "error" && (
          <p className="flex items-center gap-2 p-4 text-sm text-destructive">
            <FileWarningIcon className="size-4" /> Couldn’t load {url}:{" "}
            {state.message}
          </p>
        )}
        {state.status === "ready" && <GenerativeView response={state.text} />}
      </div>
      {children}
    </>
  );
}
