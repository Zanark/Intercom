# Intercom product brief

## Confirmed direction

Intercom is a voice-first desktop companion and orchestrator for existing
Agency/Copilot sessions, not just dictation for a terminal.

The owner described the following workflow on 2026-11-10:

1. Speak naturally to a desktop assistant that speaks back.
2. Resolve the relevant project/context and the right existing session,
   asking a spoken clarification when the target is ambiguous.
3. Either open that session in a new terminal for hands-on work, or submit
   the request for background execution and continue the conversation.
4. Receive a notification and spoken, grounded result when the work finishes.
   Listening to runtime events must not require repeated agent/model prompts.
5. See a spherical 3D Context Mesh instead of the supplied voice-orb reference.
   Paths actually in use light up; other relationships stay dimly visible.

CareerOS's mission/checkpoint graph is the visual reference, not its career data
model. A context, a social persona, a saved session, and a live session are not
interchangeable identities.

## Confirmed scope choices

- **Current deliverable:** Electron prototype with local-English push-to-talk,
  actual local mesh every launch and separately confirmed background work in
  existing idle sessions. Retain permission prompts and refuse busy writers.
  Terminal opening requires manual task entry. No new sessions, active attach,
  wake word or cloud audio.
- **Floating Mesh:** a mesh-only mode with native transparent background, so
  the graph can appear to float on the desktop.
- **Prototype distribution and microphone choice:** publish an unsigned Windows
  portable EXE prerelease; allow explicit input selection and brief device
  checks, without enabling wake word, transcription or cloud audio.
- **Activation:** always available, but require a wake word before each
  conversation. The phrase and conversation timeout are not chosen.
- **Integration priority:** existing Agency sessions are essential; prove that
  integration first. A plain-Copilot-only substitute is not sufficient.
- **Speech:** installed local Windows voices are selected for the prototype.
  Richer arbitrary voice identity, timbre and emotional style are mandatory
  future requirements. Keep synthesis replaceable without rewriting the
  conversation/work workflow. No richer engine, cloud audio or model download
  is approved; the final product provider still needs comparison/selection.
- **Processing priorities:** performance and speed come first and are the
  default. Provide options to choose what to prioritize; processing quality
  and accuracy remain important.

These remain product requirements; the [prototype](../prototype/prototype.md) implements
the bounded confirmed-work/voice slice and actual published mesh, not unrestricted
orchestration or automatic terminal handoff. The deeper engineering
recommendation is Windows-first Tauri 2/Rust + React/TypeScript/Three.js,
superseding provisional Electron. It is not an accepted or qualified stack.
Speed/performance, Balanced and Accuracy are implemented prototype choices with
supported background reasoning effort; product-level latency budgets remain open.

## Decisions required before implementation

- Initial operating system, desktop stack, and resource budget.
- Agency connector capability, including active-session attachment versus
  dormant-session resume, launch configuration fidelity, and cancellation.
- Speech provider/model, input/output languages, voice, model licenses, wake
  phrase, microphone/speaker setup, echo control, and timeout.
- Approved context roots/session aliases, routing model and confidence policy,
  permissions, confirmation tiers, storage/retention, and provider data flow.
- Live telemetry coverage: which reads/tool operations can be observed and
  which must remain visibly unknown.
- Exact profile settings and measured latency/resource/accuracy budgets.
  Profiles must not weaken permissions, silently change data providers or
  trade correct session targeting for a faster guess.
- Distribution, licensing, updates, and resource constraints as applicable.

See [architecture](../architecture/architecture.md), [speech options](../research/speech-options.md), and
[roadmap](roadmap.md) for proposed contracts and measurable gates. Screen capture,
OS-wide automation, unrestricted tools, auto-start, and public deployment are
not implied by the voice-assistant request.

The [technology register](../architecture/technology-decisions.md) records concrete candidates,
alternatives and reversal gates. The [runtime contract](../architecture/runtime-contracts.md)
and [performance plan](../research/performance-and-qualification.md) make pending behavior
and qualification explicit without authorizing execution.

## First implementation gate

The owner separately authorized an early fixture-only sub-slice in ic-06.
This exception does not authorize or complete the qualification workstreams.
Before the real integrated loop, prove existing-Agency-session integration
in `ic-04`; compare speech in `ic-05`; finish the open decisions in `ic-02`;
only then authorize the desktop slice in `ic-06`. Use an explicitly designated
disposable session/workspace for real connector tests, not the user's active work.

## Current evidence limits

A packaged .4 Electron candidate loads the real local snapshot; `npm start`
also builds and launches it. A native source test captured synthetic speech,
ran the exact approved read-only command in the designated existing session,
received the real response and completed local playback. Saved grants meant
no native permission prompt occurred; fixtures separately cover mediation.
The packaged runtime and actual portable startup pass. Physical microphone,
human listening, automatic terminal handoff, installer and performance budgets
remain unqualified. See the [complete feature matrix](../prototype/prototype.md).

The subsequent voice-profile slice adds named persistent installed-voice
profiles, gender/culture-based voice choice, pitch/rate/volume and draft
preview. The capability/adapter boundary is ready for another provider, but
arbitrary identity/timbre/emotion remain future work, not local-engine claims.
