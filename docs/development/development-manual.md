# Intercom development manual

## 1. Scope and authority

This is the repository-specific adoption of the Development and Documentation
Manual, version 1.4. The shared skill provides guidance, not an installed
synchronizer, application runtime, or permission to publish.

Initial evidence is the original repository README and the owner's project
setup request. They establish a desktop assistant using a local AI agent,
but do not establish a framework, provider, feature catalogue, or working app.

Selected modes are project foundation, numbered workstreams, causal development
history, GitHub tracking, and private context continuity. A technical book,
source atlas, PDF pipeline, media production, and deployment are not needed
for the initial documentation-only setup. The owner subsequently authorized
a bounded Electron fixture prototype; real voice/Agency integration remains gated.
The later request separately authorizes an unsigned Windows prototype release
and explicit microphone-device checks, not continuous listening or providers.
The subsequent bounded voice request selects push-to-talk, installed local
en-US recognition/playback and conversation-only use of one designated
existing idle session. The subsequent complete-slice request authorizes actual
mesh loading every launch and confirmed work in existing idle sessions, retaining
permissions and refusing busy writers. Push-to-talk remains selected. Only the
exact read-only native acceptance operation was approved for this agent's test;
do not infer arbitrary test tools, new prompts or publication authority.

The functional-slice request subsequently approves stronger local recognition
downloads, English/Hinglish Roman output and a separate restricted Copilot
interpretation controller. Clear requests should not require redundant task/
target confirmation. Preserve genuine ambiguity checks, tool permissions and
exact existing-idle-session ownership. This does not authorize real test tasks
in illustrative sessions or changing the user's running instance.

The subsequent owner-reviewed vision report authorizes all feasible local
improvements and keeping one latest release executable. The integrated .16
candidate includes observed source activity, explicit cited synthesis and warm
native speech. Exact disposable portable qualification precedes old/intermediate
artifact cleanup; no running instance is switched. This is not new permission
to publish, weaken approvals or send additional real-session test prompts.

The subsequent missing-model report authorizes persistent diagnostics and a
portable lifecycle repair. Local .17 uses per-launch extraction, metadata-only
rotating logs and automatic process/resource failure snapshots, not content
or memory dumps. Exact portable duplicate-launch and missing-model/recovery
checks precede cleanup. Older executables remain protected while running;
fresh ownership checks, not a different disposable profile alone, authorize
removing superseded extraction/build artifacts. No owner instance is restarted.

The subsequent clarification-reply request authorizes bounded automatic capture
after a structured Intercom clarification finishes local playback, or after
written display when voice is muted. Default-on opt-out, selected-device
readiness, host visibility, Stop/Cancel and stale-operation guards remain
mandatory. This narrow exception is not wake-word/continuous listening,
automatic tool approval or physical-microphone test authority.

## 2. Canonical artifacts

| Artifact | Responsibility |
|---|---|
| `README.md` | Centered visual showcase and linked entry points |
| `docs/guide.md` | Honest product stage, setup, workflow and documentation navigation |
| `docs/product/product-brief.md` | Confirmed direction, undecided requirements, first-slice gate |
| `docs/architecture/architecture.md` | Component overview and invariant boundaries |
| `docs/architecture/technology-decisions.md` | Candidate stack, alternatives and reversal gates |
| `docs/architecture/runtime-contracts.md` | Proposed IPC, routing, jobs, lifecycle and failure contracts |
| `docs/research/performance-and-qualification.md` | Speed-first profiles and evidence plan |
| `docs/research/research-sources.md` | Primary-source claims and qualification limits |
| `docs/prototype/prototype.md` | Actual desktop prototype controls, code mechanisms and limits |
| `AGENTS.md` | Contributor and agent execution boundaries |
| `TODO/00_INDEX.todo` | Stable workstream navigation and status |
| Numbered workstreams | Bounded tasks, dependencies, acceptance and evidence |
| `TODO/03_DEVELOPMENT_LEDGER.todo` | Public-safe causal development history |
| `docs/development/github-tracking.md` | Repository-specific remote tracking contract and mapping |
| `.agent-context` | Ignored private resumption state, not public product documentation |

Keep each fact at its owning layer and cross-reference it rather than copying
private context into public documentation.

## 3. Workstream lifecycle

Use stable IDs such as `ic-01`, numbered filenames, and all eight required
fields: Status, Milestone, Dependencies, Purpose, Tasks, Acceptance criteria,
Completion evidence, and Completion log.

`NOT_STARTED` means execution has not begun; `IN_PROGRESS` means active with
incomplete criteria; `BLOCKED` requires an explicit blocker; `DONE` requires
evidence for the defined outcome. Dependencies are real prerequisites, not
inferred from numbering.

One actual workstream maps to one repository issue and one issue-backed item
on the configured Project. Index and perpetual ledger are excluded. Follow
[the tracking policy](github-tracking.md) for remote changes and conflicts.
If a workstream's accumulated log exceeds GitHub's 65,536-character issue-body
limit, move the historical completion log verbatim into the existing perpetual
ledger, retain a current Completion log plus exact navigation in the workstream,
and verify preservation before mirroring. Do not truncate evidence, split the
stable workstream into duplicate issues or silently publish a partial body.

## 4. Bounded execution

Read the current state and affected sources. Define an observable outcome and
exclusions before editing. Reuse existing helpers, preserve unrelated work,
surface errors, and add focused checks for the behavior changed.

For documentation-only setup, review meaning, navigation, status consistency,
tracking read-back, and privacy boundaries. There is no application build or
test suite was present at initialization. The prototype now uses `npm run lint`,
`npm run build`, `npm test` and `npm run test:desktop`; `npm start` builds and
launches the desktop app. See [the prototype guide](../prototype/prototype.md).

For the connected speech/controller/scheduler source, use `npm run test:voice`,
`npm run test:controller` and `npm run test:host` for focused boundaries.
Keep native recognition quality gates separate from unit/fixture passes.
Local .15 packages the pinned model/runtime with build-time verification and
license notices, automatically resolving bundled defaults on fresh profiles.
Prepared-folder overrides are not installation; packaging a native-optimized
local GPU runtime does not qualify generic portability. Do not equate high token probability with correct
session names or waive a failed exact-target recognition assertion.

Record action, immediate effect, rationale, mechanism, evidence, and next
consequence in the ledger. Preserve failed attempts and superseded decisions
instead of rewriting history.

## 5. Living engineering documentation

Add architecture and subsystem guides only when source or an explicitly
approved design supports them. Explain ownership, data flow, normal/failure
paths, cancellation, invariants, trade-offs, and how to verify changes.

Use dedicated algorithm/data-structure and design-principle chapters when they
explain real mechanisms. Cite exact source files and symbols. Prefer vertical
diagrams with captions and keep editable sources. Screenshots require actual
inspection and explanatory captions; fixtures must be labelled.

Books, rendered editions, and exhaustive atlases require deliberate scope,
source inventories, actual output review, and separate publication clearance.

## 6. User-instance protection

The initial setup created no runtime. Prototype tests now launch their own
Electron windows with disposable profiles, synthetic media devices and fixture
mesh/work IPC for deterministic scenarios. Explicitly consented live checks use
the actual private mesh and designated existing idle session; portable startup
also verifies actual mesh loading without sending a work prompt. No physical
microphone is driven by these tests. Do not infer that unrelated desktop processes
belong to this project.

Before future runtime changes, identify protected and candidate build paths,
process ownership, profiles, mutable state, backends, and exclusive resources.
Use disposable test data. Verify save/reopen while the candidate rebuilds or
fails in an isolated representative setup; do not drive the user's active app.
Coordinate unavoidable interruption and candidate promotion. Code rollback
does not undo a data migration.

## 7. Completion and continuity

The 2026-11-13 owner run failed at concurrent tool permissions despite earlier
component, fixture and portable checks. The owner rejected the experience and
paused implementation. Preserve that failure in the README and development
ledger rather than replacing it with another successful test count. Any
future resumption needs owner authority and evidence for the complete
delivered interaction, including real permission handling and partial-work
recovery; technical completion is not human acceptance.

Reconcile workstream, index, public ledger, guides, issue, and Project state.
Keep technical evidence, environmental qualification, user acceptance, and
publication separate. Local authoring is not a commit or push.

Hydrate and maintain only this base's private context store. Persist milestones
and exact outstanding work, offload at least every twelve active hours, and
refresh Context Mesh after coherent persistence batches. Follow installed
context skills for the exact protocol and owned social identity.

Use full absolute artifact paths in local handoffs. Do not upload context,
credentials, private evidence, or local configuration as part of tracking.
