import { Button } from "@/components/ui/button";

/** Floating bar over the main panel; "Test" kicks off the LLM chat. */
export function TopBar({
  onTest,
  disabled,
}: {
  onTest: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="absolute inset-x-0 top-4 z-10 flex justify-center">
      <div className="flex items-center gap-2 rounded-lg border bg-background/80 px-3 py-2 shadow-md backdrop-blur">
        <Button size="sm" onClick={onTest} disabled={disabled}>
          Test
        </Button>
      </div>
    </div>
  );
}
