# Application Architecture — One Pager

This application is a collaboration surface over a plain-file knowledge base, with an LLM-driven artifact system for building interactive explanations.
At the center is the wiki, a regular directory of files that acts as the source of truth. The backend exposes it through simple list, read, create, rename, and exact search-and-replace edit operations, using chunked reads so large documents don’t have to be fetched all at once. The system avoids special storage formats so existing tools like git and editors remain usable.

## Intelligence and Artifact Generation

Intelligence is provided by a hosted LLM runtime that is granted read access to the wiki and a constrained artifact-writing capability. The novelty is in the guidance and conventions that steer generation toward reliable, editable interactive apps rather than static summaries. Artifacts are built from a component vocabulary with a raw-HTML escape hatch when needed.

Artifacts are served by the web application and rendered in an artifact view that hot-reloads as they change. Interactive state is handled through a hierarchical key-value store declared per artifact, which supports both user-driven interactions and host-driven state changes for future runtime steering.

## Application Surfaces and Chat

The web application has two primary surfaces: the artifact view and a chat pane. Chat is the feedback channel to the LLM and is planned to expand with multimodal feedback such as drawing/annotation overlays, voice interaction, and structured interaction signals. A design-conversation memory concept is intended to make refinement cumulative across sessions.

```
[User]
  |  interacts
  v
[Web App]
  |\
  | \ renders artifacts + UI
  |  \ handles chat
  |   \
  v    v
[Artifact Runtime]   [Chat UI]
  |                     |
  | state + events      | feedback
  v                     v
[Session Bridge] <-- routes --> [LLM Runtime]
  |
  | read/write
  v
[Wiki Files]
```

The session bridge is the server-side glue. It routes chat and multimodal feedback to the LLM, streams responses back, watches artifact files and pushes updates to the UI, serves wiki queries for artifact runtime needs, and persists session history and artifact versions.

The core loop is progressive refinement: the user curates material in the wiki, the LLM generates an artifact, the user interacts and provides feedback, and the artifact is updated repeatedly. Most open questions are implementation choices, not architecture: web stack selection, artifact vocabulary details and sandboxing, how to drive the LLM runtime, and how much persistence to add beyond files on disk.
