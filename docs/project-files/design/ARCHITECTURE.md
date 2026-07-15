# Architecture

The interactive map below is the primary view of the system; the ASCII diagram under Overview is kept as historical reference.

```oui
root = Stack([styles, header, tabs], "stack")

styles = Content("<style>.stack{--bg:#f7f8fa;--panel:#fff;--ink:#1d2430;--muted:#5c6675;--faint:#8b95a5;--line:#e2e6ec;--accent:#3b6ef0;--accent-soft:#eaf0fe;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--ink);background:var(--bg);}.stack h2{margin:0 0 4px;font-size:18px;letter-spacing:-.01em;}.stack h3{margin:0 0 6px;font-size:14px;}.stack p{margin:0 0 8px;font-size:13px;line-height:1.5;color:var(--muted);}.stack .head{padding:14px 16px 6px;}.stack .eyebrow{font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);}.tabs-nav{display:flex;gap:2px;padding:0 16px;border-bottom:1px solid var(--line);}.tabs-trigger{border:0;background:transparent;font:inherit;font-size:13px;padding:8px 12px;color:var(--faint);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;}.tabs-trigger.active{color:var(--ink);font-weight:700;border-bottom-color:var(--accent);}.tabs-panel{padding:14px 16px;}.stack .node{fill:var(--panel);stroke:var(--line);stroke-width:1.5;}.stack .node-web{fill:#fbfcfe;stroke:#d3dbe8;}.stack .nlabel{font:600 12px ui-sans-serif,system-ui;fill:var(--ink);}.stack .nsub{font:11px ui-sans-serif,system-ui;fill:var(--faint);}.stack .flow{stroke:var(--faint);stroke-width:1.5;fill:none;marker-end:url(#arw);}.stack .flow-rw{stroke:#4a9d6b;marker-end:url(#arw-rw);}.stack .flow-tool{stroke:var(--accent);marker-end:url(#arw-tool);}.stack .flab{font:10px ui-sans-serif,system-ui;fill:var(--muted);}.stack .legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:11px;color:var(--muted);}.stack .legend span{display:inline-flex;align-items:center;gap:6px;}.stack .swatch{width:18px;height:0;border-top:2px solid;}.gallery{display:grid;grid-template-columns:190px 1fr;gap:0;}.gallery-nav{border-right:1px solid var(--line);padding:6px;}.gallery-nav-item{display:block;width:100%;text-align:left;border:0;background:transparent;font:inherit;font-size:13px;padding:7px 9px;border-radius:7px;color:var(--muted);cursor:pointer;}.gallery-nav-item.active{background:var(--accent-soft);color:var(--ink);font-weight:600;}.gallery-detail{padding:6px 14px;}.stack .tag{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:20px;background:var(--accent-soft);color:var(--accent);margin-bottom:8px;}</style>")

header = Content("<div class='head'><div class='eyebrow'>System Map</div><h2>Explore Architecture</h2><p>Web app (Artifact View + Chat Pane) &rarr; Session Bridge &rarr; Claude Code, reading the Wiki and writing Artifacts.</p></div>")

tabs = Tabs([{label: "Map", content: [map, legend]}, {label: "Components & Flows", content: [howto, details, flows, designNotes]}], "artifact/tabs/arch")

howto = Content("<h3>How to read this diagram</h3><p>The stack runs top to bottom. The <b>Web Application</b> is what the user touches; below it the <b>Session Bridge</b> is the server that connects the browser to the model; below that <b>Claude Code</b> is the intelligence, which <b>reads</b> the Wiki and <b>writes</b> Artifacts. Pick a component on the left to see its purpose and what you experience there. Arrow colors match the legend: gray for user interactions and chat, blue for prompts and tool calls, green for reads and writes.</p>")

flows = Content("<h3>The flows</h3><p><b>Interactions &amp; multimodal feedback (gray, up):</b> clicks, text selections, drawings, and screenshots from the Artifact View travel to the bridge. <i>Example:</i> you circle a confusing chart and the model gets both your note and the region you marked. <b>Artifact updates (gray, down):</b> when files change on disk the bridge pushes the new render back into the view, so the page reloads live.</p><p><b>Chat / messages (gray):</b> everything you type or say in the Chat Pane streams to the bridge and replies stream back. <i>Example:</i> \"make the legend bigger\" arrives as a message and the reply streams in as it is written.</p><p><b>Prompts &amp; tool calls (blue):</b> the bridge hands the model prompts plus a tool catalog; the model answers with tool calls. <i>Example:</i> the model calls a write-artifact tool to update the .oui block. <b>Reads / writes (green):</b> tool calls fan out to storage &mdash; <i>reads</i> pull wiki pages for grounding, <i>writes</i> save generated artifact files.</p>")

designNotes = Content("<h3>Design notes</h3><p><b>Reliability:</b> storage, hosting, and intelligence are commodity pieces reused as-is; the novelty budget is spent on generation guidance and the collaboration loop, so fewer moving parts can fail.</p><p><b>Constrained generation:</b> the model builds artifacts from a small component vocabulary rather than free-form code, which keeps output renderable, consistent, and safe to hot-reload.</p><p><b>State store:</b> a shared hierarchical key-value store drives interactive selection (tabs, galleries). The same keys the UI reads can be steered programmatically, so the artifact's interactive surface is self-documenting.</p><p><b>Progressive refinement:</b> edits are small, name-matched patches merged into the live artifact, so refinement feels conversational and never disturbs the reader's place.</p>")

map = Content("<svg viewBox='0 0 560 440' width='100%' role='img' aria-label='Architecture diagram'><defs><marker id='arw' markerWidth='8' markerHeight='8' refX='6' refY='3' orient='auto'><path d='M0,0 L6,3 L0,6 Z' fill='#8b95a5'/></marker><marker id='arw-rw' markerWidth='8' markerHeight='8' refX='6' refY='3' orient='auto'><path d='M0,0 L6,3 L0,6 Z' fill='#4a9d6b'/></marker><marker id='arw-tool' markerWidth='8' markerHeight='8' refX='6' refY='3' orient='auto'><path d='M0,0 L6,3 L0,6 Z' fill='#3b6ef0'/></marker></defs><rect class='node node-web' x='20' y='16' width='520' height='120' rx='10'/><text class='nsub' x='34' y='34'>Web Application</text><rect class='node' x='38' y='44' width='230' height='78' rx='8'/><text class='nlabel' x='54' y='74'>Artifact View</text><text class='nsub' x='54' y='92'>rendered explanation app</text><rect class='node' x='292' y='44' width='230' height='78' rx='8'/><text class='nlabel' x='308' y='74'>Chat Pane</text><text class='nsub' x='308' y='92'>feedback to the LLM</text><rect class='node' x='90' y='190' width='380' height='58' rx='8'/><text class='nlabel' x='106' y='214'>Session Bridge (server)</text><text class='nsub' x='106' y='232'>routes chat &amp; feedback, watches artifacts, serves wiki</text><rect class='node' x='190' y='296' width='180' height='52' rx='8'/><text class='nlabel' x='206' y='320'>Claude Code</text><text class='nsub' x='206' y='337'>intelligence</text><rect class='node' x='60' y='388' width='190' height='44' rx='8'/><text class='nlabel' x='76' y='414'>Wiki</text><rect class='node' x='310' y='388' width='190' height='44' rx='8'/><text class='nlabel' x='326' y='414'>Artifacts</text><path class='flow' d='M150,122 L150,190'/><text class='flab' x='156' y='160'>interactions</text><path class='flow' d='M120,190 L120,132'/><text class='flab' x='30' y='160'>updates</text><path class='flow' d='M400,122 L360,190'/><text class='flab' x='406' y='160'>messages</text><path class='flow-tool' d='M280,248 L280,296'/><text class='flab' x='286' y='276'>prompts / tools</text><path class='flow-tool' d='M330,296 L330,248'/><text class='flab' x='336' y='276'>tool calls</text><path class='flow-rw' d='M230,348 L150,388'/><text class='flab' x='150' y='372'>reads</text><path class='flow-rw' d='M330,348 L410,388'/><text class='flab' x='360' y='372'>writes</text></svg>")

legend = Content("<div class='legend'><span><i class='swatch' style='border-color:#8b95a5'></i>interactions / chat &amp; feedback</span><span><i class='swatch' style='border-color:#3b6ef0'></i>prompts &amp; tool calls</span><span><i class='swatch' style='border-color:#4a9d6b'></i>reads / writes</span></div>")

details = Gallery("artifact/gallery/arch", [
  {label: "Web Application", title: "Web Application", content: [dWeb]},
  {label: "Artifact View", title: "Artifact View", content: [dArtifactView]},
  {label: "Chat Pane", title: "Chat Pane", content: [dChat]},
  {label: "Session Bridge", title: "Session Bridge (server)", content: [dBridge]},
  {label: "Claude Code", title: "Claude Code (intelligence)", content: [dClaude]},
  {label: "Wiki", title: "Wiki", content: [dWiki]},
  {label: "Artifacts", title: "Artifacts", content: [dArtifacts]}
])

dWeb = Content("<span class='tag'>Client</span><p><b>Purpose:</b> the two-pane surface the user actually works in &mdash; content on one side, conversation on the other. <b>Responsibilities:</b> hosts the Artifact View and Chat Pane, captures every form of user input, and relays interactions and multimodal feedback down to the Session Bridge. <b>What you experience:</b> a single app where reading, asking, and revising happen side by side, with no page reloads or context switches.</p>")
dArtifactView = Content("<span class='tag'>Client</span><p><b>Purpose:</b> render the interactive explanation the model builds &mdash; presentations, analysis tools, study aids. <b>Responsibilities:</b> displays the live artifact, captures <b>interactions &amp; multimodal feedback</b> (clicks, selections, drawings, screenshots) up to the bridge, and applies <b>artifact updates</b> when files change on disk. <b>What you experience:</b> a working mini-app you can click through, and edits that appear in place moments after you ask.</p>")
dChat = Content("<span class='tag'>Client</span><p><b>Purpose:</b> the conversation channel with the model, by text or voice. <b>Responsibilities:</b> streams your <b>messages and multimodal feedback</b> to the Session Bridge and renders replies as they arrive. <b>What you experience:</b> ask a question and get a grounded answer, or give a revision and watch the artifact change &mdash; discussion and building in one thread.</p>")
dBridge = Content("<span class='tag'>Server</span><p><b>Purpose:</b> the server that wires the browser to the intelligence. <b>Responsibilities:</b> routes chat/feedback &#8646; LLM, watches artifact files for changes, and serves wiki queries; it hands <b>prompts and tools</b> to Claude Code and receives <b>tool calls</b> back. <b>What you experience:</b> nothing directly &mdash; it is the plumbing that makes replies stream and edits reload live.</p>")
dClaude = Content("<span class='tag'>Intelligence</span><p><b>Purpose:</b> the reasoning that turns a request into an answer or an artifact. <b>Responsibilities:</b> interprets prompts, decides what to do, and issues tool calls to <b>read the Wiki</b> for grounding and <b>write Artifacts</b> to disk. <b>What you experience:</b> answers tied to your actual material and artifacts built from it &mdash; not generic filler.</p>")
dWiki = Content("<span class='tag'>Store</span><p><b>Purpose:</b> the source of truth &mdash; your documents and data. <b>Responsibilities:</b> a plain file directory read by Claude Code via tool calls; it is never mutated by the generation flow, so your material stays authoritative. <b>What you experience:</b> a folder of files you own, and answers that cite them.</p>")
dArtifacts = Content("<span class='tag'>Store</span><p><b>Purpose:</b> persist what you build together. <b>Responsibilities:</b> generated app files on disk, written by Claude Code; the bridge watches them and pushes updates to the Artifact View. <b>What you experience:</b> artifacts you can save, reopen, and keep refining &mdash; the work is yours to return to.</p>")
```

How the system described in [proposal.md](proposal.md) fits together. Guiding principle: **don't reinvent the wheel** — reuse commodity infrastructure for storage, hosting, and intelligence, and spend the novelty budget on artifact-generation guidance and collaboration mechanisms.

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Web Application                       │
│                                                              │
│  ┌────────────────────────────┐  ┌───────────────────────┐  │
│  │       Artifact View        │  │      Chat Pane        │  │
│  │  (rendered explanation     │  │  (feedback to the     │  │
│  │   app, interactive)        │  │   LLM, streaming)     │  │
│  └───────┬──────────▲─────────┘  └──────────┬────────────┘  │
│          │          │                       │               │
│  interactions   artifact                 messages,          │
│  & multimodal   updates                  multimodal         │
│  feedback       │                        feedback           │
└──────────┼──────┼───────────────────────────┼───────────────┘
           ▼      │                           ▼
      ┌────────────────────────────────────────────┐
      │            Session Bridge (server)         │
      │  routes chat/feedback ⇄ LLM, watches       │
      │  artifact files, serves wiki queries       │
      └───────┬───────────────────▲────────────────┘
              │ prompts, tools    │ tool calls
              ▼                   │ (write artifact, read wiki)
      ┌────────────────────┐      │
      │    Claude Code     │──────┘
      │   (intelligence)   │
      └───────┬────────────┘
              │ reads                    writes
              ▼                          ▼
      ┌──────────────────┐      ┌──────────────────┐
      │      Wiki        │      │    Artifacts     │
      │  (plain file     │      │  (generated app  │
      │   directory)     │      │   files on disk) │
      └──────────────────┘      └──────────────────┘
```

## Components

### Wiki — the knowledge bundle

A regular file directory. No database, no custom format. A "bundle" is whatever the user gathers: docs, a PR diff, incident logs, study material. The LLM explores it with ordinary file tools; the web app can browse and (later, Phase 6) help ingest into it.

- One directory per exploration topic/session.
- Plain files keep every existing tool usable (grep, git, editors) and make ingestion trivial.
- Files are Markdown by convention for now, but that is not a requirement — the wiki accepts any file type.

#### Wiki API

Storage is just the directory, but the backend service (session bridge) also exposes it via APIs, so that artifacts (Phase 4 runtime API) and other clients don't need filesystem access:

| Endpoint | Behavior |
|---|---|
| **List** | Enumerate files in the wiki (paths + basic metadata) |
| **Read** | Read *lines* from a file — chunked/ranged reads (offset + limit), never forcing a whole-document fetch |
| **Create** | Create a new file with given content |
| **Rename** | Rename/move a file within the wiki |
| **Edit** | Modify a file via **exact search/replace** (`old_string` → `new_string`, with a uniqueness requirement and an optional replace-all flag) |

The edit endpoint deliberately uses the `str_replace` style rather than unified diffs or line-number-based patching — see [decisions.md](decisions.md#d1-wiki-edit-api-format-exact-searchreplace-str_replace) for the research behind that choice. Chunked *reads* may include line numbers for orientation, but *edits* never reference line numbers.

### Intelligence — Claude Code

The already-installed Claude Code is the LLM runtime. The application does not implement its own agent loop; it drives Claude Code as a session and grants it:

- **Read access to the wiki** (its native file tools).
- **An artifact tool** — create/update an artifact. In practice: writing files to the artifacts directory, with guidance on what a good explanation app looks like.

The **generation guidance** (one of the two novel parts) lives here: system-prompt material, artifact patterns/templates, and component conventions that steer output toward genuinely interactive explanations rather than TLDR documents.

### Artifacts — generated explanation apps

Interactive web apps generated by the LLM, stored as files on disk and served by the web application. Dynamic and interactive, not static summaries. In later phases (Phase 4) artifacts get a small **runtime API** so they can query the wiki on demand instead of baking all data in at generation time.

**Constrained generation.** Artifacts are not free-form HTML. The LLM composes them from a **component vocabulary** — pre-created exploration components (the library is the contract for what the LLM can emit). This trades some raw power for reliability; a raw-HTML escape hatch remains for cases the vocabulary doesn't cover, and recurring escape-hatch use is the signal to grow the vocabulary.

**Structural components are named editing points** ([decisions.md D4](decisions.md#d4-structural-components-are-named-editing-points--no-special-behavior-or-styling)): their value is the independently-editable boundary they create, not appearance or behavior. They stay unstyled by default with stable CSS hooks; looks come from content and artifact stylesheets, and behavior is added only where structure can't provide it.

**State via hierarchical key-value store.** All component interactive state is driven from a central hierarchical KV store, declared up front in a per-artifact manifest ([decisions.md D3](decisions.md#d3-component-state-lives-in-a-hierarchical-key-value-store)). Host-driven state changes take the same path as user clicks — this is the hook for Phase 4 interaction signals, LLM steering of the UI, and state-tagged multimodal feedback.

**OpenUI (experimental medium).** Artifacts are expressed in [OpenUI](https://www.openui.com/) — a component library defined as schemas + renderers, generating a system prompt that tells the LLM what it may use, with a token-efficient line-oriented output language rendered progressively. Chosen over raw HTML because it makes artifacts **cheaply and reliably editable**: revising a live UI becomes small edits to a structured representation rather than surgery on an HTML blob. Part of this project is an experiment in what a good **HTML-editing protocol** for LLMs looks like (see [decisions.md D2](decisions.md#d2-artifact-medium-openui-component-vocabulary-experimental)).

### Web application — hosting + collaboration surface

The one piece of durable custom software. Two panes:

- **Artifact view** — renders the current artifact, hot-reloads when the LLM updates it.
- **Chat pane** — the feedback channel to the LLM (Phase 2), extended with multimodal operations (Phase 3).

The **collaboration mechanisms** (the second novel part) live here: turning what the user does — not just what they type — into context the LLM can act on. Planned feedback modes:

- **Drawing/annotation overlay** — draw directly on the rendered artifact (circle, sketch, point-and-comment); the marked-up view goes back to the LLM as image + structured region data.
- **Voice agent** — spoken conversation about the *content* or about the *application*; one channel serves both learning and authoring.
- **Design-conversation memory** — the LLM's memory, possibly enhanced by a dedicated component, holds the history of the design conversation (what was tried, what the author asked for, what worked) so refinement is cumulative across sessions rather than restarting.
- **Text chat** — the always-available fallback.

### Session bridge

The server-side glue between the web app and Claude Code:

- Forwards chat messages and multimodal feedback into the LLM session; streams responses back.
- Watches the artifacts directory and pushes updates to the artifact view.
- Serves wiki queries from artifacts (Phase 4 runtime API).
- Persists session state: conversation history and artifact versions.

## Data flow — the core loop

1. User gathers material into a wiki directory.
2. User opens the web app on that wiki and asks for an explanation.
3. Claude Code explores the wiki and writes an artifact via the artifact tool.
4. The web app renders the artifact.
5. User explores it and gives feedback — chat, pointing at regions, screenshots, interaction signals.
6. Claude Code updates the artifact; the view refreshes. Repeat from 4 (**progressive refinement**).

## Phase → architecture mapping

| Phase | What it adds architecturally |
|---|---|
| 1. Artifact via tool use | Wiki convention, artifact tool, artifact view, minimal bridge |
| 2. Feedback chat | Chat pane, message routing, session persistence |
| 3. Multimodal operations | Feedback capture in artifact view → image/structured content to LLM |
| 4. Interactive exploration | Artifact runtime API to the wiki; interaction signals as LLM context |
| 5. Look and feel | No new components — polish of app shell and generation guidance |
| 6. Wiki ingestion (stretch) | Importers and normalization in front of the wiki directory |

## Open decisions

Deliberately unresolved; record outcomes in `docs/decisions.md` when made.

- **Web stack** for the application shell and session bridge (OpenUI's React runtime constrains this somewhat).
- **Artifact format details** — direction is decided (OpenUI component vocabulary, see decisions.md D2), but the initial vocabulary, on-disk representation, and sandboxing model for escape-hatch raw HTML are open.
- **Driving Claude Code** — Agent SDK vs. CLI (headless/stream-json); how sessions map to explorations.
- **Artifact tool shape** — a dedicated tool definition vs. conventions over plain file writes.
- **Persistence** — how much beyond files-on-disk (likely nothing, initially).
