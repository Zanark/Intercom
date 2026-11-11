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

## 2. Canonical artifacts

| Artifact | Responsibility |
|---|---|
| `README.md` | Honest product stage and entry points |
| `docs/product-brief.md` | Confirmed direction, undecided requirements, first-slice gate |
| `docs/architecture.md` | Component overview and invariant boundaries |
| `docs/technology-decisions.md` | Candidate stack, alternatives and reversal gates |
| `docs/runtime-contracts.md` | Proposed IPC, routing, jobs, lifecycle and failure contracts |
| `docs/performance-and-qualification.md` | Speed-first profiles and evidence plan |
| `docs/research-sources.md` | Primary-source claims and qualification limits |
| `docs/prototype.md` | Actual desktop prototype controls, code mechanisms and limits |
| `AGENTS.md` | Contributor and agent execution boundaries |
| `TODO/00_INDEX.todo` | Stable workstream navigation and status |
| Numbered workstreams | Bounded tasks, dependencies, acceptance and evidence |
| `TODO/03_DEVELOPMENT_LEDGER.todo` | Public-safe causal development history |
| `docs/github-tracking.md` | Repository-specific remote tracking contract and mapping |
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

## 4. Bounded execution

Read the current state and affected sources. Define an observable outcome and
exclusions before editing. Reuse existing helpers, preserve unrelated work,
surface errors, and add focused checks for the behavior changed.

For documentation-only setup, review meaning, navigation, status consistency,
tracking read-back, and privacy boundaries. There is no application build or
test suite was present at initialization. The prototype now uses `npm run lint`,
`npm run build`, `npm test` and `npm run test:desktop`; `npm start` builds and
launches the desktop app. See [the prototype guide](prototype.md).

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

Reconcile workstream, index, public ledger, guides, issue, and Project state.
Keep technical evidence, environmental qualification, user acceptance, and
publication separate. Local authoring is not a commit or push.

Hydrate and maintain only this base's private context store. Persist milestones
and exact outstanding work, offload at least every twelve active hours, and
refresh Context Mesh after coherent persistence batches. Follow installed
context skills for the exact protocol and owned social identity.

Use full absolute artifact paths in local handoffs. Do not upload context,
credentials, private evidence, or local configuration as part of tracking.
