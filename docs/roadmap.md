# Intercom roadmap

## Current authorization

Architecture and roadmap only. The following workstreams describe future work;
creating TODOs/issues does not authorize implementation, microphone use,
provider access, agent execution, service activation, commits or deployment.

Confirmed product intent is in the [brief](product-brief.md); component and
event contracts are in [architecture](architecture.md); speech choices remain
open in [speech options](speech-options.md).

Performance/speed is the top priority and default. Selectable processing
priorities are required; proposed Speed/performance, Balanced and Accuracy
profiles need measured settings, not just different labels. Every gate retains
correct targeting, permission enforcement and honest outcome reporting.

## Sequence and exit gates

| Phase | Workstream | Observable exit gate |
|---|---|---|
| 0. Define | ic-02, in progress | This design is recorded. Remaining stack, privacy, permission and provider decisions are explicit; finalize them from the two qualification receipts below before app implementation. |
| 1. Prove Agency | ic-04, not started | On a separately authorized disposable session, discover/identify the existing Agency session, preserve configuration, dispatch once, observe the right outcome, and demonstrate handoff/approval/cancellation limits. Active attachment and dormant resume reported separately. |
| 2. Choose speech | ic-05, not started | Same-scenario local/cloud comparison, local wake proof, measured timing/resources, human listening, model licenses and explicit provider/privacy selection. Can proceed independently of ic-04 after authorization. |
| 3. First desktop slice | ic-06, not started | Wake, speak, clarify if needed, select one real Agency session, hand off or run an authorized task, display evidence-backed graph activity, and deliver an accurate spoken outcome. |
| 4. Reliability | ic-07, not started | Restart/reconnect, uncertain dispatch, duplicate events, competing sessions/workspaces, audio/device failure and lifecycle behavior qualified without stealing the user's session. No release is implied. |

ic-04 and ic-05 depend on the completed foundation, not on final product
selection: their findings inform ic-02. ic-06 depends on all three.
ic-07 depends on ic-06. This avoids a product-definition/feasibility cycle.

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
