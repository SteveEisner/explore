```oui
root = Stack([deckStyle, slides], "deck")

deckStyle = Content("<style>\n.stack.deck { --ink:#1c1c1a; --ink2:#5c5950; --faint:#9d988d; --rule:#e4e1da; --accent:#3d6b70; --soft:#e9f0f0; background:#f6f5f2; padding:20px; font-family:'Helvetica Neue',Helvetica,Arial,system-ui,sans-serif; }\n.stack.deck .tabs-nav { display:flex; border-bottom:1px solid var(--rule); margin-bottom:20px; }\n.stack.deck .tabs-trigger { padding:10px 0; margin-right:30px; font-size:11px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:var(--faint); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; }\n.stack.deck .tabs-trigger:hover { color:var(--ink2); }\n.stack.deck .tabs-trigger.active { color:var(--accent); border-bottom-color:var(--accent); }\n.stack.deck .slide { position:relative; overflow:hidden; background:#fff; border:1px solid var(--rule); padding:48px 52px; min-height:400px; display:flex; flex-direction:column; }\n.stack.deck .eyebrow { font-size:11px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color:var(--accent); margin-bottom:16px; position:relative; }\n.stack.deck h2 { margin:0 0 12px; font-size:32px; line-height:1.18; letter-spacing:-.02em; color:var(--ink); font-weight:650; position:relative; }\n.stack.deck .lede { font-size:17px; line-height:1.55; color:var(--ink2); margin:0; max-width:54ch; position:relative; }\n.stack.deck .foot { margin-top:auto; padding-top:24px; font-size:12px; color:var(--faint); position:relative; }\n.stack.deck .cover h2 { font-size:54px; letter-spacing:-.035em; margin-bottom:18px; }\n.stack.deck .cover .lede { font-size:19px; }\n.stack.deck .shapes { position:absolute; inset:0; pointer-events:none; }\n.stack.deck .shapes i { position:absolute; display:block; border-radius:16px; background:var(--soft); }\n.stack.deck .cols { display:grid; grid-template-columns:1fr 1fr; gap:44px; margin-top:26px; }\n.stack.deck .ph { font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); margin-bottom:14px; }\n.stack.deck .box { border:1px solid var(--rule); border-radius:10px; padding:14px 16px; font-size:14px; color:var(--ink); background:#fcfcfb; text-align:center; }\n.stack.deck .shuttle { display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 0; color:var(--faint); font-size:12px; }\n.stack.deck .shuttle svg { width:34px; height:14px; }\n.stack.deck .onebox { border:2px solid var(--accent); border-radius:12px; background:var(--soft); padding:14px; display:flex; flex-direction:column; gap:8px; }\n.stack.deck .chip { background:#fff; border-radius:7px; padding:11px 14px; font-size:14px; color:var(--ink); text-align:center; }\n.stack.deck .chip.on { background:var(--accent); color:#fff; font-weight:600; }\n.stack.deck .cap { font-size:13px; color:var(--ink2); margin-top:12px; line-height:1.5; }\n.stack.deck .check { list-style:none; margin:24px 0 0; padding:0; }\n.stack.deck .check li { display:flex; align-items:flex-start; gap:12px; padding:11px 0; border-bottom:1px solid var(--rule); font-size:16px; color:var(--ink); }\n.stack.deck .check li:last-child { border-bottom:0; }\n.stack.deck .check svg { flex:none; width:20px; height:20px; margin-top:1px; padding:3px; border-radius:50%; background:var(--soft); color:var(--accent); }\n.stack.deck .road { position:relative; margin:34px 0 6px; }\n.stack.deck .road-line { position:absolute; top:8px; left:6%; right:6%; height:2px; background:var(--rule); }\n.stack.deck .ms-row { display:flex; position:relative; }\n.stack.deck .ms { flex:1; text-align:center; }\n.stack.deck .dot { display:block; width:18px; height:18px; border-radius:50%; background:#fff; border:2px solid var(--accent); margin:0 auto 12px; }\n.stack.deck .ms.later .dot { border-color:var(--faint); }\n.stack.deck .ms.stretch .dot { border-style:dashed; border-color:var(--faint); }\n.stack.deck .n { font-size:11px; font-weight:700; letter-spacing:.08em; color:var(--accent); }\n.stack.deck .ms.later .n, .stack.deck .ms.stretch .n { color:var(--faint); }\n.stack.deck .l { display:block; font-size:13px; color:var(--ink2); margin-top:4px; line-height:1.35; }\n</style>")

slides = Tabs([{label: "01 · Explore", content: [s1]}, {label: "02 · The idea", content: [s2]}, {label: "03 · How we build it", content: [s3]}, {label: "04 · The plan", content: [s4]}], "proposal/slide", "deck-tabs")

s1 = Content("<div class='slide cover'><div class='shapes'><i style='width:190px;height:190px;top:-40px;right:40px;opacity:.55'></i><i style='width:120px;height:120px;top:120px;right:-30px;opacity:.4'></i><i style='width:90px;height:90px;bottom:20px;right:150px;opacity:.3'></i></div><div class='eyebrow'>Project proposal</div><h2>Explore</h2><p class='lede'>Hand over your pile of documents. Get back a shareable artifact: an interactive app that explains them, can be refined with feedback, and can help others understand it too.</p><div class='foot'>Four slides · the idea, how we build it, the plan</div></div>")

s2 = Content("<div class='slide'><div class='eyebrow'>The idea</div><h2>Your documents and your chat live in different rooms</h2><p class='lede'>So you end up being the courier between them. Put everything in one place instead.</p><div class='cols'><div><div class='ph'>Today</div><div class='box'>Your documents</div><div class='shuttle'><svg viewBox='0 0 34 14' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round'><path d='M4 4h26M30 4l-4-3M30 4l-4 3'/><path d='M30 10H4M4 10l4-3M4 10l4 3'/></svg><span>copy · paste</span></div><div class='box'>Chat with an AI</div><p class='cap'>You do the shuttling. The AI only ever sees what you thought to paste — not the real thing.</p></div><div><div class='ph'>Instead</div><div class='onebox'><div class='chip'>Your documents</div><div class='chip'>The AI, reading them directly</div><div class='chip on'>An app that explains them</div></div><p class='cap'>One shared space. Nothing to copy, nothing lost in the retelling — and the explanation is something you can click through, not just read.</p></div></div></div>")

s3 = Content("<div class='slide'><div class='eyebrow'>How we build it</div><h2>A demo playbook, not a manifesto</h2><ul class='check'><li><svg viewBox='0 0 16 16' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 8.5 6.5 12 13 4.5'/></svg><span>Timebox the build and pick a small set of prioritized outcomes for the session.</span></li><li><svg viewBox='0 0 16 16' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 8.5 6.5 12 13 4.5'/></svg><span>Use constrained generation: give the AI building blocks, not a blank page.</span></li><li><svg viewBox='0 0 16 16' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 8.5 6.5 12 13 4.5'/></svg><span>Use blocks mainly for layout and structure; for everything else, use plain HTML and CSS that agents are good at.</span></li><li><svg viewBox='0 0 16 16' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 8.5 6.5 12 13 4.5'/></svg><span>Let the learner steer with quick feedback; rebuild when it misses.</span></li><li><svg viewBox='0 0 16 16' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 8.5 6.5 12 13 4.5'/></svg><span>Optimize for speed: keep the UI in small independently editable parts so updates are quick and interactive, not slow full rebuilds.</span></li></ul></div>")

s4 = Content("<div class='slide'><div class='eyebrow'>The plan</div><h2>Hit the big beats, improvise between them</h2><p class='lede'>Start by building the wiki and a basic app. Add chat for feedback. Add multimodal controls like drawing and voice. Then tighten: make it fast, let people click into data, and polish the experience. Leave room to adapt between those milestones.</p><div class='road'><div class='road-line'></div><div class='ms-row'><div class='ms'><span class='dot'></span><span class='n'>01</span><span class='l'>Build the wiki<br>and app</span></div><div class='ms'><span class='dot'></span><span class='n'>02</span><span class='l'>Add chat</span></div><div class='ms'><span class='dot'></span><span class='n'>03</span><span class='l'>Draw &amp; speak</span></div><div class='ms later'><span class='dot'></span><span class='n'>04</span><span class='l'>Click into data</span></div><div class='ms later'><span class='dot'></span><span class='n'>05</span><span class='l'>Make it fast<br>and feel good</span></div><div class='ms stretch'><span class='dot'></span><span class='n'>06</span><span class='l'>Future ideas</span></div></div></div></div>")
```

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
