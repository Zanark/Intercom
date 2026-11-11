# Performance and qualification plan

Speed/performance is the confirmed default. This is a proposed measurement
and release-gate design, not benchmark results, approved SLOs or executable
tests. Read [technology decisions](../architecture/technology-decisions.md) for candidates.

## 1. Optimize the critical path, not the screenshot

```text
observed end of speech
 -> endpoint decision -> final transcript -> intent/target resolution
 -> policy/clarification/confirmation -> dispatch acknowledgment
 -> first useful backend result -> outcome verification
 -> synthesis/audio arrival -> actual playback
```

Some stages overlap during streaming; measure their spans and the end-to-end
trace rather than adding unrelated p95 values. Measure human clarification
and approval time separately but do not erase it from user-experienced timing.
Code/research job duration is not the same metric as voice response latency.

Use host monotonic timestamps for durations and UTC wall time for receipts.
Correlate worker clocks explicitly; provider timestamps need a stated alignment
or an arrival-time label. First audio received is not first audio played.
Warm cache numbers are not cold-start results.

| Metric | Definition / evidence |
|---|---|
| Ready-to-listen | Launch request to functional wake detection; report cold process/model and warm cases separately |
| Standby footprint | Entire Intercom process tree, audio worker, WebView/GPU contribution and model residency; not host process alone |
| Wake response | Known phrase boundary to detected activation and cue; pair with missed/false wake rates |
| Finalization latency | Reference end-of-speech to accepted final transcript; include endpointing delay |
| Useful spoken response | Reference end-of-speech to audible substantive answer or necessary clarification; report filler separately |
| Dispatch overhead | Approved finalized request to correlated backend acknowledgment; exclude neither serialization nor durable commit |
| Outcome notification delay | Qualified outcome durable commit to visible notification / actual permitted playback |
| Interruption | User's qualified interruption to stopped playback; also count false stops/self-echo |
| Frame responsiveness | Frame-time distribution and input delay while voice plus agent load run |
| Processing quality | Intent/target correctness, name/number errors, ambiguity handling and task acceptance |

Do not claim a shell choice alone meets any of these metrics. ASR endpointing,
network/model first-token delay, extra router calls, GPU contention, synthesis
buffering and cold initialization can dominate.

## 2. Initial optimization order

1. Establish the exact approved target without a model turn when an alias is
   unambiguous. Resolve ambiguity rather than making a fast incorrect guess.
2. Use a lightweight local wake detector, one capture stream and bounded work.
   Warm only the selected speech bundle while listening is enabled; compare
   cold-first-turn cost against idle residency. Do not keep every model hot.
3. Stream ASR and sentence-bounded TTS; cap queued playback so interruption is
   meaningful. Never execute from a partial transcript.
4. Reuse a qualified connection only while its ownership/configuration remains
   valid. Do not repeatedly start a CLI process or load the full session history
   per utterance; supported lightweight resume is a negotiated capability.
5. Cache approved mesh projection/indexes. Fetch bounded relevant metadata,
   not every context store, raw chat or social entry.
6. Use passive event readers and local deterministic receipts; no model-based
   completion polling or mandatory extra summarization pass.
7. Pause idle/hidden decorative rendering. Bound inference threads so the
   worker, agent and compositor do not all oversubscribe the machine.

## 3. Concrete profiles without fictional model knobs

The following are proposed policies. Profile labels remain subject to owner
acceptance. Store a versioned immutable settings snapshot with each request.
Provider, model, language and budget selections are separate consented settings.

| Control | Speed / performance, default | Balanced | Accuracy |
|---|---|---|---|
| Routing | Exact approved alias first; bounded metadata and one constrained interpretation when needed | Same fast path; more relevant context only when useful | Same fast path; extra ambiguity/acceptance review for complex tasks |
| Speech configuration | Fastest **qualified** bundle for required languages | Qualified middle trade-off only if measured | More accurate qualified bundle only if evidence supports the label |
| Decode/reasoning knobs | Only advertised and tested controls; no arbitrary beam/model-setting guesses | Same constraint | Same constraint |
| Context loading | Minimum relevant approved context | Broader bounded retrieval when justified | Additional relevant evidence, not the whole mesh |
| Task verification | Required checks always | Required checks always | Required checks plus justified deeper checks |
| Graph detail | Adaptive decoration, paused at idle | Same resource safeguards | Same resource safeguards; Accuracy does not mean extra bloom |

Changing profile affects future requests, never silently mutates in-flight work.
An unavailable configuration yields a visible choice or an explicitly labelled
effective profile; no hidden cloud fallback, surprise spend or ignored setting.
If no measured configuration differs, show that fact rather than three labels
that imply unearned capabilities. A saved unknown profile/schema is rejected
with a migration/reset decision, not silently accepted.

## 4. Reproducible experiments and evidence ladder

Start with synthetic or explicitly consented recordings. Keep source audio,
expected intent/target/side effects, transport version, model hashes, settings,
audio device/route, OS/WebView version, power state and concurrent load fixed.
Do not record the user to prepare this document.

| Level | What it can establish | What it cannot establish |
|---|---|---|
| Pure reducers / fixtures | State transitions, routing collisions, stale events, deduplication and permission rules | Live Agency, microphone or provider compatibility |
| Fake process/transport | Framing, stderr flood, split frames, oversized messages, exit/reconnect/approval races | Supported control of an existing Agency session |
| Native isolated app | Host/IPC/WebView lifecycle and rendered interaction | Real audio quality or backend task correctness by itself |
| Authorized disposable existing Agency session | Actual identity/configuration/control/terminal outcomes for the pinned pair | Universal session/provider or future-version compatibility |
| Consented device/provider runs | Measured latency, quality, echo, interruption and cost for that setup | Claims about untested devices, networks or languages |
| Human acceptance | Voice/graph usability for the intended workflow | Permission to publish/install/autostart automatically |

Use one runner per layer rather than installing several overlapping browser
frameworks. Prefer Rust tests plus Vitest and the documented WebdriverIO Tauri
route. Test-only embedded driver/backend hooks must be absent in production.
Browser-only command mocks remain labelled renderer tests. R21 in
[sources](research-sources.md).

For initial experiments, propose at least 30 repeats per short timing scenario,
with a documented warm-up policy and all failures retained. This is a starting
sample, not statistical proof of a reliable p95; expand tail/soak testing before
claims. Report median, p95, sample count, failure/timeout rate and cold/warm split.
Run long ambient wake/echo sessions separately; a few successful phrases do not
measure false wakes per hour.

Compare Tauri and Electron with the same worker, visual detail and workloads
only if shell cost remains a material uncertainty. Compare one local speech
bundle and one consented cloud challenger first, changing one factor at a time.
Do not spend GPU hours exploring unrelated models.

## 5. Proposed budgets and tuning contract

Do not invent hard latency, idle-RAM or CPU limits without the target machine
and device/network baseline. At the qualification gate, record owner-approved
limits for ready-to-listen, standby CPU/private bytes, useful-answer p95,
interruption p95, peak inference RAM/VRAM, audio dropouts and graph frame time.

A 60 FPS visual goal gives a 16.7 ms frame budget; it is not measured behavior
or an obligation to render 60 frames while idle. Voice correctness and capture
continuity outrank decorative smoothness. Count all process-tree resources and
state whether shared pages/GPU memory are attributed or merely observed.

Every queue/buffer needs an explicit implementation limit: audio pre-roll and
utterance duration, PCM ring capacity, IPC frame size, pending commands,
transcript window, graph import size, event backlog, TTS audio and DB/log
retention. Derive values from measured producer/consumer rates and recovery
needs; expose overflow outcomes. "Bounded" without a tested limit is unfinished.

## 6. Highest-value negative tests

| Scenario | Required behavior |
|---|---|
| Two identical spoken aliases / stale catalog | Clarify/revalidate; zero wrong-target dispatch |
| Busy existing session / shared workspace | No second writer or stolen session |
| Resumed session retains allow-all | Detect unsupported/unsafe policy; block rather than assume mediation |
| Replayed final transcript / duplicate delegation | One approved job, not repeated side effects |
| Correction between confirmation and send | Invalidated approval; re-confirm the changed request |
| Lost acknowledgment / crash at dispatch | Unknown and read-only reconciliation; no automatic retry |
| Subagent idle / failed tool / attached process | No false success |
| Cancellation races with success / permission prompt | One coherent disposition; prior side effects stated |
| Worker/TTS restart / stale audio chunk | No old speech or stale request executed |
| Echo / TV wake phrase / Bluetooth device switch | No unintended authority; visible listening/AEC limitation |
| Disk full / corrupt or newer DB schema | Block new dispatch; preserve failure evidence |
| Malformed mesh / partial file / WebGL loss | Visible stale/fallback state; no fabricated reading paths |
| Minimize / lock / sleep / quit during work | Defined lifecycle, privacy and reconciliation; no silent abandonment |
| Forged UI command / instruction inside tool result | Host authority unchanged |

## 7. Cost and rollout

Keep separate accounting for voice session duration, ASR/TTS usage, dialogue
reasoning, Agency work and local power/resources. A Copilot entitlement is not
speech API access. Build estimates from the chosen provider's dated prices,
billable units and expected duty cycle; no dollar estimate is justified yet.
Cap cloud conversation lifetime/usage and report quota/budget exhaustion.

Ship nothing before connector and speech gates pass. Later distribution must
qualify a clean Windows install, missing WebView2/native DLLs, model integrity,
signature verification, user-data-preserving updates and rollback compatibility.
Uninstall must distinguish binaries/models from explicit user-data deletion.
Telemetry and crash upload are opt-in decisions, not assumed infrastructure.
