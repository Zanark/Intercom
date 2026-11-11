# Speech options: research before selection

**Final product decision pending.** The user subsequently selected a bounded
prototype using installed Windows en-US `System.Speech` recognition and local
English playback, with click-on/click-off capture and no model download.
Synthetic English recognition is verified, including phrases separated by
pauses; physical-microphone and human listening acceptance remain open.
No cloud audio/provider trial occurred. See [prototype](../prototype/prototype.md).
The following comparative research was checked 2026-11-10; availability,
pricing and data terms must be rechecked at final selection.

**Product priority:** performance/speed first and default, with user-selectable
priorities. Neither local nor cloud speech is presumed faster without evidence.

## Prototype voice profiles and the required future engine

Recognition and speaking-voice settings are independent. In the .9 candidate,
Windows en-US recognition below 0.35 confidence returns editable text marked
for explicit review, never automatic dispatch or work preparation. Confidence
remains the minimum across recognized phrases; the threshold is not lowered.
Transcripts over the 1,000-character request limit are retained up to a bounded
10,000-character result, but require manual shortening. Nothing is silently
truncated or split. Empty text and invalid confidence produce distinct errors.
This recovers uncertain results; it does not qualify human recognition accuracy
or introduce another recognition language/provider.

The owner selected **installed local voices for the prototype**, but made
**arbitrary voice identity, timbre and emotional style mandatory future
requirements**, not optional polish. Those richer controls are not supplied
by Windows System.Speech and are not implemented or downloaded here.

The desktop's **Voice profiles / customize speech** panel discovers enabled
installed voices on demand, showing their gender and culture metadata.
Gender selection filters voices; it does not transform a voice's identity.
Profiles save the exact voice, requested pitch (-12 to +12 semitones), Windows
rate (-10 to +10) and volume (0-100). Pitch response is voice/engine-dependent,
not a promise of calibrated acoustic intervals. Rate is not a measured
playback-speed multiplier. Volume 0 is silent. Recognition remains en-US
regardless of the speaking voice's culture.

Create a profile with **Duplicate profile**, edit its name/controls and
**Save & use profile**. Rename an existing profile through the same save action.
**Use saved profile** activates an unchanged saved profile; only an inactive
profile can be deleted. At most 32 named profiles are supported. Preview uses
the current draft without saving or activating it. **Stop preview** interrupts
playback, not work. Starting capture stops preview before opening the input;
voice controls are locked during microphone checks/recording/dispatch.

### Synthesis-provider boundary

`desktop/services/synthesis.cjs` separates profile persistence from provider-specific
validation, voice discovery and playback. `VoiceHost` owns the provider
registry; only `WindowsSpeechProvider` is currently registered:

- `id`, `label`, `controls`, `features`: stable provider identity, numeric
  control descriptors and explicit arbitrary-identity/timbre/emotion support.
- `validate(profile)`: reject invalid or unsupported parameters, never ignore
  them. `voiceId` is an opaque exact identity within that provider.
- `catalog(operation)`: return enabled voices and capability metadata on
  explicit discovery, honoring cancellation.
- `speak(text, profile, operation)`: play one validated, immutable profile
  snapshot; honor `operation.controller.signal`. Native adapters also track
  only their own child for bounded process-tree cleanup.

Conversation progress, replies, work completion and desktop fixture speech
all call the same host speech entry. A future adapter can replace synthesis
without changing session routing, confirmation, permissions or job execution.
The host cancels superseded speech explicitly; previews never dispatch work.
The native adapter passes structured JSON to `speech.ps1` and XML-escapes
spoken text before SSML. Its companion `speech.txt` is kept identical.
The internal render mode returns bounded in-memory PCM for non-audible native
qualification; no renderer render/file-write API is exposed.

Profiles are serialized to one atomic `voice-profiles.json` in the private
application profile, separate from session configuration. Reads are bounded
to 64 KiB. Only an absent file gets the standard default; malformed data and
missing providers produce visible errors. An explicitly selected missing voice
fails instead of silently substituting another. The default profile deliberately
uses the first enabled English voice, rate 1, pitch 0 and volume 100.
Saving/activating a profile affects later utterances, not playback already
in progress. Playback has a 180-second host bound.

Adding the required richer engine still needs its adapter, licensed original/
consented voice assets, richer parameter metadata/UI where needed, cancellation
and performance qualification. Network/audio/text handling, accounts, costs
and any model download need explicit approval. The provider seam does not
implement or authorize those features, and a fixture adapter is not an AI engine.

## 1. Common wake-word contract

Recommend a local keyword detector while explicitly enabled, even if the
conversation uses cloud speech. Open one conversation after the wake phrase,
permit follow-up turns, then return to standby on sleep/timeout.
The phrase, timeout, language coverage and activation thresholds remain open.
Standby must not stream audio to a provider. Wake detection is not authentication.

Separate keyword spotting, voice activity detection, end-of-turn detection,
speech recognition, intent interpretation, synthesis and echo control.
One library supporting several stages does not establish a working hands-free
conversation. Recognizing "stop speaking" must not imply "cancel all jobs."

## 2. Options and trade-offs

| Option | Evidence-backed candidate | Benefits | Costs and qualification risks |
|---|---|---|---|
| Local chained speech | sherpa-onnx keyword spotting, streaming ASR, VAD and TTS; whisper.cpp as an ASR comparison | Audio can stay on-device; independently replace stages; no metered speech API per turn. | Model downloads/licenses, native packaging, CPU/GPU/RAM competition, pronunciation and turn-taking need target-machine evaluation. Whisper ASR alone supplies neither TTS nor wake handling. |
| Cloud chained speech | Hosted transcription + separately generated speech, with the Agency connector remaining the task backend | Inspectable transcript/permission boundary; swap speech providers without changing session routing. | Audio/text leave the device; separate credentials, network latency, request cost and retention terms; natural timing/interruptions are application work. |
| Cloud realtime speech-to-speech | OpenAI Realtime API as one documented example | Integrated audio conversation and tool events, streaming speech and interruption support. | Hosted model/data/cost dependency; voice model must not become an unrestricted second coding agent; bridge tools need strict validation and approval. |
| Cloud voice with delegated backend | OpenAI GPT-Live client delegation as a documented example | Explicitly separates a live conversation from an application-owned existing backend. Conceptually close to Intercom. | Documentation is not an Agency connector; verify account/model availability, protocol fit, duration-based voice cost plus backend charges, privacy and interruption behavior. |

Local speech does not mean the whole system is offline: Agency/Copilot may use
hosted models and tools. Cloud speech does not automatically improve accuracy,
naturalness or latency on this machine; those are measurements, not assumptions.
A Copilot subscription does not establish entitlement to a separate speech API.

## 3. Recommended evaluation, not a provider choice

The concrete first candidate is a native sherpa-onnx worker for local keyword
spotting, streaming ASR/VAD and one compatible TTS voice. Compare whisper.cpp
only where multilingual/name accuracy warrants an ASR challenger; compare
GPT-Live client delegation for the natural full-duplex cloud experience.
See [technology decisions](../architecture/technology-decisions.md) for language/model/license
gates and [qualification](performance-and-qualification.md) for test evidence.
No exact model or voice has been selected.

Keep a provider-neutral chained boundary as the baseline. Compare it with the
delegated cloud voice route rather than claiming modular ASR/TTS will feel
identical to a native speech-to-speech conversation. Keep the local wake and
request/permission/job contracts independent of the voice provider.

Evaluate one viable local bundle and one viable cloud configuration using the
same consented or synthetic utterances, audio devices and request scenarios:

- Project/session names, technical words, dates, corrections, ambiguous targets,
  pauses mid-sentence, background sound and assistant playback.
- Required spoken languages and code-switching, once the user selects them.
- Wake false positives per hour, missed wakes, idle resource use and the
  maximum standby buffer. Never use a wake benchmark as speaker authentication.
- End-of-speech to first useful audible response, median/p95; measure a quick
  acknowledgment separately from the actual answer.
- Recognition/intent errors, spoken intelligibility and naturalness through
  human listening. Text output does not establish voice quality.
- Playback interruption, echo-induced self-wakes, device loss, offline/cloud
  outage, quota exhaustion, cleanup and long-running background job behavior.
- CPU/GPU/RAM with the 3D view and a coding agent running concurrently.
  Agree target hardware and budgets before setting numerical pass limits.
- Default speed-profile startup, standby, wake and useful-response latency
  first, then compare proposed Balanced/Accuracy settings against the same
  scenarios. Report quality regressions as well as any speed improvement.

Report setup/download size, licensing of code AND exact model/voice artifacts,
measured resources, usage accounting and a dated provider-data receipt.
Do not infer model licensing from the wrapper library. Do not download several
large models or record the user merely to prepare this paper comparison.

## 4. Privacy and cost differences

Local mode proposes volatile audio only; transcripts still need an explicit
retention decision. In cloud mode, enumerate audio, transcript, prompt and tool
result transmission separately. Send minimum result summaries, not the entire
Context Mesh/private session history. No silent fallback uploads.

OpenAI's API data-controls documentation says API data is not used for training
by default absent opt-in, but that is not zero retention. Abuse monitoring and
endpoint-specific application-state policies still apply; special retention
controls require eligibility/approval. Check the actual chosen endpoint and
account, not a generic promise.

Do not quote a dollar estimate before provider/model, region, expected active
conversation duration and usage are chosen. Local inference trades API cost
for hardware/power/maintenance; cloud voice and Copilot work are separate costs.
Keep an explicit speech budget and session timeout if cloud is selected.

### Native audio and full-duplex boundary

The proposed worker uses Windows capture/playback APIs, not PCM through React.
Microsoft's AEC reference-control interface starts at Windows build 22621 and
depends on the endpoint. `E_NOINTERFACE` means controllable render-reference
AEC is unavailable; it does not prove that no endpoint AEC exists.
Successful API calls also do not establish acoustic quality. Speakers,
Bluetooth/default-device changes, self-wake and interruption need real tests.
A labelled headset/half-duplex fallback is not full-duplex qualification.

For GPT-Live client delegation, metadata does not contain the user's complete
request. Keep bounded transcript/task state, wait for a finalized approved
intent and correlate delegation/job IDs. Spoken commentary is paraphrased:
appending it is not proof the user heard it or that a task succeeded.

## 5. Primary references

- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx): documents local ASR, TTS,
  keyword spotting and VAD; Windows and native Rust/C/C++ APIs as well as other
  bindings. Supported bindings do not qualify a particular model/runtime pair.
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp): documents Windows,
  CPU/GPU ASR, model resource examples and quantization; not a full voice stack.
- [Voice architectures](https://developers.openai.com/api/docs/guides/voice-agents):
  chained, realtime and delegated approaches, including evaluation dimensions.
- [Realtime API](https://developers.openai.com/api/docs/guides/realtime):
  WebRTC/WebSocket, audio interaction and trusted credential handling.
- [GPT-Live](https://developers.openai.com/api/docs/guides/live):
  client delegation and independent backend work.
- [API data controls](https://developers.openai.com/api/docs/guides/your-data):
  retention is endpoint/account-specific, not synonymous with no training.
- [Windows AEC control](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nn-audioclient-iacousticechocancellationcontrol):
  OS floor and endpoint-dependent render-reference support.
- [GPT-Live delegation](https://developers.openai.com/api/docs/guides/live-delegation):
  client-owned context/backend, delegation correlation and speech semantics.

No source establishes that a particular configuration works in Intercom yet.
