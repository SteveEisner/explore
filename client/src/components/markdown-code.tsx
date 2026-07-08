import * as React from "react";
import hljs from "highlight.js/lib/common";
import { LoaderIcon } from "lucide-react";

/**
 * Code renderer for markdown. Fenced blocks carry a `language-*` class
 * (inline code doesn't): known languages are colored with highlight.js,
 * unknown ones fall through unstyled. ```mermaid fences are intercepted one
 * level up (the <pre> wrapper) and never reach this component.
 */
export function MarkdownCode({
  className,
  children,
  ...props
}: React.ComponentProps<"code">) {
  const language = /language-([\w+-]+)/.exec(className ?? "")?.[1];
  if (language && hljs.getLanguage(language) && typeof children === "string") {
    return (
      <code
        className={className}
        dangerouslySetInnerHTML={{
          __html: hljs.highlight(children, { language }).value,
        }}
        {...props}
      />
    );
  }
  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
}

/** Unique ids for mermaid's render targets across re-renders. */
let mermaidSeq = 0;

/**
 * Renders a ```mermaid fence as an SVG diagram. Mermaid is heavy, so it's
 * imported lazily on first use; a parse failure falls back to showing the
 * diagram source with the error, never a broken page.
 */
export function MermaidDiagram({ chart }: { chart: string }) {
  const [state, setState] = React.useState<
    | { status: "rendering" }
    | { status: "ready"; svg: string }
    | { status: "error"; message: string }
  >({ status: "rendering" });

  React.useEffect(() => {
    let stale = false;
    setState({ status: "rendering" });
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
        });
        const { svg } = await mermaid.render(`mermaid-${mermaidSeq++}`, chart);
        if (!stale) setState({ status: "ready", svg });
      } catch (err) {
        if (!stale)
          setState({ status: "error", message: (err as Error).message ?? String(err) });
      }
    })();
    return () => {
      stale = true;
    };
  }, [chart]);

  switch (state.status) {
    case "rendering":
      return (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderIcon className="size-4 animate-spin" /> Rendering diagram…
        </p>
      );
    case "error":
      return (
        <div>
          <p className="text-sm text-destructive">
            Couldn’t render mermaid diagram: {state.message}
          </p>
          <pre>
            <code>{chart}</code>
          </pre>
        </div>
      );
    case "ready":
      return (
        <div
          className="not-prose my-4 flex justify-center overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: state.svg }}
        />
      );
  }
}
