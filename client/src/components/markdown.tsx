import type * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { rehypeSourceLines } from "@/lib/source-lines";
import { cn } from "@/lib/utils";

/** GitHub-flavored markdown with prose styling; invert for dark surfaces. */
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
        rehypePlugins={[rehypeSourceLines]}
        components={
          onLinkClick && {
            a: ({ href, children, ...props }) => (
              <a
                href={href}
                {...props}
                onClick={(e) => href && onLinkClick(href, e)}
              >
                {children}
              </a>
            ),
          }
        }
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
