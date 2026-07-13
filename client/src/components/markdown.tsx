import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { MarkdownCode, MermaidDiagram } from "@/components/markdown-code";
import { InlineArtifact, OuiEmbed } from "@/components/oui-embed";
import { rehypeSourceLines } from "@/lib/source-lines";
import { cn } from "@/lib/utils";
// The typeset code-block surface is dark in both themes (see index.css
// `.typeset pre`), so use the dark scale.
import "highlight.js/styles/github-dark.css";

/**
 * GitHub's default sanitize schema, plus the fenced-code language class so
 * syntax highlighting and mermaid detection survive sanitization, plus the
 * <oui-embed> tag (raw HTML in wiki pages) that mounts an OpenUI app.
 */
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "oui-embed"],
  attributes: {
    ...defaultSchema.attributes,
    // data-source-line stamps (rehypeSourceLines) survive on any element so
    // scroll/selection state can be mapped back to markdown source lines.
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "dataSourceLine"],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-./],
    ],
    "oui-embed": ["src"],
  },
};

/**
 * GitHub-flavored markdown styled with shadcn/typeset; invert for colored
 * surfaces like the primary user bubble. Pipeline: GFM → sanitize → heading
 * slugs (slugs run after sanitize so the generated ids aren't stripped or
 * clobber-prefixed). Fenced code blocks get highlight.js coloring;
 * ```mermaid blocks render as diagrams.
 */
export function Markdown({
  text,
  invert,
  typeset,
  className,
  sourceUrl,
  onLinkClick,
}: {
  text: string;
  /**
   * Recolor for a non-surface background (e.g. the primary user bubble):
   * typeset derives all its colors from currentColor instead of the theme
   * tokens, so the content follows the bubble's text color.
   */
  invert?: boolean;
  /**
   * Use the document-reading rhythm (.typeset-docs) instead of the compact
   * chat preset (.typeset-chat) used in chat and other tight surfaces.
   */
  typeset?: boolean;
  className?: string;
  /**
   * The wiki URL this markdown was loaded from. When set, ```oui fences
   * render as inline artifacts (decisions.md D8) addressed by {sourceUrl,
   * fence line}; without it (chat messages) they stay plain code blocks.
   */
  sourceUrl?: string;
  /**
   * Intercept link clicks (e.g. to load the target into the main panel
   * instead of navigating). Call preventDefault() to stop the browser.
   */
  onLinkClick?: (href: string, event: React.MouseEvent) => void;
}) {
  return (
    <div
      className={cn(
        "typeset break-words",
        typeset ? "typeset-docs" : "typeset-chat",
        invert && "typeset-invert",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeRaw,
          rehypeSourceLines,
          [rehypeSanitize, sanitizeSchema],
          rehypeSlug,
        ]}
        components={
          {
            code: MarkdownCode,
            pre: (props: React.ComponentProps<"pre">) => (
              <MarkdownPre {...props} sourceUrl={sourceUrl} />
            ),
            // Custom tag: mounts an OpenUI app from a wiki .oui file.
            "oui-embed": OuiEmbed,
            // `<oui-embed ...></oui-embed>` on one line is inline HTML to
            // the markdown parser (an HTML *block* is a single tag alone on
            // a line), so it lands inside a paragraph; drop that wrapper —
            // the embed renders divs, which can't nest in <p>.
            p: ({ node, children, ...props }: React.ComponentProps<"p"> & {
              node?: { children?: { type: string; tagName?: string }[] };
            }) => {
              const hasEmbed = node?.children?.some(
                (c) => c.type === "element" && c.tagName === "oui-embed"
              );
              if (hasEmbed) return <>{children}</>;
              return <p {...props}>{children}</p>;
            },
            ...(onLinkClick && {
              a: ({
                href,
                children,
                ...props
              }: React.ComponentProps<"a">) => (
                <a
                  href={href}
                  {...props}
                  onClick={(e) => href && onLinkClick(href, e)}
                >
                  {children}
                </a>
              ),
            }),
            // Components is keyed by intrinsic tags; the custom-element key
            // is outside that type but fully supported at runtime.
          } as Components
        }
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Block-code wrapper: a ```mermaid fence renders as a diagram instead of a
 * <pre> box, and — on wiki pages (sourceUrl set) — a ```oui fence renders as
 * an inline artifact (decisions.md D8), addressed for maximize by the
 * fence's data-source-line stamp.
 */
function MarkdownPre({
  children,
  sourceUrl,
  ...props
}: React.ComponentProps<"pre"> & { sourceUrl?: string }) {
  const child = React.isValidElement(children)
    ? (children as React.ReactElement<{
        className?: string;
        children?: React.ReactNode;
        "data-source-line"?: number | string;
      }>)
    : null;
  const languages = child?.props.className?.split(" ") ?? [];
  if (languages.includes("language-mermaid")) {
    return <MermaidDiagram chart={reactNodeText(child!.props.children)} />;
  }
  if (languages.includes("language-oui") && sourceUrl) {
    const stamped =
      child!.props["data-source-line"] ??
      (props as Record<string, unknown>)["data-source-line"];
    return (
      <InlineArtifact
        program={reactNodeText(child!.props.children)}
        docUrl={sourceUrl}
        line={Number(stamped) || 1}
      />
    );
  }
  return <pre {...props}>{children}</pre>;
}

/** Concatenated text content of a react-markdown code element's children. */
function reactNodeText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(reactNodeText).join("");
  return "";
}
