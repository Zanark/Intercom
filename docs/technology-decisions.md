# Technology decisions and alternatives

Research date: 2026-11-10. These are engineering recommendations for the
documentation-only design, not installed dependencies, measured winners or
owner acceptance. Evidence identifiers refer to [primary sources](research-sources.md).
The [runtime contracts](runtime-contracts.md) define how these parts fit together.

## 1. Recommended baseline

| Layer | Pick for the first qualification candidate | Why / remaining gate |
|---|---|---|
| Initial platform | Windows 11 x64; propose build 22621 or later | Matches the current environment and the documented AEC-control API floor. An OS version does not guarantee endpoint AEC. Owner approval and device qualification still required. |
| Desktop shell | Tauri 2, using system WebView2 | Avoids bundling Chromium/Node for the shell; Rust owns authority and jobs. Actual total memory/startup/voice latency must be measured. R01-R04. |
| Host | Rust, Tokio, Serde; one supervisor and one database owner | Typed state, async child streams, bounded channels and explicit cancellation. Blocking inference/database work stays off the host/UI event loop. R10. |
| UI | React + TypeScript + Vite | Familiar web component model, small static bundle, shared types generated from host schemas. No server rendering, Next.js or production Node service needed. This is a design choice, not a measured framework comparison. |
| Graph | Three.js directly, owned by a React lifecycle component | Retains the CareerOS visual approach while keeping frame updates outside React reconciliation. Instanced nodes and shared buffers where profiling warrants them. R18. |
| Local speech | sherpa-onnx inside an isolated native audio worker | Windows, Rust/C/C++ APIs, keyword spotting, streaming ASR, VAD and TTS are documented. Exact model/language/voice artifacts need independent qualification. R05-R08. |
| ASR challenger | whisper.cpp, not an always-running second recognizer | Windows support, multilingual models and quantization; compare only when language/name accuracy justifies its cost. Its streaming example is not proof of a native streaming model. R09. |
| Cloud conversation challenger | GPT-Live client delegation | Matches independent Agency work while spoken conversation continues. Explicit audio consent, account access, native transport and outcome-paraphrase checks gate use. R15-R17. |
| Agency transport | Prefer supported Agency control; qualify Agency-wrapped ACP using the Rust ACP crate | Standard protocol/library exist; existing Agency session control remains unproved. No direct SDK runtime substitution. R11-R14. |
| Durable state | SQLite through rusqlite; a single host-owned writer | Local transactional job/outbox state without a server or ORM. Begin with rollback journaling; enable WAL only if measured read contention warrants its extra machinery. R19-R20. |
| Credentials | Windows credential APIs in the host | Never renderer storage or configuration committed to Git. Sensitive queued payload encryption and retention require a separate approved data policy. |
| Tests | Rust unit/contract tests, Vitest for UI reducers, WebdriverIO for the native candidate | Mock transports first; real-device/Agency/provider tests remain separately authorized. Native WebView tests are not replaced by browser mocks. R21. |
| Packaging | Windows MSVC build; later per-user NSIS installer with WebView2 prerequisite handling | Native speech DLLs/models dominate more than a shell-only installer claim. Signing/update channels remain release gates. R04. |

These are not a dependency manifest. Pin the actual compatible compiler,
Tauri/plugins, frontend packages, native DLLs, model hashes and protocol/runtime
pair when implementation is authorized. Do not copy upstream `latest` into a
production lockfile or upgrade the user's Agency installation incidentally.

## 2. Why Tauri now, rather than the earlier Electron recommendation?

The first architecture recommended Electron for a straightforward TypeScript
host and the known Three.js reference. The user's speed-first requirement
deserves a stronger examination of persistent idle and resource cost.

Tauri uses the operating-system WebView and a Rust core; Electron carries its
own browser/Node runtime. This is an architectural footprint distinction,
**not a benchmark establishing that Tauri makes speech faster**. Both use
multiple processes. WebView2 still consumes CPU/RAM/GPU, and its update/version
variability becomes part of the test matrix. R01-R04.

| Candidate | Strong reason to use it | Reason not to make it the baseline |
|---|---|---|
| Tauri 2 + Rust | Native host and audio integration without a required JS runtime in production; system WebView | Rust/native packaging cost; WebView variability; capabilities and custom commands need deliberate configuration. |
| Electron + TypeScript | Mature desktop ecosystem, consistent bundled browser, easy Node SDK integration | More bundled runtime; native speech still needs a worker; blocking imports/I/O and eager setup can hurt startup. Official guidance insists on measurement, not generic performance promises. |
| .NET + WebView2/native UI | Strong Windows integration and a possible fit if existing qualified .NET components dominate | Adds a different host/toolchain; native 3D UI is not a drop-in reuse of the Three.js reference. Not benchmarked or ruled out as technically inferior. |
| Flutter/native scene | Viable cross-platform UI/native integrations | A separate 3D rendering/interaction path without a demonstrated benefit for this specific reference and Windows-first scope. |
| Browser/PWA only | Small installation story | Not the selected authority boundary for reliable local session/process ownership, tray lifecycle and native audio. |

Keep Electron as the explicit fallback if the Tauri candidate fails native
audio/WebView integration or its development/operational cost exceeds the
measured resource benefit. Compare the same audio worker, graph, mesh and
connector; do not compare a blank Tauri window with a complete Electron app.
No numerical memory savings or startup multiplier is asserted.

The official Copilot SDK now documents a Rust client as well as other
languages. A Node sidecar is therefore not inherently required just to use that
SDK. Its documented default CLI/runtime management still needs review: a Rust
API does not establish Agency wrapping, configuration fidelity or live attachment.
Prefer an external, explicitly selected transport if it passes qualification.
Do not copy the SDK quick-start's approve-all permission handler. R14.

## 3. Native audio and speech choices

Choose a **Rust audio-worker executable** first, using Windows audio APIs and
the upstream sherpa Rust binding where qualified. If the required binding lacks
a capability, evaluate the stable C interface behind that worker rather than
moving inference into the UI or creating a bespoke speech engine. Native code
and DLL faults stay outside the durable host process.

Do not ship Python, PyTorch, a local HTTP AI server, CUDA, or a separately
managed Node service by default. They may become explicit candidates only when
measured functionality warrants the installation, memory and maintenance cost.
CPU inference is the portable qualification baseline, not a claim that CPU is
always faster or that a GPU is unavailable.

| Stage | Initial candidate | Selection rule |
|---|---|---|
| Capture/playback | WASAPI shared-mode device streams in the worker | Preserve device format, resample at a defined boundary, test hot-plug/default-device changes. Capture is independent of WebView visibility. |
| Wake | sherpa open-vocabulary keyword spotting | Check language/token vocabulary and false activations on the selected phrase. Changing keywords does not mean every language/accent works without evaluation. R06. |
| VAD/endpointing | sherpa-supported VAD plus explicit turn controller | Speech activity is not a complete conversational end-of-turn decision; pauses, corrections and max duration need tests. |
| Streaming ASR | A sherpa streaming model matching the chosen spoken languages | Qualify project names, code-switching, quantization and real-time factor. An English-only model must not masquerade as multilingual. |
| Multilingual ASR challenger | whisper.cpp multilingual model | Compare one appropriate size/quantization, not every model. No speculative always-on dual decoding. |
| TTS | One sherpa-compatible voice, with Kokoro/VITS families as candidates | Code, model, voice, phonemizer/data licenses and pronunciation all need a receipt; wrapper licensing does not settle them. R07-R09. |
| Cloud voice | GPT-Live client delegation; chained cloud speech as a control | Compare complete useful-answer latency, task correctness, interruption and cost, not only time to a filler acknowledgment. |

No exact ASR/TTS model is selected because the required spoken languages,
hardware and human voice preference are still unknown. Select after the
bounded evaluation, not by guessing a model from the user's typed language.
Local chained speech is the first **engineering baseline**, not an assertion
that it must win the user's eventual Speed profile.

### Echo cancellation is a real platform gate

Microsoft documents `IAcousticEchoCancellationControl` from Windows build
22621. `GetService` can fail with `E_NOINTERFACE`; the endpoint may lack
reference control, and even successful reference selection is not a quality
measurement. A generic microphone API, VAD or speaker loopback is not AEC. R08.

First qualify OS-provided processing for the actual capture/render endpoints,
including Bluetooth route changes. If insufficient, investigate a maintained
software AEC integration with synchronized render references and explicit
build/license cost. It is not silently part of sherpa keyword detection.

A headset or visibly labelled half-duplex mode is a fallback, not proof of the
requested natural full-duplex experience. Keep a physical/UI stop control.
Do not advertise reliable voice barge-in on open speakers until it passes.

## 4. Foreground reasoning is not the coding-session backend

Speech recognition yields words, not routing authority or general conversation.
Use three ordered paths:

1. Deterministic local controls and exact approved aliases: mute, stop speech,
   show an existing receipt, choose an explicitly named session.
2. A constrained dialogue/intent adapter for open-ended speech. It proposes a
   typed intent using only approved metadata; it cannot execute arbitrary tools.
3. The selected existing Agency session does the actual coding/research work,
   after host validation and permissions.

For local speech, qualify one restricted text-dialogue model/service; the
specific model and entitlement remain open. It must not be the same busy
session that is executing the user's background job. A new restricted dialogue
session, if approved, does not replace the required existing work sessions.

For GPT-Live, client delegation lets the app retain routing and job authority.
The delegation event contains metadata, not the user's complete task; retain
bounded conversation context and finalized intent separately. A delegation
must not immediately authorize a side effect from an incomplete transcript.
`session.commentary.append` is paraphrased speech, not exact-output playback
or evidence that the result was heard. R15-R16.

Prefer direct receipt-to-speech over a separate summarization model call for
simple outcomes. Rich summaries are grounded in the receipt, never inferred
from idle or a quiet terminal.

## 5. What we deliberately will not add

No Redis/Kafka, cloud job service, vector database, graph database, Kubernetes,
agent framework stack, global session daemon or local web server is required
for the first slice. Hash maps for identity/aliases, adjacency lists for
topology, a bounded event stream and SQLite solve the defined local problem.
Add semantic retrieval only if measured ambiguity/scale defeats simpler
approved metadata lookup; embeddings are not necessary to draw a mesh.

No custom MCP server is assumed to expose Agency sessions. MCP is not evidence
that such a control interface exists. ACP and SDK JSON-RPC are also separate
protocols: their framing/events/cancellation must not be mixed.

## 6. Version, licensing and supply-chain gate

Record source URLs, exact releases/commits, file hashes, ABI/architecture,
native runtime dependencies, model/voice licenses and notices in an artifact
manifest. Use trusted executable paths and verify sidecars; do not resolve a
binary from an untrusted workspace or extract models over executable files.
Review model download/extraction limits and fail explicitly on invalid assets.

Keep application, model and WebView2 distribution/update policies separate.
Evergreen WebView2 avoids bundling its runtime, but prerequisite installation
can require network; offline/fixed-runtime packaging changes that footprint.
Do not assume webview patches arrive on every managed machine. R04.

The qualification receipt must include the installed Agency/Copilot identity
and negotiated capabilities. Compatible patch updates should pass contract
tests; a changed protocol/policy must fail visibly rather than launch a
different engine. All live compatibility checks require separate authorization.
