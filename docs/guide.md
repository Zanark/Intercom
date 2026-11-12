# Intercom project guide

[Visual home](../README.md) · [Prototype details](prototype/prototype.md)

**Current status, 13 November 2026:** the owner has paused Intercom after
rejecting the delivered experience. The live .18 work path stopped on concurrent
tool-permission requests; its outcome is unknown. The capability inventory
below is not an end-to-end acceptance claim. See the
[README accountability statement](../README.md#project-status-paused-after-failed-owner-acceptance)
and [development journey](../TODO/03_DEVELOPMENT_LEDGER.todo).

For the owner's clarified voice-overlay vision, what currently works and the
missing integrated experience, read the
[illustrated vision/reality report](reports/2026-11-12-vision-reality.html).
It records the pre-.16 gaps; the integrated local candidate below supersedes
its source-versus-executable inventory, not its human-acceptance caveats.

<img src="assets/branding/intercom-logo.png" alt="Intercom microphone and context-mesh logo with frosted sea-glass nodes and connections" width="144" height="144" />

The microphone represents voice; varied-size connected nodes, rounded outer
orbits and straight inner links represent the context mesh. Foreground links
and a node overlap the microphone to give the mark depth.

A voice-first desktop assistant for working with existing Agency/Copilot
sessions. Speak a request, choose terminal handoff or background execution, and
hear the result when the requested work finishes.

Its proposed visual surface is a 3D Context Mesh sphere: active context and
session paths light up while other relationships remain dimly visible.

**Top priority:** speed/performance by default, with selectable processing
priorities. The prototype saves the selection and bounds graph rendering;
background requests apply supported reasoning effort (low/medium/high) without
changing the existing model. Speaking-voice settings are separate from processing
priorities; measured speech quality and speed budgets remain unqualified.

**Stage:** Windows push-to-talk prototype with a local .18 candidate and included
on-device recognition, system microphone and local voice defaults. Click
**Speak** / **Stop & send**, or use the no-send speech check first.
The restricted Intercom controller interprets text
and clear plans target existing idle sessions; ambiguity still needs clarification,
real tools retain permissions and work returns durable receipts. Actual
multi-session and human multilingual qualification remain open. Every launch
reads the actual local Context Mesh snapshot.
Terminal mode opens the existing session for manual task entry, not automatic
handoff. No wake word, active-session attach or new sessions. Electron is approved
for the prototype, not selected as the final product host.

**Engineering recommendation:** Tauri 2 + Rust host, React/TypeScript + Three.js
UI, native local-speech worker and SQLite jobs. This revises the initial
Electron recommendation; hardware measurements and Agency/speech proof still
gate selection.

## Run the prototype

**Included in local .18:** recordings support up to five minutes.
Audio stays local and in memory. At the limit, capture stops automatically
and the final transcript waits for review, never automatic dispatch. Stop
earlier to retain the selected automatic-send behavior. Long transcripts stay
intact, but requests still need to fit 10,000 characters for Intercom or 1,000
for legacy/manual delivery. No automatic truncation or splitting.
Published .12 still has its historical one-minute capture limit. See
[qualification and limits](prototype/prototype.md#five-minute-recordings-source-only).

The latest **local-only, unsigned Windows x64 candidate is .18**:
`C:\devdesk\homedesk\Intercom\release\prototype-18-candidate\Intercom-Prototype-0.1.0-prototype.18-win-x64.exe`.
It includes warm native speech, five-minute capture, observed source-read
activity, cited research synthesis, approved glass/water visuals, isolated
portable extraction, persistent privacy-safe failure diagnostics and bounded
automatic clarification replies.
It is not a published GitHub release or a claim of human speech accuracy.

Open it and click the microphone: fresh profiles automatically use the included
on-device Whisper model/Vulkan engine, system-default microphone, automatic
language detection, Standard local Windows voice, speed-first processing and
Intercom routing. No recognition-folder selection, microphone discovery or
session-ID entry is required. Audio stays local. Initial capture starts on
click; a structured Intercom clarification can automatically open the next
bounded capture after the question finishes speaking.
Tool permissions remain manual, and installed/authenticated Copilot plus its
existing idle sessions remain environmental prerequisites for actual agent work.

Click the mic to finish your clarification reply; silence does not stop it
automatically. Muted questions remain written and can also start reply capture.
**Advanced > General > Delivery behavior > Automatically listen for
clarification replies** disables this default-on behavior. Stop playback,
Cancel, opt-out and hidden/minimized windows suppress pending opening.
Ordinary replies and tool-permission prompts never trigger it. The previous
unresolved request/question accompanies only the next accepted controller turn;
it does not approve tools. See [exact evidence and limits](prototype/prototype.md#local-18-clarification-replies).

For a no-send trial, use **Input > Speech check > Test speech locally**; stop
with the bubble. This check does not replace your draft. Existing explicit
legacy/custom recognition and microphone choices remain unchanged. The included
native-optimized Vulkan build is qualified on this development machine only,
not as a generic Windows/GPU distribution.

For optional previews while recording, enable **Talk > Live transcription
(local draft)**. It starts off on each mount to preserve the speed-first default.
These are serialized local batches using the same resident model, not
word-by-word streaming; each completed
preview is followed by a three-second wait. Previews never send requests.
Stopping cancels/settles preview work before final recognition; cancelling
discards previews and preserves your typed draft. This option uses more CPU/GPU.

The latest **published** prototype remains the unsigned .12:
[Download the .12 EXE](https://github.com/Zanark/Intercom/releases/download/v0.1.0-prototype.12/Intercom-Prototype-0.1.0-prototype.12-win-x64.exe)
from the [prototype prerelease](https://github.com/Zanark/Intercom/releases/tag/v0.1.0-prototype.12).
Only the local .18 executable and its checksum remain in `release`, following
owner-requested cleanup after exact portable verification on 2026-11-13.
Superseded .17 and candidate unpacking/build intermediates were removed only
after a fresh check found no running Intercom process;
published GitHub releases were not changed.

The duplicate-launch regression verifies that the primary model and resident
helper survive the rejected second launcher, then transcribes again. Missing
resources still refuse capture explicitly. Open **Advanced > Display > Local
diagnostics** for the persistent directory and **Open diagnostics folder**.
The default is
`C:\Users\mishrad\AppData\Roaming\IntercomVoicePrototype\diagnostics`.
Logs omit speech/request content; automatic failure snapshots contain process
metadata and resource presence, not memory contents. Storage failures appear
visibly. See [retention and recovery](prototype/prototype.md#local-diagnostics).
Close an older build before launching .18; no running app is switched for you.

Research now shows actual source checks, successful reads and failures in a
bounded activity trail; successful reads trigger finite mesh pulses. This is
observed host activity, not hidden model reasoning. Ordinary collection is
read-only and opens an extractive report. For a model-written synthesis,
explicitly select an existing idle session in the report controls, or clearly
name that exact session in the request. The normal durable queue, workspace
exclusions and manual tool approvals apply. Validated citations link retained
evidence; they do not prove semantic correctness. See the
[current .17 receipt](prototype/prototype.md#local-17-portable-lifecycle-repair).

Prototype .12 includes the microphone fixes since .7: session-independent local
capture/transcription, a stationary microphone in both views, a collapsed
single-row floating dock, accessible settings/transcripts and explicit review
of uncertain/long recognition. Hover or pin mesh nodes to identify them without
permanent labels. It also packages the reorganized repository and retains
named installed-voice profiles, pitch/speed/volume, deep graph zoom,
maximize/restore and confirmed existing-session background work.

The live source acceptance path captured synthetic speech, executed the exact
approved read-only `Get-Location` in the existing session, returned "Hello world."
and completed local playback. Existing saved grants meant no native permission
prompt appeared; approval mediation is tested with fixtures, not live-qualified.
The packaged candidate is qualified separately from that historical live task.
Physical FDUCE and human voice-quality acceptance remain unverified. Checksums,
the feature matrix and exact limits are in the [prototype guide](prototype/prototype.md).

Windows may show an unknown-publisher/SmartScreen warning; verify
the release checksum and follow your device's security policy.
No Node.js installation is needed to run the EXE. First launch extracts the
bundled Electron runtime; startup speed has not been benchmarked.

The [earlier fixture-only .1 prerelease](https://github.com/Zanark/Intercom/releases/tag/v0.1.0-prototype.1)
is preserved unchanged. The intermediate .2-.6 builds are historical
qualification records; their features are included in .12.

From `C:\devdesk\homedesk\Intercom` in PowerShell, with Node.js/npm installed:

```powershell
npm ci
npm start
```

## Current source: focused glass controls

Current source defaults to the **Intercom node**, not a designated work session.
Its restricted controller receives transcript text and minimal catalog metadata;
the host validates and durably queues clear multi-session plans without a
second target/task confirmation. Ambiguity still needs clarification and real
tools retain exact one-shot approvals. Background work does not occupy the mic.
**Work > Plans** offers request/action selectors and Activity / Permission /
Result tabs. Full details remain accessible inside bounded text areas.
An ordinary agent response is not independently verified task success.

The host enforces dependencies, excluded status targets and at most two
non-overlapping workspaces; recovery never automatically retries an uncertain
dispatch. Current checks pass 62 host cases, 19
renderer/recording cases and 11 controller cases. The full desktop suite passes
54 cases; the .17 unpacked package also passes nine focused cases. Actual portable
synthetic capture passes native local live-draft and final-recognition checks,
including X/Y exclusion preservation, same native PID reuse, shutdown and no
automatic send. The voice suite is 51/52: legacy Windows confuses synthetic
"please" with "police"; the strict assertion is retained.
These include exact permission routing and cancelled
interpretation. Fixtures are not real multi-session execution evidence.
Local Whisper recognition is now connected as described below. The older
portable dependency candidate predates this wiring; local .17 includes it,
and published .12 remains unchanged. See
[runtime contracts](architecture/runtime-contracts.md) for the exact boundary.

### Saved-context research

In local .17, ask for a project/context research report from **Talk**.
The controller receives the request and minimal mesh/catalog metadata, not
collected file contents. A distinct read-only host lane reads the four fixed
registered context notes and, when requested, exact indexed session histories.
It saves an illustrated, cited HTML report and JSON evidence under the app
profile's `research` directory and asks the OS to open the HTML default handler.
The receipt shows its full path; **Open context report** retries an opening
failure. Catalog notices stay collapsed and do not imply a context-read failure.

The report distinguishes project-name matches, topic references, recorded
requests, assistant statements, saved topology and unavailable sources.
Extractive summaries are not model-written conclusions. This is not a census
of all sessions ever or proof of live access. Ordinary collection sends no work.
Actual successful source reads produce finite mesh pulses and an attributable
trail. Explicit exact idle-session selection can request cited Copilot synthesis
through the normal durable work queue and manual permissions; source excerpts
then enter that session's provider context. Location validation is not proof
that a model's conclusion follows from the source.
Large histories stream within explicit limits; omissions and parser gaps are
visible. Generated reports remain private, outside publication artifacts.
This feature is included in local .17, **not in published .12**.
See the [research qualification](prototype/prototype.md#saved-context-research-source-only)
and [runtime contract](architecture/runtime-contracts.md#saved-context-research).

### Included speech defaults and optional custom engines

Packaged .17 resolves its included model and seven pinned native binaries from
Electron's external `resources\speech` directory. Packaging verifies the exact
hashes and retains whisper.cpp/OpenAI/miniaudio license notices. A private-pipe
helper loads the model before capture and reuses it across drafts and final
recognition. Cancellation shuts it down; the next operation reloads. Idle
model RAM is not yet measured. Fresh profiles need no
settings file. Saving a language hint records a symbolic bundle source, not a
temporary portable extraction path; the current resource path resolves on each
launch. Missing/corrupt resources refuse recording before opening a microphone.
No Windows/CPU fallback, download service or automatic permission grant exists.

For a custom engine, open **Input > Recognition > Choose local Whisper engine** and select a
prepared directory containing `ggml-large-v3-turbo-q5_0.bin` and a `runtime`
subdirectory. Only the exact pinned CPU/BLAS or development Vulkan file set is
accepted. The host checks hashes before saving the selection and again before
recording, with an unchanged-artifact cache. Configuration survives restart.
This optional override is a prepared-folder picker, **not an automatic downloader or installer**.
Source runs and historical .13 do not have the packaged bundle. See the
[qualification record](research/speech-options.md#local-multilingual-candidate-connected-in-source)
for the current artifacts and limitations.

Source profiles without a bundle require setup. **Use legacy English recognition** explicitly
selects the installed Windows engine instead; there is no silent fallback.
Missing or corrupt local artifacts refuse capture before opening a microphone
and preserve any unsent draft. Changing/cancelling setup never sends a request.
Selected Vulkan must report actual Vulkan execution or transcription fails.

Automatic detection is the included default; optionally choose **English** or **Hindi** in
Recognition. The hint is saved across restarts; it is not translation or a
promise of recognition accuracy.

Default Intercom requests speak checking progress and conversational replies
using the local voice. Work announcements include newly settled live plans,
defer while recording and retain truthful per-action outcomes. Restored receipts
are not replayed; a normal Copilot response is not proof of task success.

**Input > Microphone > Test selected** measures two seconds of the selected
input, reports peak/RMS and browser-reported source rate separately from the
recognition PCM rate, and rejects silence or substantial clipping. These are
browser/media measurements, not independently measured hardware resolution.
**Input > Speech check > Test speech locally** records and transcribes without
sending any request or replacing your working draft. Stop with the bubble;
cancel discards late results. The separate result shows local text, capture
format, duration, recognition time and detected language. Audio is not saved.
Hindi may appear in its original script here; Roman cleanup happens during
Intercom interpretation, not this raw diagnostic.

Synthetic native execution, rate conversion, settings persistence and exact
owned-process cancellation work. That does **not** establish speech quality:
the 8 kHz test confused "Y" with "why" despite high token probability.
Current source forces review when either WAV or browser-reported source rate
is below 16 kHz, even if capture upsamples it. That blocks automatic sending;
upsampling does not restore lost detail or fix the name-recognition failure.
Human English/Hindi/Hinglish and FDUCE acceptance, speed budgets and a portable
GPU distribution remain open. Roman normalization/filler cleanup occurs in the
restricted Intercom interpreter; legacy destinations do not use that cleanup.

The current source UI differs from the published .12 download below.
The bottom of the workspace contains only a glass microphone icon. Its tooltip
and accessible name describe **Speak**, **Stop & transcribe / send**, or
**Cancel request**; recording level fills the button. Recording does not require
a connected session.
The earlier subtle pearlescent glass shell is restored around the smooth
lavender/mint microphone; the opaque rainbow texture is no longer used.
Six soft reflection patches turn in CSS 3D beneath fixed edge shading and
lighting. A seeded, 32-second periodic trajectory changes direction on X, Y
and Z without random-target snaps. One Web Animation interpolates dense
50 ms orientation samples; the microphone stays upright. The internal golden
loop and narrow upper reflection stroke remain removed.
This is a lightweight optical approximation, not physical ray tracing or
live environment capture. Motion pauses when the document
is hidden or the native window reports paused, and reduced motion removes it.
Gradients and shadows are not animated. The owner rejected both whole-shell
expansion and drawn ring outlines. During capture, existing measured input
instead disturbs a local 64x64 water-height/velocity field at the centre.
A finite-difference wave update propagates the disturbance into a damped rim;
stronger input injects stronger disturbances, no faster than once per 240 ms.
Surface slopes become red/green sampling offsets in a local SVG displacement
map that refracts the existing glass reflections. The same normals produce
soft directional light and shade on a clipped transparent canvas. There are
no stroked circles. The microphone glyph, rim, glass size and hit area remain
undistorted; the capsule still fills vertically.
The [owner's jQuery-ripples reference](https://www.jqueryscript.net/demo/jQuery-Plugin-For-Water-Ripple-Animation-ripples/)
uses height updates and normal-based image sampling too. Its source was
inspected, not imported: this implementation adds no jQuery, dependency,
WebGL scene, external request or audio stream.
Water painting is capped at 30 fps, with fixed 90 Hz numerical steps and at
most 100 ms of catch-up. Silence stops disturbances, fades the residual waves
and removes the filter/loop after 1.6 seconds. Hidden/native pause, reduced
motion, cancellation and unmount clear both water buffers and the filter.
The separate glass Web Animation is never restarted, steered or paused by
input levels. The button has no backdrop blur; 60 px workspace and 34 px
floating targets are unchanged.
These are rendering-cost safeguards, not a measured hardware performance claim.
During capture, original mint/cyan ribbons flow outward symmetrically from the
microphone. Their height and the microphone capsule's vertical fill follow the
same measured input level, not random animation. Floating mode keeps smaller
wings around its microphone. Painting is capped at 30 fps, stops when hidden/
minimized, and is removed when capture stops; reduced motion uses a stationary
shape that still reflects the level. No extra microphone stream is opened.

The right panel opens on **Talk**. Each category keeps its controls in view:

| Tab | Controls |
|---|---|
| Talk | Transcript, explicit send, response and recording cancellation |
| Input | Microphone: selection/load/measured test; Recognition: engine/language; Speech check: local-only transcription |
| Session | Intercom orchestration destination; legacy chat/session connection choices |
| Voice | Local playback; Voice / Tune / Profiles / Preview sub-tabs |
| Work | Plans with Activity / Permission / Result; legacy Target / Task / Review / Receipt |
| Advanced | General: automatic sending and processing priority; Display: drift; About: limits |

Use Left/Right or Home/End on a tab to switch by keyboard. Draft text, session
entry and unsaved voice edits survive category changes. The single recorder
stays mounted across tabs and workspace/floating transitions.

In Floating Mesh, a small microphone sits immediately beside the native drag
grip, outside the default-collapsed controls. Expand the arrow to show the fitted
grid of graph/window controls, settings, conversation and work/receipts.
The grid does not scroll, including at the 360 px minimum size. Settings and
work return to the workspace; conversation toggles the floating transcript.
Recognition review and errors open that transcript automatically. A pending
permission highlights the dock arrow and work control; it never grants approval.

Settings categories fit the 960 x 680 minimum workspace without scrolling.
Long transcripts, work confirmations and receipts may still scroll inside their
content panels; no setting is hidden to fake a fit. The published .12 binary,
release assets and any already-running instance retain their earlier layout.

## Shared graph and window controls

Use the top-right **Maximize window** square to fill the screen; it becomes
**Restore window**. Scroll over the graph to zoom toward the pointer, use
**+ / -** for centered zoom, or right-drag to pan. Zoom can enter the sphere;
**Reset view** restores the starting camera and graph orientation.

**Node identification in .12:** hover a colored
node for its name, or click/tap to pin its details and base path. Names stay
hidden otherwise. Close with Escape, the close button, a same-node click or
blank-space click. Keyboard: focus the graph, arrow through nodes, Enter/Space
to pin. Inspecting a node does not change the work target.

## Published .12 control layout

Click **Floating mesh** to hide the panels and window background. **Prototype .10
and newer, including .12:** the bottom dock starts collapsed. Its **Drag to
move** grip moves the native window; the adjacent arrow expands one horizontal
row containing graph zoom/reset, restore, pin, close and window-size controls.
At small sizes the row scrolls horizontally rather than wrapping. The size
buttons resize the native window without changing graph zoom. There is no
separate top grip or hovering zoom toolbar in this view.

**Prototype .11 and newer, including .12:** the large **Speak** button is fixed at the
bottom center of the whole window, in its own operational bar below the graph
and scrolling panels. It never shifts when recording or cancellation controls
appear. In floating mode it stays centered above, and outside, the collapsed
dock. The input meter appears while recording; **x** cancels the request.
It uses the same selected input and recording in workspace/floating mode:
switching views does not stop or reopen the stream. **Settings** beside the mic
opens/focuses microphone selection in the workspace, or toggles the scrollable
floating voice panel. The transcript is first; microphone/session setup and
playback profiles start collapsed. Stopping opens recognition review/results
or an explicit error in floating mode.
Preparing a work request returns to the workspace for the existing separate
target/task confirmation; it does not dispatch work. The old inert live-mode
footer is not used; the new bar contains the actual recorder. Explicit fixture
demo remains synthetic and separate from live capture.

**Escape** dismisses an open voice panel or node label before restoring the
workspace; **Ctrl+Shift+M** toggles views while Intercom has focus. Returning from
a maximized workspace retains its previous normal-window bounds/maximization.
Older .7-.9 builds retain the top drag handle and two-row dock; they do not
update automatically. See the [current prototype details](prototype/prototype.md#prototype-010-prototype12).

**Prototype .8 and newer, including .12:** click **Settings**
beside Speak first, then **Load microphones**, select FDUCE
(or your preferred input), optionally **Test selected**, then **Speak**. The meter
shows the selected input while recording. No Copilot connection is needed for
recording or local transcription. Click **Stop & transcribe** to retain an
editable transcript; without a connection, nothing is sent, even if automatic
sending is checked. **Load/Test only checks access**, not capture or recognition.
The [prototype guide](prototype/prototype.md#prototype-010-prototype12)
identifies the fixed .12 EXE; the older .7 download is unchanged and still
requires connection before Speak.

To send, paste your existing dedicated session UUID and click **Connect existing
session**, then **Send text to Copilot**. Connecting alone never sends an existing
transcript. Its terminal must be closed/idle; Intercom refuses a second writer.
Agency and Copilot must be installed, on PATH and authenticated. No session UUID
or credentials ship in the EXE. Subsequent recordings with a connected session
and automatic sending enabled use **Stop & send** and read the returned answer.
Disable automatic sending to review/edit before sending. Typed fallback remains
available.

**Prototype .9 and newer, including .12:** low-confidence recognition preserves
the transcript for review instead of discarding it. Nothing is automatically
sent or proposed in any destination; review/edit, then explicitly send or prepare
work. Transcripts over 1,000 characters remain intact but must be shortened
before sending. There is no automatic truncation or splitting. Empty recognition
still gives a distinct error. This improves recovery, not recognition accuracy;
the engine remains Windows English (US), regardless of the speaking-voice profile.
See the [current prototype details](prototype/prototype.md#prototype-010-prototype12).

English (US) Windows speech recognition and an installed English voice are
required; nothing is downloaded. Audio stays in memory and is not uploaded.
Text goes to the existing Copilot account/session and may remain in its history.
Use **Show fixture demo** for the older synthetic routing controls.

Expand **Voice profiles and playback**, then **Voice profiles / customize
speech**, without connecting a session.
Choose an installed voice, adjust pitch/speed/volume, and **Preview voice**.
Preview does not save edits. **Save & use profile** keeps and activates them;
**Duplicate profile** creates another named configuration. Profiles survive
relaunch and apply to progress, replies and work updates. Gender is installed
voice metadata, not a transformation; pitch depends on the voice, and speed
uses Windows' scale. The required future arbitrary identity/timbre/emotional
style engine has a separate provider boundary but is not implemented here.
See the [speech contract](research/speech-options.md).

![Installed voice profiles in the packaged desktop](assets/screenshots/prototype-voice-profiles.png)

Packaged .7: saved speaking profile with installed voice, pitch, speed and volume.
The sidebar scrolls to preview/save actions below. Contexts are a synthetic
test snapshot loaded through the native mesh reader, not the owner's private mesh.

For real work, choose **Background task** as the voice destination, then review
the proposed text below. Select the target context and an existing idle session,
click **Review target and task**, then confirm the exact immutable proposal.
Approve or reject each surfaced operation once. Review the returned response
and receipt; a response is not independent verification of arbitrary work.
One background job is supported; voice proposals and floating controls remain
available while it runs. The separate terminal destination needs manual task
entry and has no monitored completion.

The mesh reads the published local snapshot on every launch; it does not rebuild
Context Mesh itself. Source/load timestamps and stale warnings are visible.
Missing or malformed data produces an error, never a silent fixture substitute.
Bright spokes indicate observed job/tool locations, not inferred reads of links.

See the [prototype guide](prototype/prototype.md) for controls, architecture,
performance behavior, checks and limitations.

![Intercom desktop workspace with graph zoom and window controls](assets/screenshots/prototype-window-controls.png)

Actual packaged v0.1.0-prototype.5 capture: maximize/restore is beside minimize
and close; graph zoom/reset controls sit beside the sphere. This image uses
explicit synthetic demo contexts; normal startup reads the actual local mesh.

![Floating Mesh with visible movement handle and window-size controls](assets/screenshots/prototype-floating-controls.png)

Actual packaged .6 fixture capture: grab **Drag to move** above the sphere;
use **Smaller / Larger** in the always-visible bottom dock. The window is
540 px wide while the separate graph zoom is 125%. Surrounding pixels are
transparent; synthetic contexts do not represent actual context reads.

## Start here

- [Product brief and open decisions](product/product-brief.md)
- [Architecture and integration boundaries](architecture/architecture.md)
- [Technology picks, alternatives and reversal gates](architecture/technology-decisions.md)
- [Runtime, IPC, routing and recovery contracts](architecture/runtime-contracts.md)
- [Performance profiles and qualification plan](research/performance-and-qualification.md)
- [Primary-source research evidence](research/research-sources.md)
- [Local and cloud speech comparison](research/speech-options.md)
- [Phased roadmap and implementation gates](product/roadmap.md)
- [Development manual](development/development-manual.md)
- [Workstream index](../TODO/00_INDEX.todo)
- [Development ledger](../TODO/03_DEVELOPMENT_LEDGER.todo)
- [GitHub tracking policy](development/github-tracking.md)
- [Contributor and agent instructions](../AGENTS.md)
- [Intercom GitHub Project](https://github.com/users/Zanark/projects/13)

The repository uses numbered, evidence-backed workstreams. The owner authorized
the initial fixture sub-slice, local-English conversation and subsequently
confirmed real work with manual approvals and a fresh actual mesh each launch.
Multilingual/hardware/performance and broader orchestration remain open.

## Development boundaries

### Repository layout

The root keeps the package/build configuration, browser entry, contributor
instructions and numbered workstreams. Implementation and evidence are grouped
by responsibility rather than mixed into those entry points:

| Location | Contents |
|---|---|
| `src/app` | Application shell and shared styles |
| `src/components` | Mesh, microphone, conversation, voice-profile and work UI |
| `src/domain` | Context, processing-profile and routing model |
| `src/voice` | Selected-input recording and WAV encoding |
| `desktop/main.cjs`, `desktop/preload.cjs` | Electron entry and isolated renderer bridge |
| `desktop/services` | Mesh worker, voice, synthesis, ACP and work hosts |
| `desktop/speech` | Local Windows speech script and companion text |
| `public/audio`, `public/branding` | Runtime worklet and application icons, copied into `dist` |
| `tests/unit`, `tests/e2e`, `tests/smoke`, `tests/helpers` | Unit suites, desktop fixtures, opt-in smoke scripts and synthetic audio |
| `tools/docs` | README artwork generator |
| `docs/product`, `docs/architecture`, `docs/research` | Requirements, design/contracts and qualification research |
| `docs/prototype`, `docs/development` | Prototype evidence, contributor workflow and tracking policy |
| `docs/assets/branding`, `docs/assets/readme`, `docs/assets/screenshots` | Original identity, generated showcase and source captures |
| `TODO` | Stable numbered workstreams, index and development ledger |

`dist`, `.local`, `release` and `.agent-context` remain ignored generated,
qualification, delivery and private-continuity locations respectively. The
folder reorganization does not migrate profiles or replace a running release.

Run the existing npm commands from the repository root. `npm test` discovers
the renderer/domain unit suites; `npm run test:voice` and `npm run test:host`
cover native services. `npm run test:desktop` uses disposable profiles and
synthetic audio. Live smoke scripts are not part of those suites and still
require fresh explicit consent before contacting a real Copilot session.

The [Test workflow](../.github/workflows/test.yml) runs the same lint, build,
renderer, native voice/host and Electron desktop commands on Windows Server
2025 with Node 26 for main pushes, pull requests and manual dispatches. It uses
`npm ci`, one desktop worker and the existing synthetic/disposable fixtures.
Only synthetic desktop failure outputs are uploaded, retained for three days.
It does not run live smoke scripts, real sessions, physical microphones,
packaging, releases or deployment. Hosted results are separate from human
speech quality, hardware acceptance and the unfinished local rebuild.

After a successful build, independent native/host/desktop suites still run
if an earlier test suite fails; cancellation stops them. Failures are not
ignored. The first hosted run found a real recognition mismatch (`Please`
became `police`), despite passing local synthetic checks; its speech assertion
is retained rather than weakening the suite to obtain a green badge.

For isolated packaging while a retained release is in use, choose a separate
ignored output rather than replacing it:

```powershell
npm run package:win -- --config.directories.output=.local\reorganization-package
```

### Runtime boundaries

Local agent execution does not guarantee offline model processing. Speech
privacy, permissions, retention, cancellation, and confirmation retain explicit
boundaries. Only own-main-frame audio is permitted; camera/other browser
permissions and renderer network requests remain denied. Narrow host IPC controls
speech, sanitized mesh loading and confirmed existing-session work; no generic
renderer shell/filesystem bridge exists. The single atomic job receipt is not
the researched SQLite queue/outbox. Continuous listening, cloud audio,
active-session attachment and new services remain outside this prototype.

Private session continuity lives in the Git-ignored `.agent-context` directory;
it is not part of public documentation or release packages.

## README artwork

The README's single inspiration paragraph pairs a mid-century switchboard operator
(listening and connecting existing sessions) with an opera-orchestra conductor
(coordinating independent work and returning results). It describes product
intent, not completed speech/orchestration qualification; no UI redesign is
part of this documentation change.
The photo floats right at 52% width using GitHub-compatible HTML, without a
bordered layout table. Text wraps beside it; the right-aligned credit follows
a clearing break so the gallery starts below the photograph.
The accompanying unchanged photograph is
`docs/assets/readme/kdd-telephone-exchange-1967.jpg`, supplied by the owner.
[Wikimedia Commons provenance](https://commons.wikimedia.org/wiki/File:KDD_telephone_exchange_in_1960s.jpg)
credits Asahi Shimbun and a 31 March 1967 source. It is not a 1950s photograph.
Commons notes Japanese public-domain status and a possible U.S. copyright
restriction; the owner explicitly confirmed permission to publish this photo.
That permission is not a blanket public-domain or repository-license claim.

The animated hero, reduced-motion still and static documentation mark use
frosted sea glass: muted seafoam, milky diffuse shading, fine fixed grain and
soft rim highlights rather than polished neon surfaces. The title, raised
link buttons and gallery framing share that palette with dark readable text.
The lowercase `intercom.` wordmark retains its original Segoe UI Bold typeface
with grainy seafoam ink and soft violet pigment washes. The subtitle and
navigation remain in legible Segoe UI.
The animated and static documentation microphones use one smooth vertical
violet-to-seafoam gradient, without the wordmark's streaked pigment washes.
Both logo microphones use a brighter lavender-to-mint gradient. The animated
fill rises and falls with the illustrative voice level. Its
unfilled capsule is transparent, not painted with a second material; the
visible fill retains one smooth gradient and the rim also breathes.
The static mark retains its original silhouette,
foreground node and crossing links. Runtime/EXE icons are not changed.
GitHub controls the page itself; these are rendered images, not a custom CSS
theme or a backdrop filter. Original screenshots are not recolored or retouched.

The [visual README](../README.md) uses an original, looping 3D-projected mesh
around a microphone with a smoothly blended violet/seafoam body. Its
432 x 432 px central sphere is three times the previous 144 px logo. The
transparent 936 x 432 px canvas adds mirrored cyan, mint, lavender, rose and
amber wave ribbons behind the center. Layered rolling harmonics, breathing
strand spacing and a broad, softly blurred colored glow give the wings a flowing, ethereal feel.
Colors drift through the ribbons in a seamless cycle; their energy follows
the same illustrative voice envelope without overpowering the frosted mesh.
The voice level is **simulated**: a GitHub README cannot access your microphone,
read your context activity, or run the desktop application. The animation
does not change Intercom's runtime logo or microphone behavior.
The logo has no embedded caption or rectangular backdrop: only the circular
center glow remains, with transparent space between and around the wave lines.
There is no background panel behind the wings. The GIF uses palette
transparency and clears each frame to avoid trails; the still PNG keeps its
soft alpha edge. Linked button artwork uses raised faces and soft shadows,
not executable controls or CSS hover effects.

The behavioral reference is Microsoft's
[New microphone volume indicator in Teams](https://techcommunity.microsoft.com/blog/Microsoft365InsiderBlog/new-microphone-volume-indicator-in-teams/4442879)
(Anqi Chen, August 14, 2025): mic levels move up/down with incoming speech.
The Intercom artwork is original, not a copied Teams icon.

The README offers a still image when the renderer supports the reduced-motion
media query. You can also [open the still directly](assets/readme/readme-logo-still.png).
All four README GUI panels are six-second recordings of an earlier local
source renderer: voice/tuning tabs, mesh orbit/zoom, the floating dock, and
input-reactive microphone waves. They still show the rejected rotating rainbow
film, not the latest restored glass/3D motion; their next refresh is held for
visual acceptance of the local preview.
Each has a reduced-motion PNG and a direct
still link. Historical screenshots remain evidence in this guide; they are
not substituted into the new recordings.

The standalone enlarged bubble showcase has been removed from the README.
A separate 560 x 560 px GIF remains at `assets/readme/readme-bubble.gif`,
with its matching PNG still, for inspecting the actual idle control.
That documentation candidate still shows the superseded rainbow shell.
The latest local preview is `.local/readme-capture/readme-bubble.gif`:
560 x 560 px, 640 frames, 32 seconds at 20 fps, sampled deterministically
from the actual control's Web Animation timeline. It is not live audio or
a performance measurement. A 3x screenshot of the 84 px crop
provides a 252 px source before enlargement. It has its own reduced-motion
still and caption. No reference photograph is copied into the artwork.
The original logo GIF, wordmark and button artwork are
unchanged by this refresh.

The captures use an isolated build, disposable profile, 48 fictional contexts
and 144 structural connections for a denser globe. This density applies only to
the application demos; the logo keeps its original nine-node geometry.
The captures use no real catalog,
only an enveloped synthetic tone through Chromium's fake audio device.
Recognition readiness is stubbed for recording the UI; no recognition,
speech playback or Agency dispatch runs. The copied documentation host stays
hidden/offscreen, disables background throttling and keeps rendering unpaused;
the renderer/preload are unchanged. No actual user instance, private mesh,
physical microphone, desktop or other application is recorded.
Floating frames retain genuine native-window transparency and are enlarged
over the **owner-supplied sea-glass wallpaper** (`assets/readme/sea-glass-wallpaper.png`),
not presented as an on-desktop recording. Fictional node colors use saturated
coral, amber, plum and indigo to contrast with the cool sea-glass palette.
The caption identifies the wallpaper and compositing.
These are source-build demonstrations, not a new release, proof of native
overlay behavior on a human desktop, or speech-quality acceptance.

Reproduce the documentation assets with Python and Pillow (rendered with
Pillow 12.2.0 and Windows Segoe UI;
these are artwork tools, not application dependencies or bundled fonts):

```powershell
python .\tools\docs\render_readme.py
```

Run from the repository root. This command regenerates branding and link
buttons, leaving the separately captured GUI assets untouched.
The branding generator uses no audio, network, session
connector or live app. Its fixed cyclic rotation and illustrative speech
envelope produce a 144-frame, 20 fps, 7.2-second loop with a shared sea-glass
palette with dedicated multicolor wave ramps. Fixed grain seeds keep the
material reproducible without random frame-to-frame flicker.
The original high-resolution static mark is retained
in `tools/docs/sources/intercom-logo.png`; the generator changes its material,
not its geometry or alpha silhouette. Runtime/EXE icons remain unchanged.

Re-record the GUI gallery using the installed development dependencies:

```powershell
npm run build -- --outDir .local\readme-capture\app\dist
node .\tools\docs\capture_readme.cjs
```

Refresh the approved speaking showcase directly in the README assets:

```powershell
npm run build -- --outDir .local\water-refraction-capture\app\dist
node .\tools\docs\capture_readme.cjs --readme-speaking
```

This writes the speaking GIF and matching reduced-motion still under
`docs\assets\readme`. The private modes below leave those assets unchanged.
The full GUI command also creates a private idle bubble pair; only the
selected speaking pair is embedded in the README.

Capture only the current bubble preview, without replacing README media:

```powershell
npm run build -- --outDir .local\readme-capture\app\dist
node .\tools\docs\capture_readme.cjs --bubble-only
```

This writes the preview GIF and still under `.local\readme-capture`.
Capture the level-reactive bubble using locally synthesized Windows speech:

```powershell
npm run build -- --outDir .local\water-refraction-capture\app\dist
node .\tools\docs\capture_readme.cjs --bubble-speaking
```

This writes `intercom-speaking-bubble.gif` and its PNG under
`.local\water-refraction-capture`, preserving the rejected outlined-ring and
expansion previews, the idle preview and README media.
The 14-second, 280-frame example captures the actual recording/RMS pipeline
with synthetic speech and pauses, not a physical microphone or injected UI level.
The GIF is silent. The hidden disposable app checks measured input, active
surface displacement, fixed shell size, final silence and released tracks; transcription,
playback and work dispatch stay blocked. Desktop checks separately verify
actual filtered/unfiltered pixel differences, sustained input, unchanged
rotation identity/advancing time and lifecycle cleanup. Numerical tests cover
outward propagation, signed slopes, input strength, damping and transparent
lighting at rest. Six decoded GIF phases were inspected, not complete playback.
The rejected film artwork generator has been removed; the current glass
does not load a texture asset.

The capture tool launches only its copied, hidden documentation host, refuses
changed host-patching assumptions, blocks transcription/playback/session
dispatch, verifies input levels, floating alpha and reflection motion, cancels capture, closes
its own app and removes its exact disposable profile. Intermediate frames
remain ignored under `.local\readme-capture`; Pillow creates bounded 960px,
10 fps looping GIFs with a shared palette per scene and delta frames.
The full command also captures 640 idle Web Animation samples and creates
`readme-bubble.gif` plus its PNG still. Explicit screenshot scaling and PNG
dimension assertions guard the close-up resolution; device-scale flags alone
did not enlarge the hidden host's Playwright crop. Every decoded GIF frame
is compared with its quantized source, including the complete loop duration.
These opaque gallery composites keep prior frame contents; the transparent
hero still uses clear-frame disposal.
