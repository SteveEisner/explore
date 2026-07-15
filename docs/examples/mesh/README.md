# Tubes mesh simulator and positioning experiments

<oui-embed src="examples/mesh/simulator-wrapper.oui"></oui-embed>

I vibe coded this simulator as a way to see the WLED-Tubes project operating as a physical wireless system rather than only as firmware. It lets me watch tubes elect leaders, synchronize lighting, relay messages, split into clusters, and react to radio range in real time, then use the packet history and per-device state to debug and improve the mesh networking code. The positioning direction came from an interesting robotics paper, and we adapted its ideas to fit this device and mesh context.

This project produced a static simulator for the Tubes wireless lighting mesh, then extended that simulator into a laboratory for an experimental cooperative-positioning protocol. The two layers share the same anonymous broadcast network, but they have different status: the lighting model begins with the existing Tubes firmware in [`node.h`](node.h), while the positioning protocol is a proposed ESP32 implementation that has not been added to the firmware.

Open [`index.html`](index.html) directly in a browser. The simulator is one HTML file with inline JavaScript and CSS; it needs no server, build step, dependency installation, persistence, or network access. Reloading may discard the current run. For automated experiments, `window.TubesMeshSimulator` exposes scenario loading, snapshots, complete message audits, and device-scoped audits.

## The existing mesh problem

Tubes form an anonymous, infrastructure-free ESP-NOW broadcast network. There is no configured master, device count, topology map, or shared knowledge of physical position. Every tube starts with only its own random identifier, hears whatever packets reach it, and decides whether to lead, follow, or temporarily rebroadcast from that local evidence.

Lighting synchronization carries more state than a current color. A valid STATE packet describes what to render now, the shared animation timebase, and the phrase numbers at which the next pattern and palette changes occur. Radio partitions, leader timeouts, relays, clock corrections, and conflicting local views can all determine why one tube joins a synchronized group while another does not.

The simulator makes those decisions observable without giving devices any knowledge they would not have on hardware. It records every transmission, delivery or non-delivery, receive decision, relay, and local state transition, including device state before and after handling a packet. That audit can answer a question such as “why did this tube never turn purple?” by comparing the packets and decisions of the synchronized tubes with those of the outlier.

## Physical world and device types

The simulation runs on a pannable and zoomable 2-D physical canvas. Every entity has a simulator-only physical `(x, y)` center, visibly marked on the device; dragging changes that true position. Devices never read those coordinates. Physical truth is used only to calculate radio distance, configure fixed anchors, draw the scene, and evaluate estimated positions.

The default scenario contains two tubes, no anchors, a 600-pixel nominal radio range, 0.5× simulation speed, and four positioning peer slots. The two compact control bars can add tubes and anchors, load deterministic scenario sizes, clear or reset the field, select an entity, and delete the selection with Delete or Backspace. Empty-space dragging pans the field, and the mouse wheel zooms around the pointer.

Two device types participate in the network:

- A **tube** has lights, a Tubes-style identifier, lighting DNA, a leader/follower state machine, an animation clock, a positioning estimate, and a bounded peer table. Its displayed animation is a deterministic function of pattern, palette, and synchronized time, so synchronized tubes visibly render the same phase without repeatedly resetting their clocks.
- An **anchor** is a smaller device with no lights. It participates in positioning and radio traffic but ignores lighting commands. It is configured with its true physical coordinates and advertises those fixed coordinates at full confidence in an anchored frame. It is not a coordinator and does not know the topology or number of devices.

## Lighting protocol modeled from `node.h`

[`node.h`](node.h) is the copied Tubes leader/follower and rebroadcast implementation and remains the authority for current protocol behavior. The simulator keeps current-code behavior visibly separate from experimental corrections.

The modeled firmware packet has:

- a mesh header containing the sender ID, its chosen uplink ID, and protocol version;
- a recipient class for all/downstream, root/upstream, or informational traffic;
- a timebase;
- a command identifier;
- a fixed-size command payload.

A tube begins without knowledge of any peer. Hearing a higher ID can cause it to follow that sender. Current firmware follows a directly heard sender as its uplink, refreshes a timer when that uplink is heard, and returns to leader state after the uplink disappears. The simulator uses a shorter 10-second leader-loss interval so partitions can be evaluated quickly. Losing the leader also invalidates the tube’s floating position frame because its former origin is no longer established.

A STATE packet carries current pattern, palette, beat/timebase, and the future pattern and palette phrase numbers. Followers apply a valid leader state and derive animation phase from the shared timebase. Small clock differences are ignored so frequent state packets do not make animations jump backward and forward. The interface shows current DNA and progress toward both scheduled changes.

## Current relay behavior and the transparent-relay experiment

The copied firmware enters opportunistic rebroadcast mode when locally heard headers suggest that another device is following it or should be following it. During rebroadcast it replaces the packet header with its own header. That makes the next receiver follow the relay itself and loses the identity of a more distant logical leader.

The simulator can run this current-code interpretation or an experimental **Fixed RELAY** mode. Fixed relay preserves the logical leader’s header, lighting state, and timebase across physical hops. The direct positioning advertisement also carries `leaderViaId`, the physical neighbor through which the sender’s latest valid leader state arrived:

- `leaderViaId == leaderId` means the state arrived directly from the logical leader;
- another nonzero ID means the state arrived through that relay;
- zero means the device knows the leader claim but is still waiting for a valid state packet.

This is local path evidence rather than a route table. A relay renews its bounded lease while nearby direct advertisements show that its rebroadcast remains the downstream path or that a neighbor is waiting for one. The receiver applies lighting according to the logical leader regardless of the intermediate transmitter, while the positioning and audit layers retain the physical transmitter. Packet fingerprints suppress duplicate relay loops.

## Radio model

A sender broadcasts without knowing which devices exist or which will receive it. The simulator evaluates reception independently for every other entity from physical distance and the selected radio parameters.

Radio range defaults to a hard reachability boundary: packets inside the range arrive and packets outside it do not. An optional lossy-edge model makes only the weak boundary probabilistic. Selectable power-decay functions map distance to normalized received power, and the ideal RSSI-distance calculation inverts that same function. A receiver can therefore infer distance but never vector direction.

Independent dB controls introduce per-packet RSSI jitter, per-device transmit-power variation, and persistent link shadowing. Packets are handled at the simulation instant they are sent. An optional circle expands for one simulated second to visualize a transmission, but it does not delay delivery. Every original or relayed transmission creates one wave rather than a decorative stack of rings.

## Experimental positioning protocol

Positioning uses a separate informational broadcast. This lets no-light anchors participate without changing the meaning of existing lighting commands, and it lets positioning traffic be measured independently.

Each advertisement contains only fields a real device could know:

- sender ID and protocol/version data;
- coordinate-frame ID and epoch;
- fixed-anchor flag;
- estimated coordinates in that frame;
- confidence and solution class;
- axis and orientation reference IDs when they exist;
- bounded sequence and freshness information;
- compact quality evidence such as constraint count and residual;
- transmit calibration when the selected payload profile includes it;
- `leaderViaId` for the transparent lighting-relay experiment.

The governing constraint is local knowledge. Every simulated device represents the same bounded ESP32 algorithm. It uses only its configuration, clock, measured signal strength, bounded peer records, and received packet fields. It never reads physical coordinates, total device count, global topology, another device’s private state, or evaluator results.

Each peer-table entry represents a device whose physical transmission was heard directly, because only that event provides a valid RSSI range. The table has a configurable fixed capacity. Deterministic replacement favors fresh anchors and peers that improve same-frame geometry without assuming how many undiscovered devices exist. A separate solve-capacity setting bounds the work performed on each update.

The UI exposes the positioning payload profile, coordinate encoding and precision, peer capacity, solve capacity, anchor reservation, broadcast interval, modeled bytes per peer entry, packet size, and aggregate traffic. Reduced precision changes both the reported wire cost and the resulting localization quality.

## Floating coordinate frames

Without anchors, the highest accepted lighting leader defines the floating origin `(0, 0)`. That convention removes translation ambiguity but cannot reveal global rotation or reflection from range measurements alone.

With one additional device, the follower knows only that it lies on a circle around the origin. The implementation can place it on a positive-X axis as a frame convention, but the range evidence itself remains radial. A third non-collinear device establishes orientation and handedness. When geometry produces two mirror solutions, the node keeps both candidates until fresh direct ranges favor one branch by a meaningful margin for several consecutive solver updates.

After the frame is bootstrapped, the origin and axis remain references rather than mandatory direct ranging peers. Any node can localize from fresh, directly heard, same-frame peers:

- one positioned reference produces a radial constraint;
- two positioned references produce two mirror candidates unless other evidence selects a branch;
- three or more non-collinear references permit bounded weighted multilateration and damped refinement.

A node with a radial or unresolved mirrored solution does not advertise itself as a uniquely positioned constraint. This prevents one guessed branch from contaminating farther radio neighborhoods. Collinear layouts and neighborhoods with only two useful references are genuinely unobservable, so they remain explicitly ambiguous rather than receiving fabricated coordinates.

## Anchored coordinate frames

Anchors advertise a fixed global frame and surveyed coordinates. A tube joins that frame only when direct, geometrically sufficient anchor or already-positioned evidence supports it. One range describes a circle, two ranges usually retain a mirror pair, and three non-collinear fixed or positioned references can establish a unique 2-D estimate.

Anchored knowledge can propagate through ordinary positioned peers, but a relayed packet is never treated as a direct range to its logical sender. Adding an anchor does not teleport unrelated floating estimates into the anchored frame, overwrite physical positions, or reveal simulator truth to a device.

## Confidence and stability

Confidence is a compact quality score rather than a complete statistical covariance. It falls with stale observations, noisy ranges, weak geometry, large residuals, immature samples, and uncertain supporting peers. A derived position cannot become more confident than the references that support it. The floating origin leader and configured anchors are the only intrinsically certain positions.

Range measurements use filtering, outlier limiting, and bounded history. Position updates use damping and movement limits so radio jitter does not create oscillation. Mirror decisions use hysteresis before changing branches.

For evaluation and display, the simulator can rotate and reflect a complete floating frame to find its best registration against physical truth. This compensates for the unobservable whole-frame rotation and reflection without changing any device estimate. The display transform never feeds back into the network algorithm.

## Interface and observability

The field shows the physical center of every device, estimated-position ghosts, and wireframe overlays for estimated positions. These visuals represent the positions devices are estimating for themselves in their current coordinate frame, and help you see how they’re trying to locate themselves relative to one another. The field also shows range and uncertainty geometry, following arrows with arrowheads, logical leader paths, relay status, ambiguous solutions, and optional transmission waves. Non-obvious controls have hover explanations.

Selecting a device opens an inspector that separates protocol-visible state from simulator-only truth. It shows current lighting DNA, the future pattern and palette schedule with diminishing progress bars, chosen logical leader, direct or relayed leader path, relay lease, age of the latest accepted leader state, estimated frame and solver mode, confidence, peer-table use, direct peer observations, and recent packet decisions.

## Complete packet audit

Every run records each outgoing broadcast once and creates a delivery decision for every potential receiver. A delivered record contains the physical transmitter, logical header, range and RSSI inputs, relay hop and trace, packet payload, receiver state before and after handling, acceptance or ignore reason, lighting application, positioning result, and any resulting local transition.

The export schema is `tubes-message-audit/v1`. A complete run includes scenario parameters, lighting catalog, simulator configuration, evaluation history, outlier events, final snapshot, and the ordered event list. A device-scoped export filters the same evidence to one tube without changing the event semantics.

## Position evaluator

The evaluator is intentionally omniscient and intentionally isolated from the simulated devices. It registers each comparable estimated frame against physical truth using the best rigid rotation and optional whole-frame reflection, then reports coverage, median error, 95th-percentile error, worst error, a bounded quality score over time, persistent outliers, peer-table pressure, packet volume, and convergence behavior.

A node in an ambiguous or incompatible frame reduces coverage. It is not independently registered to physical truth, because doing that would create a misleading perfect score for an estimate that the network could not actually relate to the group.

## Scenarios represented by the simulator

The simulator and its scenario controls cover:

1. Two tubes in direct range, showing leader election, accepted STATE traffic, time and DNA synchronization, and the two-device radial/axis frame.
2. A multi-hop chain in which remote tubes receive the same logical leader’s lighting through transparent relays while using only physical neighbors for RSSI ranging.
3. A dense unanchored mesh with four peer slots and realistic RSSI and transmit-power variation, showing convergence, whole-frame registration, and persistent outliers.
4. Comparable meshes with one to three anchors, showing when anchored geometry resolves a frame and when too little geometry remains ambiguous.
5. A partition lasting beyond the 10-second leader timeout, followed by re-election, position-frame invalidation, and a later merge.
6. Deliberately unobservable two-reference and collinear layouts that remain radial or mirrored rather than pretending to converge.

Three complete audit exports are included:

| Run | Simulated time | Events | What it demonstrates |
|---|---:|---:|---|
| [`01-two-tube-direct-15s.json`](01-two-tube-direct-15s.json) | 15.04 s | 74 | Direct leader election, lighting synchronization, and the ideal two-device floating-frame baseline. |
| [`02-four-tube-relay-chain-30s.json`](02-four-tube-relay-chain-30s.json) | 30.00 s | 648 | One logical leader reaches three followers over a collinear three-hop chain, while the unobservable geometry correctly leaves only two positions uniquely represented. |
| [`03-eight-tube-bounded-noisy-30s.json`](03-eight-tube-bounded-noisy-30s.json) | 30.00 s | 2,144 | Eight unanchored tubes use four peer slots under receive jitter, device TX variation, and persistent link shadowing; the resulting outliers expose sensitivity to bounded peer selection and biased RSSI. |

These are evidence rather than golden outputs. Their purpose is to make success and failure reproducible enough that a protocol change can be justified from local packet histories, then compared against the same configurations.

## Research and implementation material

- [`index.html`](index.html) is the runnable simulator.
- [`node.h`](node.h) is the unchanged Tubes networking source.
- [`POSITIONING_PROTOCOL_DESIGN.md`](POSITIONING_PROTOCOL_DESIGN.md) describes how the experimental protocol could be implemented per device on ESP32 hardware.
- [`distributed-graph-optimization-relative-localization.pdf`](distributed-graph-optimization-relative-localization.pdf) is *Distributed Graph Optimization Based Relative Localization for Multi-Robot Systems* ([arXiv:2210.01662](https://arxiv.org/abs/2210.01662)), the closest research comparison. The simulator uses a smaller bounded local solver rather than the paper’s full graph optimizer.

## Model boundary

The simulator is credible only while every device transition can be explained from its ordered packet history and bounded local state. Any result that depends on total device count, global topology, a non-anchor’s true coordinates, evaluator output, or a central correction step would violate the model even if it made the displayed map look more accurate.
