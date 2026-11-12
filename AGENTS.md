# Intercom contributor and agent instructions

## Read first

Read `README.md`, `docs/guide.md`, `docs/product/product-brief.md`, `docs/development/development-manual.md`,
`TODO/00_INDEX.todo`, and the affected workstream before changing the project.
Read `docs/development/github-tracking.md` before remote tracking changes.

For session startup, follow the installed `context-offload` and `context-mesh`
skills. Resolve the current base from the mesh index, hydrate this base's
`.agent-context`, and preserve the existing session identity on resume.
Sibling context stores are read-only.

## Current contract

- The functional-slice request supersedes the older speech/controller limits:
  download a stronger local recognition runtime/model for English and
  Hindi/Hinglish, returning Roman-script text. Audio must remain on-device.
  A separate restricted Copilot interpretation controller is approved; it is
  not a replacement work session and may not execute work or load work tools.
  Default focus is the Intercom context node, not an existing work session.
  Clear requests should execute without redundant target/task confirmations;
  clarify genuine ambiguity and retain actual tool permissions, busy refusal
  and existing-session identity. Multi-session dependencies and exclusions
  must be enforced by the host. TTS improvement can wait. Illustrative session
  names do not authorize this agent to test work in real sessions.
- This is a voice-first desktop assistant coordinating existing Agency/Copilot
  sessions, with a spherical 3D Context Mesh activity display.
- The owner authorized a bounded desktop prototype after the research push.
  Electron is approved for this prototype only. The later request authorizes
  an unsigned Windows prototype prerelease and microphone-device selection/
  brief checks. The subsequent owner request explicitly authorizes click-on/
  click-off capture, installed local en-US Windows recognition, local spoken
  progress/results and conversation-only dispatch to an owner-designated existing
  dormant Copilot session. The newer complete-slice request additionally authorizes
  reading the real local Context Mesh on every launch and real work in explicitly
  confirmed existing idle sessions. Retain manual tool approvals and refuse busy
  sessions; never inherit allow-all unnoticed. Push-to-talk is selected for this
  prototype. No cloud audio, wake word, new session, active attach or blanket
  approval is authorized.
- Implement Floating Mesh as native window transparency plus a transparent
  renderer, not a black browser page. Keep movement and restoration accessible.
- Wake-word activation remains a later product choice, not this prototype's
  activation contract. Continuous unconditional transcription is not authorized.
- The owner's clarification-reply request authorizes one bounded automatic mic
  opening after a structured Intercom clarification finishes local playback
  (or appears in writing when muted). Keep selected-device readiness, five-minute
  bounds, review, Stop/Cancel/opt-out and actual host visibility guards.
  Ordinary replies and permission prompts must not trigger recording. This is
  not continuous listening or permission to test the physical microphone.
- Existing Agency sessions are essential; validate that connector first.
- The bounded Windows speech prototype is selected, not the final product engine.
  Broader local/cloud and multilingual quality comparisons remain unqualified.
- Performance and speed are the top product priority and default processing
  profile. Provide selectable priorities; keep correct targets, permission
  enforcement and truthful outcomes invariant across profiles.
- Tauri 2/Rust + React/TypeScript/Three.js is the current engineering
  product recommendation. Electron is the approved bounded-prototype host,
  not a qualified performance winner. Speech and OS/device support remain gated.
- Do not infer integrations or features from the project name.
- Read `docs/architecture/architecture.md`, `docs/research/speech-options.md`, and `docs/product/roadmap.md`
  before future implementation. Proposed technology is not user approval.
- Read `docs/architecture/technology-decisions.md`, `docs/architecture/runtime-contracts.md` and
  `docs/research/performance-and-qualification.md` for the detailed candidate contract;
  `docs/research/research-sources.md` distinguishes upstream from installed evidence.
- Do not substitute a new SDK session for an existing Agency session and call
  the integration proven. Do not show guessed retrieval activity as observed.

## Development loop

Keep application UI in `src/app` and `src/components`, routing/model code in
`src/domain`, recording in `src/voice`, and native modules in `desktop/services`.
`desktop/main.cjs` and `desktop/preload.cjs` remain the host entry/bridge.
Tests are grouped into `tests/unit`, `tests/e2e`, `tests/smoke` and `tests/helpers`.
The repository map in `docs/guide.md` covers documentation, assets and tooling.
Update import, resource, test-discovery and packaging paths together when moving
files; preserve the numbered TODO identities and owned context-store location.

1. Define one bounded outcome in a numbered `.todo` workstream.
2. Read relevant implementation and prior art; preserve unrelated dirty changes.
3. Implement the smallest complete change, with explicit failure behavior.
4. Verify the affected behavior and important failure/cancellation paths.
5. Update the workstream, index, development ledger, and affected guides.
6. Reconcile its GitHub issue and Project item when tracking writes are authorized.
7. Update owned private continuity and refresh Context Mesh.

Every workstream must retain Status, Milestone, Dependencies, Purpose, Tasks,
Acceptance criteria, Completion evidence, and Completion log. Stable IDs and
filenames must survive later additions. Indexes and the perpetual ledger are
not feature issues.

## Evidence and documentation

Distinguish planned, implemented, technically verified, human accepted, and
published. Never fabricate build commands, test results, approval, or deployment.
Use `npm run lint`, `npm run build`, `npm test` and `npm run test:desktop`
for the prototype. Desktop tests launch only disposable app profiles.
Use `npm run package:win` for the unsigned portable build. Tests use synthetic
Chromium media devices, never the user's physical microphone.

Keep the README honest about the current product. Explain actual architecture,
algorithms, and design principles as implementation appears; do not generate
empty book chapters or claim an unrendered diagram was visually reviewed.
Prefer top-to-bottom box-and-arrow diagrams and caption relevant images.

## Safety and concurrent use

Do not invoke a local agent, collect private files, enable tools, or send content
to a provider without task-specific authority. Never put secrets, raw
conversations, credentials, or `.agent-context` into issues or public artifacts.
Git ignore rules do not provide encryption or erase history.

When an app exists, protect the user's running instance. Keep development
builds, profiles, mutable data, and backend writes separate; different paths or
ports alone do not prove isolation. Do not restart, reload, focus, reinstall,
or automate the user's session without coordination. Stop only specifically
identified agent-owned processes.

Commits, pushes, releases, deployments, schedules, permission changes, and
hosted automation require separate authority. Tracking permission is not
publication permission.
