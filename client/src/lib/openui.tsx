import { createLibrary, defineComponent, Renderer } from "@openuidev/react-lang";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

/**
 * OpenUI (openui.com) generative-UI library: the set of components the LLM
 * is allowed to emit as OpenUI Lang, each backed by our shadcn primitives.
 * `openuiLibrary.prompt()` produces the system prompt that teaches the model
 * the language; <GenerativeView> renders streamed model output.
 */

const Text = defineComponent({
  name: "Text",
  description: "A paragraph of body text",
  props: z.object({
    content: z.string().describe("The text to display"),
  }),
  component: ({ props }) => (
    <p className="text-sm leading-relaxed">{props.content}</p>
  ),
});

const Tag = defineComponent({
  name: "Tag",
  description: "A small status badge",
  props: z.object({
    label: z.string().describe("Badge text"),
    tone: z
      .enum(["default", "secondary", "destructive", "outline"])
      .optional()
      .describe("Visual tone"),
  }),
  component: ({ props }) => (
    <Badge variant={props.tone ?? "secondary"}>{props.label}</Badge>
  ),
});

const Action = defineComponent({
  name: "Action",
  description: "A button the user can press",
  props: z.object({
    label: z.string().describe("Button text"),
    actionId: z.string().describe("Identifier reported when pressed"),
  }),
  component: ({ props }) => <Button size="sm">{props.label}</Button>,
});

const Panel = defineComponent({
  name: "Panel",
  description: "A titled content panel containing other components",
  props: z.object({
    title: z.string().describe("Panel heading"),
    children: z
      .array(z.union([Text.ref, Tag.ref, Action.ref]))
      .optional()
      .describe("Panel body content"),
  }),
  component: ({ props, renderNode }) => (
    <section className="rounded-lg border bg-card p-6 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold">{props.title}</h2>
      <Separator className="mb-4" />
      <div className="flex flex-col gap-3 text-sm text-card-foreground">
        {props.children?.map((child, i) => (
          <div key={i}>{renderNode(child)}</div>
        ))}
      </div>
    </section>
  ),
});

export const openuiLibrary = createLibrary({
  components: [Panel, Text, Tag, Action],
});

export function GenerativeView({
  response,
  isStreaming = false,
}: {
  response: string | null;
  isStreaming?: boolean;
}) {
  return (
    <Renderer
      response={response}
      library={openuiLibrary}
      isStreaming={isStreaming}
    />
  );
}
