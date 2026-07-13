# Project Proposal: Explore

*A collaborative knowledge-exploration application, where an LLM builds interactive explanations of your information — instead of just talking about it.*

## Problem

People frequently need to absorb a large bundle of information quickly, and increasingly they enlist an LLM to help. But today the application holding the information and the LLM conversation are detached. The result is one of two failure modes:

1. **Copy-paste overhead** — the user shuttles content back and forth between the source material and the chat.
2. **Reduced bandwidth** — the LLM works from the user's *description* of the information rather than the information itself, so the quality of help degrades.

### Motivating examples

- **Code review of a PR** — understanding a large diff, its context, and its implications.
- **Joining a team** — being handed a pile of docs, wikis, and design history to read.
- **Investigating a SEV** — catching up on in-progress incident data: logs, timelines, dashboards, chat threads.
- **Studying** — preparing for an exam or interview from a body of material.

## Proposed Solution

1. **Gather** all the information in one place.
2. **Let an LLM explore it** directly — no copy-paste intermediary.
3. **The LLM creates a custom application** to explain the material to you.
4. **The application is dynamic and interactive** — a purpose-built exploration tool, not just a TLDR document.

LLMs like Claude already approximate this with Artifacts. This project builds a dedicated application around the workflow, combining:

- **Knowledge "Wiki"** — the gathered information bundle
- **Artifact hosting** — where generated explanation apps live and run
- **Intelligence** — the LLM that explores and explains
- **Realtime collaborative exploration** — user and LLM working in the same space
- **Multi-modal feedback** — richer channels than text for steering the explanation
- **Progressive refinement** — the explanation app improves through iteration

## Design Principles

### Constrained generation

The LLM's artifact output becomes more reliable when it is constrained. Rather than letting it invent anything out of arbitrary HTML — with varying results — we give it a **vocabulary for building an exploration app**: a set of pre-created components it composes, instead of a blank page it improvises on.

### Balance power with discipline

Raw HTML generation is powerful but inconsistent; pre-created components are disciplined but limiting. The artifact system balances the two: the component vocabulary is the default path, with raw generation available where the vocabulary falls short. Where the vocabulary proves insufficient in practice, that's a signal to grow the vocabulary.

### The author is the learner

The application is part authoring, part exploration/learning — and these are the same person. The author is the intended learner. When the generated application doesn't help the author learn, they don't file a bug — they ask the LLM to **refine or re-do** it. This tight loop is what makes progressive refinement work: the person best positioned to judge the explanation is the one steering it.

### Structural components are named editing points

The only reason to use a specialized component instead of raw HTML is when it offers an advantage over raw HTML being rendered. For structural components, that advantage is precisely one thing: they provide a **boundary that contains content and can be edited independently** — a named point in the page that the LLM (or a collaborator) can revise without touching anything else. There is nothing special about, say, the Comparison component: it's just a side-by-side display hosting children we can independently edit.

So the principle: **OpenUI structural components are just named editing points, and don't need any special behaviors or styling.** They stay unstyled and behavior-free by default; appearance belongs to the content (raw HTML + artifact stylesheets). A component earns extra behavior only when structure alone can't provide it (e.g. a Gallery's selection state, a context gate).

### OpenUI as the artifact medium (experiment)

[OpenUI](https://www.openui.com/) — the open standard for generative UI — is a promising way to serve the artifact HTML and, more importantly, to make it **quickly and easily editable** compared to raw HTML edits. Its component library is exactly the "vocabulary contract" described above, and its line-oriented format suits incremental LLM edits. In this sense the project is also **an experiment in defining an HTML-editing protocol**: how should an LLM efficiently and reliably revise a live UI in response to feedback?

## Multi-Modal Interfaces

The feedback channel between author and LLM should be higher-bandwidth than typed text. Planned modes:

- **Draw on the interface** — sketch, circle, and annotate directly on the rendered artifact to show the LLM what you mean instead of describing it.
- **Voice agent** — speak with an agent about either *the content* (the material being learned) or *the application* (how the explanation app should change). The same channel serves learning and authoring.
- **Design-conversation memory** — use the LLM's memory, or enhance it with a dedicated component, so the authoring tools carry a history of the design conversation: what was tried, what the author asked for, what worked. Refinement builds on that record instead of restarting from scratch.
- **Text chat** — always available as the fallback mode.

## Approach: Don't Reinvent the Wheel

Reuse existing infrastructure for the commodity parts:

| Component | Implementation |
|---|---|
| Knowledge Wiki | A regular file directory |
| Artifact hosting | A web application |
| Intelligence | Already-installed Claude Code |

Focus the novel work on two things:

1. **Better artifact generation through guidance** — steering the LLM to produce genuinely useful interactive explanations, not generic summaries.
2. **Better collaboration mechanisms** — giving feedback that yields a better explanation app, with higher bandwidth than plain text.

## Phases

1. **Artifact creation via tool use** — a simple application that lets an LLM create an artifact through tool use.
2. **Feedback chat** — a simple chat for giving feedback to the LLM so it can update the artifact.
3. **Multimodal operations** — richer interaction modes to facilitate the feedback conversation.
4. **Interactive data exploration** — interactive elements within the artifacts themselves.
5. **Look and feel** — test and improve the application's polish and usability.
6. **Wiki ingestion** *(stretch)* — improve the ability to ingest information into the wiki.

See [TASKS.md](../../TASKS.md) for the phase-by-phase task breakdown.
