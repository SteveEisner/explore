import * as React from "react";
import { FileWarningIcon, LoaderIcon } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { frontendLog } from "@/lib/frontend-log";
import { GenerativeView } from "@/lib/openui";

/**
 * Renders content served directly as files from the back end (the wiki at
 * /docs). Rendering is chosen by extension: .oui files go through the OpenUI
 * renderer, .md through markdown, anything else as preformatted text.
 *
 * `url === null` means the empty, in-memory OUI document the app starts on.
 */
export function FileViewer({ url }: { url: string | null }) {
  const [state, setState] = React.useState<
    | { status: "empty" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; text: string }
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
        return res.text();
      })
      .then((text) => {
        if (!stale) setState({ status: "ready", text });
      })
      .catch((err: Error) => {
        frontendLog("doc:error", { url, message: err.message });
        if (!stale) setState({ status: "error", message: err.message });
      });
    return () => {
      stale = true;
    };
  }, [url]);

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
    case "ready":
      return <FileContent url={url!} text={state.text} />;
  }
}

function FileContent({ url, text }: { url: string; text: string }) {
  if (url.endsWith(".oui")) {
    return <GenerativeView response={text} />;
  }
  if (url.endsWith(".md") || url.endsWith(".markdown")) {
    return <Markdown text={text} className="p-6" />;
  }
  return <pre className="overflow-x-auto p-6 text-sm">{text}</pre>;
}
