# Intercom project guide

[Visual home](../README.md) · [Prototype details](prototype/prototype.md)

<img src="assets/branding/intercom-logo.png" alt="Intercom microphone and context-mesh logo" width="144" height="144" />

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

**Stage:** Windows push-to-talk and confirmed background-work prototype. Choose a microphone,
click **Speak**, then **Stop & send**: installed local English recognition
produces text, your designated existing idle Copilot session answers, and
Intercom speaks progress and the actual response. Every launch reads the actual
local Context Mesh snapshot. Background tasks require separate context/session/
task confirmation, retain Copilot permissions and return a durable receipt.
Terminal mode opens the existing session for manual task entry, not automatic
handoff. No wake word, active-session attach or new sessions. Electron is approved
for the prototype, not selected as the final product host.

**Engineering recommendation:** Tauri 2 + Rust host, React/TypeScript + Three.js
UI, native local-speech worker and SQLite jobs. This revises the initial
Electron recommendation; hardware measurements and Agency/speech proof still
gate selection.

## Run the prototype

The current Windows x64 prototype is **unsigned**:
[Download the .7 EXE](https://github.com/Zanark/Intercom/releases/download/v0.1.0-prototype.7/Intercom-Prototype-0.1.0-prototype.7-win-x64.exe)
from the [prototype prerelease](https://github.com/Zanark/Intercom/releases/tag/v0.1.0-prototype.7).
Only the latest local .11 candidate is retained:
`C:\devdesk\homedesk\Intercom\release\mic-layout-candidate\Intercom-Prototype-0.1.0-prototype.11-win-x64.exe`.
It is not the published .7 download.

This .7 release adds persistent **Voice profiles**: installed voice/gender/
accent choice, pitch, speed, volume, preview, duplication and naming.
Floating movement/sizing, deep graph zoom and native maximize/restore remain
available. Earlier local executables were removed in the owner-requested
cleanup; published GitHub releases are unchanged.

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
qualification records; their features are included in .7.

From `C:\devdesk\homedesk\Intercom` in PowerShell, with Node.js/npm installed:

```powershell
npm ci
npm start
```

Use the top-right **Maximize window** square to fill the screen; it becomes
**Restore window**. Scroll over the graph to zoom toward the pointer, use
**+ / -** for centered zoom, or right-drag to pan. Zoom can enter the sphere;
**Reset view** restores the starting camera and graph orientation.

**Source checkout feature; not in the published .7 download:** hover a colored
node for its name, or click/tap to pin its details and base path. Names stay
hidden otherwise. Close with Escape, the close button, a same-node click or
blank-space click. Keyboard: focus the graph, arrow through nodes, Enter/Space
to pin. Inspecting a node does not change the work target.

Click **Floating mesh** to hide the panels and window background. **Local .10
and newer/current checkout:** the bottom dock starts collapsed. Its **Drag to
move** grip moves the native window; the adjacent arrow expands one horizontal
row containing graph zoom/reset, restore, pin, close and window-size controls.
At small sizes the row scrolls horizontally rather than wrapping. The size
buttons resize the native window without changing graph zoom. There is no
separate top grip or hovering zoom toolbar in this view.

**Local .11/current checkout:** the large **Speak** button is fixed at the
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
update automatically. See the [separate .11 candidate](prototype/prototype.md#local-microphone-layout-candidate-010-prototype11).

**Local .8 and newer candidates/current checkout:** in .11 click **Settings**
beside Speak first, then **Load microphones**, select FDUCE
(or your preferred input), optionally **Test selected**, then **Speak**. The meter
shows the selected input while recording. No Copilot connection is needed for
recording or local transcription. Click **Stop & transcribe** to retain an
editable transcript; without a connection, nothing is sent, even if automatic
sending is checked. **Load/Test only checks access**, not capture or recognition.
The [prototype guide](prototype/prototype.md#local-microphone-fix-candidate-010-prototype8)
identifies the separate fixed EXE; the published .7 download is unchanged and
still requires connection before Speak.

To send, paste your existing dedicated session UUID and click **Connect existing
session**, then **Send text to Copilot**. Connecting alone never sends an existing
transcript. Its terminal must be closed/idle; Intercom refuses a second writer.
Agency and Copilot must be installed, on PATH and authenticated. No session UUID
or credentials ship in the EXE. Subsequent recordings with a connected session
and automatic sending enabled use **Stop & send** and read the returned answer.
Disable automatic sending to review/edit before sending. Typed fallback remains
available.

**Local .9 candidate/current checkout:** low-confidence recognition preserves
the transcript for review instead of discarding it. Nothing is automatically
sent or proposed in any destination; review/edit, then explicitly send or prepare
work. Transcripts over 1,000 characters remain intact but must be shortened
before sending. There is no automatic truncation or splitting. Empty recognition
still gives a distinct error. This improves recovery, not recognition accuracy;
the engine remains Windows English (US), regardless of the speaking-voice profile.
See the [separate recognition-review candidate](prototype/prototype.md#local-recognition-review-candidate-010-prototype9).

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

The [visual README](../README.md) uses an original, looping 3D-projected mesh
around a microphone with a vertically rising/falling mint/cyan fill. Its
432 x 432 px display is three times the previous 144 px logo.
The voice level is **simulated**: a GitHub README cannot access your microphone,
read your context activity, or run the desktop application. The animation
does not change Intercom's runtime logo or microphone behavior.
The logo has no embedded caption or rectangular backdrop: only the circular
center glow remains, with transparent surroundings. The GIF uses palette
transparency and clears each frame to avoid trails; the still PNG keeps its
soft alpha edge. Linked button artwork uses raised faces and soft shadows,
not executable controls or CSS hover effects.

The behavioral reference is Microsoft's
[New microphone volume indicator in Teams](https://techcommunity.microsoft.com/blog/Microsoft365InsiderBlog/new-microphone-volume-indicator-in-teams/4442879)
(Anqi Chen, August 14, 2025): mic levels move up/down with incoming speech.
The Intercom artwork is original, not a copied Teams icon.

The README offers a still image when the renderer supports the reduced-motion
media query. You can also [open the still directly](assets/readme/readme-logo-still.png).
The workspace/voice gallery preserves the earlier packaged captures above,
with explicit version/synthetic-context captions. The two floating showcases
use the owner's supplied desktop and browser screenshots, resized without
cropping. They demonstrate the transparent mesh over other surfaces, but show
an earlier control layout, not the current .11 microphone placement. They are
not fresh runtime captures or microphone-quality evidence.

Reproduce the documentation assets with Python and Pillow (rendered with
Pillow 12.2.0 and Windows Segoe UI; neither is an application dependency):

```powershell
python .\tools\docs\render_readme.py
```

Run from the repository root. The generator uses no audio, network, session
connector or live app. Its fixed cyclic rotation and illustrative speech
envelope produce a 144-frame, 20 fps, 7.2-second loop with a shared palette.
