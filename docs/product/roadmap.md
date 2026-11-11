# Intercom roadmap

## Current authorization

The owner requested the research push and then a prototype, and explicitly
approved Electron for that early prototype. Its initial fixture UI
was an authorized ic-06 sub-slice before the live integration prerequisites.
The later request authorizes an unsigned Windows prototype prerelease and
explicit microphone-device selection/brief checks. These exceptions do not
waive ic-02/ic-04/ic-05, authorize continuous listening/provider/agent access,
or grant production deployment. Subsequent authority selects local-English
push-to-talk, actual published-mesh loading every launch and confirmed work in
existing idle sessions. The [.4 coverage matrix](../prototype/prototype.md) records the
implemented slice and exact qualification limits. Manual terminal entry is not
automatic handoff, and saved native grants can suppress permission prompts.

Confirmed product intent is in the [brief](product-brief.md); component and
event contracts are in [architecture](../architecture/architecture.md); speech choices remain
open in [speech options](../research/speech-options.md).
The concrete candidate is in [technology decisions](../architecture/technology-decisions.md);
[runtime contracts](../architecture/runtime-contracts.md) and
[performance qualification](../research/performance-and-qualification.md) define its gates.

Performance/speed is the top priority and default. Selectable processing
priorities are required; proposed Speed/performance, Balanced and Accuracy
profiles need measured settings, not just different labels. Every gate retains
correct targeting, permission enforcement and honest outcome reporting.

## Sequence and exit gates

| Phase | Workstream | Observable exit gate |
|---|---|---|
| 0. Define | ic-02, in progress | This design is recorded. Remaining stack, privacy, permission and provider decisions are explicit; finalize them from the two qualification receipts below before app implementation. |
| 1. Prove Agency | ic-04, in progress | Existing idle conversation and one approved read-only ACP task pass. Native approval prompting without saved grants, automatic handoff and active attachment remain unqualified. |
| 2. Choose speech | ic-05, in progress | Bounded local-English push-to-talk passes with synthetic speech. Same-scenario comparison, wake proof, timing/resources and human/hardware acceptance remain open. |
| 3. First desktop slice | ic-06, in progress | Actual mesh, confirmed existing-session background work and spoken result are implemented in .4. Full-product wake/handoff, native-prompt and human/performance gates remain open. |
| 4. Reliability | ic-07, not started | Restart/reconnect, uncertain dispatch, duplicate events, competing sessions/workspaces, audio/device failure and lifecycle behavior qualified without stealing the user's session. No release is implied. |

ic-04 and ic-05 depend on the completed foundation, not on final product
selection: their findings inform ic-02. ic-06 depends on all three.
ic-07 depends on ic-06. The approved bounded prototype exceptions are not
evidence that every full-product prerequisite passed.

## Dependency-driven development packages

These are bounded packages inside the existing workstreams, not additional
issue identities, implementation authority or calendar commitments.

| Package / owner | Deliverable after authorization | Stop / exit evidence |
|---|---|---|
| A. Contract freeze / ic-02 | Approve initial OS/hardware/languages, privacy, permissions, listening/exit policy and test budgets; accept or revise the candidate stack | Decision register distinguishes accepted, proposed and blocked items. Final selection waits for B/C. |
| B1. Connector harness / ic-04 | Pure fixtures and fake-process adapter; exact runtime/transport identity, frames, approvals and event correlation | Negative tests pass without any real prompt, catalog crawl or service activation. |
| B2. Existing-session proof / ic-04 | Separately authorized disposable existing Agency session; configuration including effective permission policy; one bounded task | Evidence for dormant resume AND live attachment separately. If live control is unsupported, report a blocking product gap; no replacement SDK session. |
| B3. Handoff and recovery / ic-04 | Supported terminal ownership transfer, busy handling, cancellation, lost acknowledgment and read-only reconciliation | No competing writer, incidental daemon or blind redispatch. Capability receipt names unsupported cases. |
| C1. Native audio/wake / ic-05 | One capture/playback worker, local phrase, VAD, bounded buffers and device recovery | False/missed wake evidence, no ambient upload, AEC/reference-control and open-speaker limitations recorded. |
| C2. Speech and dialogue / ic-05 | One language-compatible local bundle and one consented cloud challenger; constrained intent adapter | Model/license/data receipts, same-scenario useful latency plus errors/cost; human voice and interruption assessment. |
| C3. Profile decision / ic-05 and ic-02 | Choose actual settings, warm-residency policy and approved resource thresholds | Speed default has measured behavior; Balanced/Accuracy do not imply unmeasured quality. No hidden provider failover. |
| D1. Host and durable core / ic-06 | Narrow Tauri commands/channels, job reducer, DB owner and notification outbox | Isolation, schema/migration/storage failure tests; no generic frontend shell access or production test driver. |
| D2. Mesh UI / ic-06 | Sanitized snapshot adapter, stable sphere, activity reducer, accessible list and reduced-motion mode | Malformed/stale mesh and WebGL loss handled; no guessed reads; graph load does not interrupt audio. |
| D3. First real loop / ic-06 | Wake to correct existing session, background task or handoff, continued conversation and grounded spoken outcome | First-slice scenario below passes on disposable data; human acceptance stays separate. |
| E1. Crash/lifecycle / ic-07 | Fault injection at each dispatch/outbox boundary, lock/sleep/quit, device/network failure | Unknown outcomes remain unknown; no process/session theft; replay cannot repeat side effects. |
| E2. Soak/resource qualification / ic-07 | Long wake/echo run and realistic voice/graph/agent contention | Report all failures, timing tails, full process-tree resources and actual supported limits. |
| E3. Release proposal / ic-07 | Document signing, WebView2/model distribution, clean install/update/uninstall and data policy | Readiness report only; publication/autostart/installation requires separate approval. |

B and C can be qualified independently once authorized. Their receipts complete
the open choices in A. D begins only after ic-02/ic-04/ic-05 pass and the owner
authorizes real integration; the authorized fixture UI is not that proof.
Reliability assertions are not postponed merely
because E contains broader fault injection.

The proposed source layout is a frontend, one Rust host, one native audio
worker, transport adapters and contract fixtures. No scaffolding is created by
this roadmap. Keep schema/identity/state reducers independent of Tauri/audio
so they can be tested without microphone, provider or installed Agency access.

## Decision receipts that unlock implementation

| Receipt | Required contents |
|---|---|
| Agency | Exact installed versions, launch provenance, effective permissions, same target identity/workspace, negotiated capabilities, event/approval/cancel/handoff evidence and unsupported limits |
| Speech | Device/OS/audio route, language/phrase, model/voice hashes and licenses, cloud endpoint/account policy, timings/errors/resources, full-duplex evidence and human preference |
| Product | Accepted stack/profiles, approved roots, retention/cloud consent, confirmation tiers, lifecycle, budgets and first-slice acceptance checks |

No phase completes because a diagram parses or an issue description matches.
Use [primary evidence](../research/research-sources.md) to distinguish documented support
from the installed/consented proof these receipts require.

## Proposed first end-to-end scenario

1. Enable listening explicitly in an isolated candidate app; say the selected
   wake phrase, then ask for a bounded task in a designated test project.
   A fresh profile starts in Speed / performance; an explicit priority choice
   persists locally and changes apply to subsequent requests, not running work.
2. Resolve the existing session; ask a spoken clarification if ambiguous.
3. Choose terminal handoff or background mode. Confirm any proposed side effects.
4. For background mode, dispatch once, let the conversation become available
   again, and observe request-correlated events without polling an agent.
5. Show the real target and observed dispatch/retrieval paths in the 3D mesh.
   Where read telemetry is unavailable, show unknown, not invented traversal.
6. On the qualified outcome, persist the receipt, notify, and speak what actually
   happened. If the task fails or needs permission, say that instead.
7. Interrupt speech without cancelling work; separately cancel a job and report
   the actual cancellation/side-effect boundary. Return to wake-only standby.

Use disposable local test data. An acceptable initial task can be read-only;
neither a code change nor access to production systems is needed to prove routing.
Keep the foreground voice responsive while a task runs; do not promise a
particular latency until the target configuration is measured.

## Required negative scenarios

- Missing, browse-only, busy or ambiguous session; incorrect/missing launch profile.
- Existing live session cannot be attached: stop, report the limitation, and
  obtain scope approval rather than opening a competing writer.
- Permission prompt, refused action, failed tool, subagent idle or attached shell
  still running: no false "done."
- Lost connection after send but before acknowledgment: outcome unknown, no
  blind redispatch. Duplicate events create one durable result/outbox record.
- Wake false positive, self-echo, incomplete utterance, missing microphone,
  interrupted playback, cloud outage and denied cloud consent.
- Stale/incompatible mesh, invalid edge endpoints, no read telemetry, reduced
  motion or lost WebGL: accessible status and fallback, not fabricated activity.
- Switching priority while a task runs, stale saved settings, unavailable model
  settings or graph load: explicit behavior, no surprise provider switch and no
  faster but incorrect route. Compare useful-response timing and error rates.

## Deferred beyond the first slice

Cross-machine orchestration, simultaneous autonomous writes, arbitrary desktop
automation, screen capture, cloning a person's voice, continuous cloud ambient
audio, a new social network, hosted dashboards, and automatic startup are not
part of the approved design scope. Distribution/update signing, installers,
release budgets and wider OS support need later explicit decisions.

No calendar estimates are asserted before the integration and speech gates.
