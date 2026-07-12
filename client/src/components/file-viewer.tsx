import * as React from "react";
import { FileWarningIcon, LoaderIcon } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { frontendLog } from "@/lib/frontend-log";
import { GenerativeView } from "@/lib/openui";
import { useStoreValue } from "@/lib/state-store";

/**
 * Renders content served directly as files from the back end (the wiki at
 * /docs). Markdown always renders through ReactMarkdown (by extension or
 * text/markdown content type), .oui files through the OpenUI renderer,
 * anything else as preformatted text.
 *
 * `url === null` means the empty, in-memory OUI document the app starts on.
 * Same-origin links inside rendered markdown load into the panel via
 * `onNavigate`; external links keep default browser behavior.
 */
export function FileViewer({
  url,
  onNavigate,
}: {
  url: string | null;
  onNavigate: (url: string) => void;
}) {
  const [state, setState] = React.useState<
    | { status: "empty" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; text: string; contentType: string }
  >({ status: "empty" });

  // Wiki hot-reload: the chat hook bumps this store key on wiki:changed
  // events; when the change is for the file we're showing, refetch it.
  const [wikiChanged] = useStoreValue<{ url: string; seq: number } | null>(
    "app/wiki-changed",
    null
  );
  const reloadSeq =
    url !== null && wikiChanged?.url === url ? wikiChanged.seq : 0;
  const shownUrlRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (url === null) {
      shownUrlRef.current = null;
      setState({ status: "empty" });
      return;
    }
    let stale = false;
    // A hot-reload of the file already on screen refetches silently —
    // keep the current content up instead of flashing the loading state.
    if (shownUrlRef.current !== url) setState({ status: "loading" });
    shownUrlRef.current = url;
    frontendLog("doc:load", { url, reloadSeq });
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return {
          text: await res.text(),
          contentType: res.headers.get("content-type") ?? "",
        };
      })
      .then(({ text, contentType }) => {
        if (!stale) setState({ status: "ready", text, contentType });
      })
      .catch((err: Error) => {
        frontendLog("doc:error", { url, message: err.message });
        if (!stale) setState({ status: "error", message: err.message });
      });
    return () => {
      stale = true;
    };
  }, [url, reloadSeq]);

  const handleLink = React.useCallback(
    (href: string, event: React.MouseEvent) => {
      const base = new URL(url ?? "/", location.origin);
      const target = new URL(href, base);
      if (target.origin !== location.origin) return; // external: browser handles
      event.preventDefault();
      onNavigate(target.pathname);
    },
    [url, onNavigate]
  );

  switch (state.status) {
    case "empty":
      // The empty in-memory OUI document: render it (nothing) plus a hint.
      return (
        <>
          <GenerativeView response="" />
          <p className="p-6 text-sm text-muted-foreground">
            Empty OUI document. Load a file from the toolbar, or switch to
            authoring mode and ask Claude to build something.
          </p>
        </>
      );
    case "loading":
      return (
        <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <LoaderIcon className="size-4 animate-spin" /> Loading {url}…
        </p>
      );
    case "error":
      return (
        <p className="flex items-center gap-2 p-6 text-sm text-destructive">
          <FileWarningIcon className="size-4" /> Couldn’t load {url}:{" "}
          {state.message}
        </p>
      );
    case "ready": {
      // "ready" is only ever set for a fetched url, but state lags one
      // render behind a url change: right after navigating to the empty
      // document (url null) this frame still holds the old content — render
      // nothing until the effect resets state to "empty".
      if (url === null) return null;
      const { text, contentType } = state;
      if (url.endsWith(".oui")) {
        return <GenerativeView response={text} />;
      }
      if (isMarkdown(url, contentType)) {
        // Reading layout: a readable measure using the roomy typeset-docs
        // preset rather than the chat sidebar's compact typeset-chat.
        // Left-biased centering: the left margin caps at true center but
        // shrinks first so the right gutter stays >= 24rem where space
        // allows — the floating chat panel (w-96) then opens over gutter,
        // not text. Clamp floor 0: px-8 still pads narrow windows.
        return (
          <Markdown
            text={text}
            typeset
            className="mr-auto ml-[clamp(0px,100%-72rem,(100%-48rem)/2)] max-w-3xl px-8 py-10"
            onLinkClick={handleLink}
          />
        );
      }
      return <pre className="overflow-x-auto p-6 text-sm">{text}</pre>;
    }
  }
}

function isMarkdown(url: string, contentType: string): boolean {
  return (
    url.endsWith(".md") ||
    url.endsWith(".markdown") ||
    contentType.includes("text/markdown")
  );
}
