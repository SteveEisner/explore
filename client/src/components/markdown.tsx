import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/** GitHub-flavored markdown with prose styling; invert for dark surfaces. */
export function Markdown({
  text,
  invert,
  className,
}: {
  text: string;
  invert?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none break-words",
        invert && "prose-invert",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
