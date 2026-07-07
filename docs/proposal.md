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

See [tasks.md](tasks.md) for the phase-by-phase task breakdown.
