# Intercom architecture

## 1. Status and decision boundary

Design recorded 2026-11-10. This is a proposed architecture, not working code.
The user selected documentation before implementation, wake-word activation,
Agency-first session integration, and a local/cloud speech comparison.
The [product brief](../product/product-brief.md) owns confirmed requirements.

**Performance and speed are the top priority and default**, with selectable
processing priorities. Accuracy remains important. This is a product contract,
not a claim that the proposed architecture already meets a performance target.

The deeper research recommends Windows-first **Tauri 2 + Rust**, with React,
TypeScript and Three.js in the WebView, a native audio worker and SQLite for
durable jobs. This supersedes the earlier provisional Electron recommendation;
Electron remains a fallback, not a disproven alternative. Avoiding a bundled
browser runtime is not proof of lower end-to-end voice latency.

See [technology decisions](technology-decisions.md) for choices, alternatives
and reversal gates, [runtime contracts](runtime-contracts.md) for process/IPC,
identity and failure semantics, [qualification](../research/performance-and-qualification.md)
for measurements, and [primary evidence](../research/research-sources.md) for source limits.
No stack/provider is owner-approved or runtime-qualified. Prove existing Agency
integration before making the shell depend on an unverified control interface.

### Processing profiles

Propose a visible settings selector; exact labels and tuning need qualification:

| Proposed profile | Intended trade-off |
|---|---|
| Speed / performance (default) | Minimize useful-response latency and avoid unnecessary computation, context loading, model turns and rendering cost. |
| Balanced | Allow additional context/verification when measured quality gains justify moderate latency/resource cost. |
| Accuracy | Spend more time/context on uncertain interpretation and result verification where the selected engine supports it. |

Fresh settings default to Speed / performance. Persist an explicit selection
locally and apply changes at the next request boundary; do not silently change
the target, backend or behavior of an in-flight job.
Provider/model changes still require their own availability, privacy and cost
approval. A profile is not consent to upload data or use a more expensive service.

Prioritize fast local wake detection, deterministic alias routing where
unambiguous, incremental speech delivery, bounded metadata/context loading,
one passive event stream per connection, cached stable graph geometry and
adaptive decorative detail. Do not warm heavyweight models continuously or
poll agents to make the UI appear responsive. Qualify startup/idle cost as well
as active latency; avoid graph/audio/model competition on the same hardware.
While listening is enabled, measure the trade-off of keeping only the selected
speech bundle warm; do not interpret this as a ban on useful model residency.

All profiles retain correct session identity, ambiguity clarification, required
permissions and minimum task verification. Never turn partial transcripts into
early side effects, invent completion, or remove safeguards to win a benchmark.
Measure end-of-speech to a useful answer separately from a fast acknowledgment,
and report accuracy/error rates alongside median/p95 latency and resource use.
Do not claim Accuracy is better or Speed is faster until the actual settings
are compared on the same scenarios and target hardware.

## 2. Components and ownership

| Component | Responsibility and boundary |
|---|---|
| Desktop host | Own lifecycle, tray/mute/stop controls, local credentials, validated IPC, terminal handoff, and explicitly authorized child processes. |
| Audio worker | Local wake detector, bounded audio buffer, speech activity/endpoint detection, selected ASR/TTS adapters, playback and echo handling. |
| Dialogue controller | Maintain the active spoken conversation, clarify targets, distinguish conversational replies from requested work, and present confirmations. |
| Context/session router | Join approved mesh metadata to a fresh session catalog; resolve context and session separately. No shell command generated directly from a transcript. |
| Agency connector | Advertise proven capabilities, submit to a specific permitted session, stream events, request approval, cancel, and reconcile connection loss. |
| Job supervisor | Persist dispatch identity and state, subscribe to runtime events, serialize per-session requests, and produce completion receipts. |
| Activity projection | Reduce observed events into graph state with provenance; distinguish topology, planned routing, observed activity, and unknown coverage. |
| 3D renderer | Render the context sphere and accessible equivalent. It receives sanitized graph/activity data, not shell access, keys, or the whole private mesh index. |
| Local journal/outbox | Store minimal job state, event cursor and notification acknowledgment; do not duplicate entire session transcripts or raw audio by default. |

These are logical boundaries, not a requirement for eight separate processes.
Keep audio inference and rendering off the process that owns job state.
For the Tauri candidate, explicitly constrain custom commands and plugin
capabilities, validate narrow host operations, and keep remote content out of
the privileged UI. A capability file alone does not constrain every registered
custom command. If Electron is selected instead, isolate the renderer, disable
Node integration there and retain the same host-authority contract.

## 3. Voice and routing flow

1. With microphone permission and listening explicitly enabled, run only the
   local wake detector in standby. Always available is not permission to start
   at login or record/upload continuously.
2. Wake word opens a conversation with a visible indicator and optional cue.
   A bounded in-memory pre-roll may retain the start of the utterance; its
   duration and whether it can be transmitted require a documented choice.
3. Speech recognition yields partial/final transcripts. Only a finalized,
   deduplicated utterance may initiate routing or work.
4. The router uses approved names/aliases, recent conversation references, and
   session capabilities. If multiple sessions fit, ask which one. Never choose
   the most recently active session merely because it exists.
5. Resolve action mode: terminal handoff, background request, or conversation.
   An utterance can concern several contexts; each work dispatch needs its own
   explicit target. The first slice handles one target per request.
6. Confirm the target and proposed side effects under the permission policy.
   Dispatch a typed request to the connector, not an interpolated shell string.
7. Release the foreground dialogue while the job supervisor awaits events.
   New conversation does not reset or abandon the running job.
8. A qualified outcome creates a durable notification. Speak a short result
   tied to the original request, with details available on demand.
9. Conversation ends on explicit sleep or the selected inactivity timeout,
   returning to local wake-only standby. Completion speech must not silently
   reopen a conversation or authorize new work.

Start with deterministic aliases and explicit clarifications. Natural-language
intent interpretation still needs a qualified model/engine; speech recognition
alone does not provide it. A restricted foreground dialogue agent is a candidate,
not an approved second unrestricted coding agent. Send only the needed approved
metadata to any router model, not the entire context mesh or all session history.

## 4. Agency-first integration gate

Installed Agency help was inspected locally, without starting an agent or
enabling session reporting/control. It advertises local session discovery,
capability distinctions, launch configuration, session identity and underlying
CLI argument pass-through. That is discovery evidence, not proof of control.
Exact private installation receipts stay in owned continuity, not public issues.

Copilot CLI documentation for this build establishes stdio ACP and resumable
session identifiers. The public Copilot SDK documents JSON-RPC runtime control,
streaming and event subscriptions. None of those facts establishes attachment
to an arbitrary already-running Agency session.

The connector proof must resolve:

- Discover existing sessions without enabling new remote discovery/reporting.
  Honor resumable versus browse-only and active/in-use distinctions.
- Match an actual session ID, workspace and launch profile. A persona's
  creation-session ID in the mesh is only a hint, not proof of live availability.
- Preserve applicable Agency configuration, agents, plugins, tools and policy.
  A fresh SDK-managed runtime is not automatically equivalent.
- Establish whether active sessions can be attached/messaged through a
  supported interface, and whether dormant sessions can be resumed safely.
- Establish structured output, approval/elicitation, cancellation, event replay,
  and terminal handoff for that same identity.

Prefer a supported Agency-aware structured transport if proven. Evaluate
Agency-wrapped ACP or prompt-mode JSONL as candidates, not promises. The generic
SDK is an alternative only if it preserves the required Agency behavior.
Pin and qualify a matching runtime/protocol/SDK version pair.

If active attachment is unsupported, report that limitation. Do not invent an
API, inject keystrokes, modify private session databases, start a second writer,
or quietly substitute a new session. Offer user-coordinated handoff or dormant
resume only after the user accepts that scope change.

## 5. Jobs, events and truthful completion

Persist `requestId`, `jobId`, session/context identities, connector capability
version, approved request hash, dispatch acknowledgment, timestamps, state,
outcome evidence, last event cursor, and notification state.
These are proposed application records, not existing runtime field names.

Proposed lifecycle:

```text
received
  -> clarifying / awaiting-confirmation
  -> queued
  -> dispatching
  -> running <-> awaiting-user
  -> verifying
  -> succeeded / finished-unverified / failed / cancelled / outcome-unknown
```

The [runtime contract](runtime-contracts.md) expands approval, cancellation,
handoff and crash transitions. `finished-unverified` means the agent reported
completion without the required independent acceptance evidence; it is not
qualified success or an unknown transport outcome.

Subscribe once per actual connection, normalize events, and release resources
on termination. A passive stream reader is still observation, but it does not
spend model turns repeatedly asking "are you done?" Low-frequency bounded
liveness/reconnect checks are separate from agent prompting.

Do not conflate transports or completion signals:

- ACP `assistant.idle` means foreground activity settled; attached work can
  remain. `assistant.turn_end` ends a model turn, not the task.
- ACP `session.idle` describes whole-session quiescence. Attribute the event to
  the correct session/agent/request; unrelated or subagent idle is insufficient.
- ACP prompt completion waits for attached background work. Detached services
  can intentionally outlive it and need explicit readiness/evidence criteria.
- CLI process exit and zero exit status alone do not prove the user's task
  succeeded. Inspect structured terminal result and required evidence.
- SDK event subscriptions are documented, but their semantics must be checked
  for the selected runtime. Do not copy ACP-specific event assumptions blindly.

A job succeeds only after an authoritative request terminal signal and the
selected task's success evidence agree, with no outstanding required approval
or attached work. An agent's unverified claim is labelled as such.
Persist the outcome before queuing notification/speech.

Keep one writer/active dispatch per session. Different sessions can still share
a worktree or exclusive resource: do not treat different IDs as isolation.
Queue or coordinate overlapping workspace writes; never steal the user's live
session. Cross-session concurrency starts conservative and is qualified later.

Deduplicate runtime events and outbox records by stable IDs. Do not promise
exactly-once audible delivery across a crash between playback and acknowledgment.
Unacknowledged results stay available; do not blindly repeat speech or re-run a
side-effecting request after an uncertain dispatch.

## 6. The 3D Context Mesh surface

Use the supplied image's minimal, dark voice surface as a mood reference;
replace its single orb with an actual spatial graph, not a 2D graph texture
painted on a sphere.

CareerOS source was inspected: `CareerGraphScene.tsx` uses Three.js perspective,
orbit controls, glow/bloom and selected-edge layers; `careerGraphModel.ts`
places stable identities in 3D; `HolographicCore.ts` supplies a spherical shell;
`careerOrbitMotion.ts` gives rings stable planes. Adopt the visual language,
not career checkpoint meanings, private progress, or an entire copied renderer.

Proposed composition: central Intercom dialogue focus, stable context clusters
in a spherical volume, distinct session nodes, thin dim relationship paths,
subtle outer rings and depth cues. Support rotate/zoom/reset, readable selected
labels, reduced motion and a keyboard/list fallback.
Decorative rings are not connections or evidence of work.

The existing mesh snapshot has `schemaVersion: 1`, `contexts`, `graph.nodes`,
and `graph.edges`. Edges carry type, confidence, relationship class and evidence;
they describe indexed relationships, not live communications.
Import an allowlisted projection locally, preserve IDs/provenance, validate
endpoints, and reject incompatible schema versions explicitly.
Do not expose social messages, memory text or unrelated artifacts by default.
Snapshot refresh and live activity are separate data streams.

| Visual state | Meaning |
|---|---|
| Dim path/node | Known relationship or available context; not current activity. |
| Preview/outlined route | Proposed or selected target, not a completed read. |
| Bright path/pulse | Observed dispatch, data delivery or mapped tool activity, carrying event provenance. |
| Waiting marker | Approval, clarification or resource wait, not ongoing reading. |
| Completion/failure marker | Qualified outcome or explicit error for the identified job. |
| Unknown/stale indicator | Telemetry is unavailable, disconnected or too old to assert activity. |

Only light a context-read path when an instrumented retrieval/tool event or
Intercom's own successful context delivery supports it. A selected session or
mentioned filename does not prove a read. Context delivered is not proof of
model attention. Do not draw a shortest path through unrelated mesh edges and
claim the agent traversed it. Concurrent jobs need distinct focus/legends;
completed activity fades while the receipt remains inspectable.

## 7. Privacy, interruption and recovery

- Wake-word recognition is not authentication. Nearby speech, playback or
  another person must not gain blanket tool authority.
- Default proposed boundary: no raw-audio persistence; cloud audio only after
  explicit provider/data approval; no automatic local-to-cloud failover.
- Keep keys in OS credential storage and the host, never renderer/localStorage,
  transcripts, command arguments, screenshots or issues. Stored job data still
  needs an approved location, retention, deletion and redaction policy.
- Side effects inherit neither voice convenience nor a previous "yes."
  Present the exact target/action, bind approval to that request, and enforce
  existing organizational/tool permissions. Never default to allow-all.
- Barge-in stops assistant speech; cancelling the backend job is a separate,
  explicit action. Use echo cancellation/reference playback or a qualified
  half-duplex fallback; voice activity detection alone is not echo control.
- Lost microphone, cloud outage, expired auth, missing session or WebGL failure
  is visible and recoverable. Preserve job state when the voice/UI layer fails.
- Cancellation uses the connector's request-scoped mechanism first. Process
  termination is limited to verified Intercom-owned processes and cannot undo
  prior edits or external actions.
- Restart reconciliation must not replay uncertain work. Tray close, app exit,
  session shutdown, OS sleep and handoff need separately stated behavior.
  No autostart, daemon enablement or deployment is approved by this design.

## 8. Sources and evidence limits

Inspected on 2026-11-10:

- [CareerOS graph source](https://github.com/Zanark/CareerOS/tree/main/src/graph):
  local checkout read-only; source inspection, not a new visual/browser review.
- [Copilot SDK architecture](https://github.com/github/copilot-sdk#architecture)
  and [streaming guide](https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md).
  Upstream documentation can be newer than the installed runtime.
- Installed Copilot CLI 1.0.108 documentation: ACP transport and foreground/
  session idle semantics, prompt-mode JSONL, resume IDs and permission behavior.
- Installed Agency help and existing mesh schema inspected locally.
  No real session was resumed, attached, prompted, cancelled or reconfigured.

No latency, voice quality, GPU footprint, active-session control, graph telemetry
coverage or task-completion behavior has been measured. The [roadmap](../product/roadmap.md)
turns these unknowns into gates rather than claimed capabilities.
