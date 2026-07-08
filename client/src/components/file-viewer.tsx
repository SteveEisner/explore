import * as React from "react";
import { FileWarningIcon, LoaderIcon } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { frontendLog } from "@/lib/frontend-log";
import { GenerativeView } from "@/lib/openui";

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

  React.useEffect(() => {
    if (url === null) {
      setState({ status: "empty" });
      return;
    }
    let stale = false;
    setState({ status: "loading" });
    frontendLog("doc:load", { url });
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
  }, [url]);

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
      const { text, contentType } = state;
      if (url!.endsWith(".oui")) {
        return <GenerativeView response={text} />;
      }
      if (isMarkdown(url!, contentType)) {
        return <Markdown text={text} className="p-6" onLinkClick={handleLink} />;
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
