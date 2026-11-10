# Intercom contributor and agent instructions

## Read first

Read `README.md`, `docs/product-brief.md`, `docs/development-manual.md`,
`TODO/00_INDEX.todo`, and the affected workstream before changing the project.
Read `docs/github-tracking.md` before remote tracking changes.

For session startup, follow the installed `context-offload` and `context-mesh`
skills. Resolve the current base from the mesh index, hydrate this base's
`.agent-context`, and preserve the existing session identity on resume.
Sibling context stores are read-only.

## Current contract

- This is a voice-first desktop assistant coordinating existing Agency/Copilot
  sessions, with a spherical 3D Context Mesh activity display.
- Current user scope is architecture and roadmap only: do not build yet.
- Wake-word activation before each conversation is selected; continuous
  unconditionally active transcription is not.
- Existing Agency sessions are essential; validate that connector first.
- Compare local and cloud speech before choosing either. Neither is approved.
- Performance and speed are the top product priority and default processing
  profile. Provide selectable priorities; keep correct targets, permission
  enforcement and truthful outcomes invariant across profiles.
- Tauri 2/Rust + React/TypeScript/Three.js is the current engineering
  recommendation, superseding provisional Electron; none is owner-approved
  or runtime-qualified. Speech models and OS/device support remain gated.
- Do not infer integrations or features from the project name.
- Read `docs/architecture.md`, `docs/speech-options.md`, and `docs/roadmap.md`
  before future implementation. Proposed technology is not user approval.
- Read `docs/technology-decisions.md`, `docs/runtime-contracts.md` and
  `docs/performance-and-qualification.md` for the detailed candidate contract;
  `docs/research-sources.md` distinguishes upstream from installed evidence.
- Do not substitute a new SDK session for an existing Agency session and call
  the integration proven. Do not show guessed retrieval activity as observed.

## Development loop

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
No application tests/build tooling exist at initialization; introduce the
smallest appropriate checks with the first implementation.

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
