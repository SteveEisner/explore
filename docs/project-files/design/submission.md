# Submission

## Design rationale
I set out to build a more capable collaborative wiki and a novel way to work with data: a hands-off, talk-your-way-through-it surface. You can ask it to search, extract, reshape information, or apply edits, and it responds in place. I had a few concrete uses in mind:
- A code-review explainer that makes a complex change understandable.
- A partner that helps you come up to speed during a sev by digesting a stream or packet of information.
- A study mode where the system can quiz you and help you form connections rather than just explain.
The goal was an intelligent, inherently multimodal surface where you describe what you need, and the system helps you get there.

I started from a wiki-first mindset, inspired by tools like Obsidian. A wiki is a solid base for collecting a lot of material, keeping it organized, and revisiting it over time as you edit and refine what you know.

Initially, I aimed to extend the traditional wiki in two ways. First, by adding a more Socratic study method that can question, quiz, and help connect ideas. Second, by synthesizing information into higher-level artifacts that can be shared and iterated on.

Over time, it became clear that while wikis are popular, a new sharing pattern was emerging: simply writing HTML as the container. That shift opened up more flexibility for how information can be packaged and shared.

I knew there were already plenty of tools, and that much of this capability will eventually live directly inside Claude as it extends its capabilities to work with apps. I didn’t want to rebuild what’s already fairly frictionless there. Instead, I focused on what’s still hard: multimodal, full-duplex collaboration and hands-on workflows that feel conversational, incremental, and grounded in the user’s own material. It’s coming, but not fully here yet, so I explored patterns of use. The generated thing isn't a block of text; it's a working, grounded app embedded in your own material.

## Design Decisions and Tradeoffs
From the start, I had to make a choice about what to build. I knew I could get something working in two hours, but I enjoy building things enough that I would naturally fill the full eight. That time is a tradeoff: if I’m going to spend it, it has to be worth it. So I chose to build something worthy of eight hours — a reusable artifact studio that could last longer than a quick demo and be genuinely useful.

The novelty I wanted to show was multimodal, full-duplex communication as the main way of working. This isn’t a traditional wiki editor; it’s a collaboration surface where chat, voice, and other inputs can flow together while artifacts are created and refined in place. The tradeoff is that these methods of communication are not well established, and depend heavily on the interpretation of frontier models. There are not many backups if something doesn’t work.

Along the way, I de-prioritized “wikiness” once the basics were good enough. I didn’t need a richer wiki; I needed deeper artifact capability and better support for the front-end agent to build, refine, and answer questions about those artifacts. The artifacts became the primary product, and the wiki stayed as the supporting source layer.

I aimed for what I call “bring your own intelligence.” Whatever intelligence generated an artifact, the result should still be understandable and manipulable by a person — or another AI — that didn’t build it. The artifact carries enough structure and explanation that a different assistant can reason about it, answer questions, and help extend it. I believe that in the near future, what we today think of as static HTML outputs will be used as custom UIs in the browser built into Claude Cowork and other harnesses, and we will need to design “hook” APIs for that case.

## Technical Decisions and Tradeoffs
I optimized for incremental editing speed. I wanted edits to feel like small, fast moves instead of long round trips to a heavy model. That guided the structure: markdown as the simple carrier, OpenUI as an editable component vocabulary for UI instead of raw HTML, and lightweight, fast paths for voice and front-end edits. The tradeoff is that realtime and fast agents can be temperamental and occasionally do something incredibly dumb, which makes the experience a bit more chaotic, so the system has to absorb that.

In my normal work, every PR gets human code review (for better or worse, it's still policy), changes have to pass security review, and it's slow but secure. A prototype can't work that way, so I follow a principle when developing 'experimental' (but usable) tooling: steady backend, flexible frontend. The backend and its API contracts stay stable and tested, while the frontend can flex and iterate quickly, even 'vibe code'. When a solid platform component already existed, I used it rather than reinvent it, so effort went into the authoring experience and collaboration loop instead of rebuilding foundations. Even so, I made explicit choices to disregard process I would normally keep: I did not review the front end code as carefully as I usually would, and I would not normally host arbitrary HTML in a browser without CSP, or run identity-less APIs.

I reached for components that I knew well, including a React markdown parser and components, plus a Markdown vault with ready-made search capabilities. The end result is a bulky set of dependencies on both back end and front. I was prioritizing re-use ahead of a small delivery size.

I chose an interesting architecture for intelligence. Voice models are not smart enough yet to perform complex content behaviors, so I had to embed an AI in the back end. In a normal project I would use Claude's APIs, but that would incur API pricing, so I chose to embed the Claude Code tool for cost reasons. It's actually quite a poor implementation and is actively causing headaches: it forced me to run an entire agent thread doing evals to try to get decent performance from back-end AI calls, and I ran out of time before I could reach an acceptable call time.

I chose a single-file distribution approach centered on markdown, embedding OpenUI inside it rather than making HTML the primary container. In hindsight, I think that was probably the wrong decision for compatibility: a self-contained HTML file that can carry everything is understood by a much broader audience and more environments than markdown that needs my wiki client to render it correctly.

I chose OpenUI as the format for HTML artifacts because it offers a well-designed protocol for rapid iterative changes without having to regenerate large amounts of the HTML file. But it creates a non-standard HTML island and, worse, introduces a forced dependency on React. If I had more time, I would have investigated alternative sync engines with an OpenUI-like protocol for directly manipulating the DOM.


## Learnings and iterations
I planned it as time-bounded phases: first a short, diligent pass to set structure and taste, then a parallelized blitz across five agents to land a broad set of functionality, and finally a cleanup pass to fold in what I learned and smooth the experience. Even with eight hours, time was limited, so I had to make clear priorities, and those choices are documented in the design folder. I treated the backend as a stable capability boundary while the frontend stayed flexible enough to evolve.

- Getting LLMs to reliably undo is hard. When they make a mistake or crush carefully worded text with "slop", it's very difficult to get them to put the original back. I wouldn't ship this to production without a real form of undo.
- I iterated the edit loop toward surgical, name-matched patches after full-artifact rewrites proved slow and disruptive to the reader's place — one of the ways the OpenUI bet paid off.
- My audience thinking shifted; the two-audience chain was more of a discovery than a design. I went in assuming a single audience — someone collecting material in the wiki and using it there. I came out with a two-audience mindset: the author as a learner, and a second audience who will consume a mini-application built from that material. So artifacts aren’t just usage surfaces — they carry context, rationale, and explanation, almost like a comprehensive manual bundled with the product. Once I saw it, I incorporated the second audience and upped its priority, at the expense of more first-persona tooling.
- Recording a video of a UI that responds to your voice is very difficult! First, because it tries to respond to all of your voice-over; second, because an agent is an unreliable participant in your scripted scenarios. I should have planned twice as much time to prepare a video!
- In general, I only demonstrated surface-level integration of voice & gestures. Luckily, the best models are extremely good at following drawings, and several behaviors emerge from that: drawing the artifact you want them to build, crossing out words to delete, etc. A good part of my final hour of iteration was spent ensuring that agent-driven workflows performed well end to end.
