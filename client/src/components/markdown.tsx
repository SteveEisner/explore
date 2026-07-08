import * as React from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { MarkdownCode, MermaidDiagram } from "@/components/markdown-code";
import { rehypeSourceLines } from "@/lib/source-lines";
import { cn } from "@/lib/utils";
// The prose code-block surface is dark in both themes, so use the dark scale.
import "highlight.js/styles/github-dark.css";

/**
 * GitHub's default sanitize schema, plus the fenced-code language class so
 * syntax highlighting and mermaid detection survive sanitization.
 */
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // data-source-line stamps (rehypeSourceLines) survive on any element so
    // scroll/selection state can be mapped back to markdown source lines.
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "dataSourceLine"],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-./],
    ],
  },
};

/**
 * GitHub-flavored markdown with prose styling; invert for dark surfaces.
 * Pipeline: GFM → sanitize → heading slugs (slugs run after sanitize so the
 * generated ids aren't stripped or clobber-prefixed). Fenced code blocks get
 * highlight.js coloring; ```mermaid blocks render as diagrams.
 */
export function Markdown({
  text,
  invert,
  className,
  onLinkClick,
}: {
  text: string;
  invert?: boolean;
  className?: string;
  /**
   * Intercept link clicks (e.g. to load the target into the main panel
   * instead of navigating). Call preventDefault() to stop the browser.
   */
  onLinkClick?: (href: string, event: React.MouseEvent) => void;
}) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none break-words",
        invert && "prose-invert",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeSourceLines,
          [rehypeSanitize, sanitizeSchema],
          rehypeSlug,
        ]}
        components={{
          code: MarkdownCode,
          pre: MarkdownPre,
          ...(onLinkClick && {
            a: ({ href, children, ...props }) => (
              <a
                href={href}
                {...props}
                onClick={(e) => href && onLinkClick(href, e)}
              >
                {children}
              </a>
            ),
          }),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Block-code wrapper: a ```mermaid fence renders as a diagram instead of a
 * <pre> box, so the prose code-block chrome doesn't frame the SVG.
 */
function MarkdownPre({ children, ...props }: React.ComponentProps<"pre">) {
  const child = React.isValidElement(children)
    ? (children as React.ReactElement<{ className?: string; children?: React.ReactNode }>)
    : null;
  if (child?.props.className?.split(" ").includes("language-mermaid")) {
    return <MermaidDiagram chart={reactNodeText(child.props.children)} />;
  }
  return <pre {...props}>{children}</pre>;
}

/** Concatenated text content of a react-markdown code element's children. */
function reactNodeText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(reactNodeText).join("");
  return "";
}
