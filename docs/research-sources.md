# Architecture research evidence

Checked 2026-11-10. These primary documents establish documented capabilities,
not an Intercom runtime, account entitlement or measured performance.
Upstream main/latest pages are mutable; pin source/runtime/artifact versions
in the future qualification receipt. Installed CLI behavior takes precedence
over an assumption based on newer upstream documentation.

| ID | Primary source | What was actually established |
|---|---|---|
| R01 | [Tauri process model](https://v2.tauri.app/concept/process-model/) | Rust core, separate WebView processes and system WebView2 on Windows; not a RAM/latency benchmark. |
| R02 | [Tauri capabilities](https://v2.tauri.app/security/capabilities/) | Window/webview permission scopes, merged capabilities and important native-code limits. Custom registered commands require explicit manifest treatment to restrict their default exposure. |
| R03 | [Tauri frontend communication](https://v2.tauri.app/develop/calling-frontend/) and [sidecars](https://v2.tauri.app/develop/sidecar/) | Channels suit ordered streaming; ordinary events are not optimized for low latency/high throughput and are not granular capability checks. Sidecars require architecture-specific packaging/launch configuration. |
| R04 | [Windows installer](https://v2.tauri.app/distribute/windows-installer/) | MSVC/NSIS/MSI paths and WebView2 prerequisite, evergreen/offline/fixed-runtime trade-offs; no blank-shell size estimate transferred to this app. |
| R05 | [sherpa-onnx README](https://github.com/k2-fsa/sherpa-onnx/blob/master/README.md) and [documentation](https://k2-fsa.github.io/sherpa/onnx/index.html) | Windows platforms, Rust/C/C++ and other APIs, streaming/non-streaming ASR, TTS, VAD and keyword spotting; no approved model/binary combination. |
| R06 | [Keyword spotting](https://k2-fsa.github.io/sherpa/onnx/kws/index.html) | Open-vocabulary phrase tokenization, boosting/threshold trade-off and language-specific model candidates; not universal language coverage or authentication. |
| R07 | [sherpa TTS](https://k2-fsa.github.io/sherpa/onnx/tts/index.html) and [code license](https://github.com/k2-fsa/sherpa-onnx/blob/master/LICENSE) | Multiple synthesis families; project code is Apache-2.0. Exact model/voice/phonemizer rights remain separate. No audio was listened to. |
| R08 | [Windows AEC control](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nn-audioclient-iacousticechocancellationcontrol) | Build 22621 API floor; endpoint-dependent `GetService` and render-reference selection. This is not a software AEC implementation or acoustic quality guarantee. |
| R09 | [whisper.cpp README](https://github.com/ggml-org/whisper.cpp/blob/master/README.md) | Windows MSVC, CPU/GPU paths, quantization and model resource examples; wrapper is ASR, not a complete conversation/wake/TTS system. Published examples are not this machine's results. |
| R10 | [Tokio processes](https://docs.rs/tokio/latest/tokio/process/index.html) | Async child IO; concurrent reads/writes prevent deadlock; dropping a child does not ordinarily cancel it. Cleanup policy must be explicit. |
| R11 | [ACP session setup](https://agentclientprotocol.com/protocol/v1/session-setup) | Capability-checked load and optional resume semantics; not proof of installed Copilot support or live Agency attachment. |
| R12 | [ACP prompt turn](https://agentclientprotocol.com/protocol/v1/prompt-turn) | Prompt/update/permission/cancel lifecycle, optional message IDs and updates outside live turns. No universal task-success meaning inferred from stop reason. |
| R13 | [ACP Rust library](https://agentclientprotocol.com/libraries/rust) | An upstream client/agent crate exists; writing a bespoke wire protocol is not the starting assumption. |
| R14 | [Copilot Rust SDK](https://github.com/github/copilot-sdk/blob/main/rust/README.md) and [getting started](https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md) | Rust client, managed runtime and external streams are documented. SDK JSON-RPC uses Content-Length framing and is distinct from ACP; examples do not prove Agency compatibility. Upstream default bundling/features must be inspected at the pinned release. |
| R15 | [OpenAI voice architectures](https://developers.openai.com/api/docs/guides/voice-agents) | Chained, Realtime and GPT-Live architectures; useful audible answer, task quality and human listening are separate evaluation dimensions. |
| R16 | [GPT-Live delegation](https://developers.openai.com/api/docs/guides/live-delegation) | Client-owned backend/context; delegation metadata lacks task text; commentary is paraphrased and playback is not acknowledged merely by append. Client and Responses delegation are different paths. |
| R17 | [API data controls](https://developers.openai.com/api/docs/guides/your-data) | No training by default is not zero retention. Endpoint/account eligibility and abuse/application-state retention require an actual selected-endpoint receipt. |
| R18 | [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) | Shared geometry/material instances, explicit update flags, bounds and GPU-resource cleanup. Batching/on-demand rendering here are Intercom design proposals, not measured gains. |
| R19 | [SQLite WAL](https://sqlite.org/wal.html) | One writer, same-host constraints, checkpoint/read-growth trade-offs and FULL/NORMAL durability differences; WAL is not automatically needed. |
| R20 | [rusqlite](https://docs.rs/rusqlite/latest/rusqlite/) | Rust SQLite wrapper and backup/limit interfaces; application schema, encryption, durability and retention are still application work. |
| R21 | [Tauri WebDriver testing](https://v2.tauri.app/develop/tests/webdriver/) | WebdriverIO service with native/embedded routes and browser-only mock mode; test hooks need explicit production exclusion. |
| R22 | [Electron performance](https://www.electronjs.org/docs/latest/tutorial/performance) | Measure actual bottlenecks, defer expensive setup and avoid blocking main/renderer. No universal shell benchmark follows from the checklist. |
| R23 | [CareerOS graph source](https://github.com/Zanark/CareerOS/tree/main/src/graph) | Earlier read-only source inspection established the spherical/orbit/glow reference. No new browser/visual/performance review in this research pass. |

## Installed evidence, not public API promises

The installed Copilot CLI 1.0.108 documentation was read through its build-local
documentation interface: ACP server flag, optional
`github.com/copilot/sessionEvent` notifications, foreground versus whole-session
idle, prompt completion, JSONL output, resume carry-over and approval behavior.
In particular, resume retains model/agent mode/allow-all state. Do not generalize
these entries into undocumented session-control commands.

Earlier installed Agency help established discovery/launch hints and the
resumable/browse-only/active distinction. This pass did not list actual sessions,
start a daemon, authenticate a new account, inspect private session databases
or send a prompt. Installed evidence is preserved privately, not copied into
public issue payloads.

## Scope and limits

Search discovery results were not treated as shell benchmarks. Primary pages
were read for the claims above; some long references were read in relevant
sections, not audited end-to-end. Two guessed Three.js manual URLs returned
404; no claims rely on them. The supported InstancedMesh reference supplies the
specific API evidence instead. A guessed Tokio documentation hostname failed;
the official docs.rs reference was then read successfully.

No binary/model downloaded, microphone/audio test, live API trial, model quality
comparison, native app, provider price estimate, installation or benchmark was
performed. These are the remaining [roadmap gates](roadmap.md), not hidden work
completed by documentation.
