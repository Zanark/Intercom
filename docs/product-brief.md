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

- **Current deliverable:** document architecture and roadmap; do not build yet.
- **Activation:** always available, but require a wake word before each
  conversation. The phrase and conversation timeout are not chosen.
- **Integration priority:** existing Agency sessions are essential; prove that
  integration first. A plain-Copilot-only substitute is not sufficient.
- **Speech:** research local and cloud approaches and present trade-offs before
  choosing. Neither provider nor audio upload is approved.
- **Processing priorities:** performance and speed come first and are the
  default. Provide options to choose what to prioritize; processing quality
  and accuracy remain important.

These are user requirements, not implemented features. The deeper engineering
recommendation is Windows-first Tauri 2/Rust + React/TypeScript/Three.js,
superseding provisional Electron. It is not an accepted or qualified stack.
Speed/performance, Balanced and Accuracy are proposed profile labels; only the
speed-first default and ability to select priorities are confirmed.

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

See [architecture](architecture.md), [speech options](speech-options.md), and
[roadmap](roadmap.md) for proposed contracts and measurable gates. Screen capture,
OS-wide automation, unrestricted tools, auto-start, and public deployment are
not implied by the voice-assistant request.

The [technology register](technology-decisions.md) records concrete candidates,
alternatives and reversal gates. The [runtime contract](runtime-contracts.md)
and [performance plan](performance-and-qualification.md) make pending behavior
and qualification explicit without authorizing execution.

## First implementation gate

The roadmap records separate future qualification workstreams without
authorizing their execution. First prove existing-Agency-session integration
in `ic-04`; compare speech in `ic-05`; finish the open decisions in `ic-02`;
only then authorize the desktop slice in `ic-06`. Use an explicitly designated
disposable session/workspace for real connector tests, not the user's active work.

## Current evidence limits

No UI, executable, installer, agent invocation, privacy qualification,
performance measurement, or user acceptance exists for the product yet.
There is no launch command at this stage.
