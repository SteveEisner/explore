import * as React from "react";
import type { OpenUIError } from "@openuidev/react-lang";

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
