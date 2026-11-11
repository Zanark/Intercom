<p align="center">
  <img src="docs/assets/readme/readme-title.png" alt="intercom. Original lowercase typeface in seafoam and washed violet on frosted sea glass. Your voice. Your context. Connected." width="680" />
</p>

<p align="center">
  <a href="docs/guide.md#readme-artwork">
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcset="docs/assets/readme/readme-logo-still.png" />
      <img src="docs/assets/readme/intercom-logo-animated.gif" alt="Intercom: frosted sea-glass mesh with a seafoam/violet microphone, surrounded by flowing cyan, mint, lavender, rose and amber wave ribbons. Mirrored ethereal waves and soft glow on transparent surroundings. Simulated speech, not live audio. Open for details and a still image." width="936" />
    </picture>
  </a>
</p>

<p align="center">
  <sub>Sea-glass lettering, frosted mesh and softly flowing multicolor waves. <a href="docs/assets/readme/readme-logo-still.png">View the still logo</a>.</sub>
</p>

<p align="center">
  <a href="https://github.com/Zanark/Intercom/releases/tag/v0.1.0-prototype.12"><img src="docs/assets/readme/readme-download.png" alt="Download prototype .12: Windows x64, unsigned. Read the release warnings and verify checksums." width="240" /></a>
  <a href="docs/guide.md"><img src="docs/assets/readme/readme-guide.png" alt="Project guide: setup, workflows, architecture and documentation." width="240" /></a>
  <a href="docs/prototype/prototype.md#prototype-010-prototype12"><img src="docs/assets/readme/readme-prototype.png" alt="Prototype .12: permanent microphone in both views, transcript review, on-demand node labels, checksums and limitations." width="240" /></a>
</p>

## A switchboard, conducted by voice

<table>
  <tr>
    <td width="45%" valign="top">
      <p>Inspired by mid-century switchboard operators and the conductor of an opera orchestra, Intercom aims to turn one spoken request into coordinated work across existing Agency/Copilot sessions: connect the right specialists, cue their tasks and bring their replies back. Its sea-glass Context Mesh visualizes those connections, lighting paths only for observed activity.</p>
    </td>
    <td width="55%" valign="top">
      <img src="docs/assets/readme/kdd-telephone-exchange-1967.jpg" alt="Headset-wearing operators seated at the consoles of a KDD international telephone exchange in the 1960s." width="540" />
      <br /><sub>KDD exchange, 1967. Asahi Shimbun. <a href="https://commons.wikimedia.org/wiki/File:KDD_telephone_exchange_in_1960s.jpg">Source / rights</a>. Used with owner-confirmed permission.</sub>
    </td>
  </tr>
</table>

<p align="center">
  <sub>GUI recordings below use the current source, fictional contexts and synthetic audio, not the published .12 build or speech-quality evidence. Each has a reduced-motion still.</sub>
</p>

<p align="center">
  <a href="docs/guide.md#run-the-prototype">
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcset="docs/assets/readme/readme-voices.png" />
      <img src="docs/assets/readme/readme-voices.gif" alt="Recorded source GUI: switch between speaking-voice and tuning tabs and adjust pitch and speed. Fictional contexts; no speech playback." width="960" />
    </picture>
  </a>
  <br /><sub><a href="docs/assets/readme/readme-voices.png">Voice settings still</a></sub>
</p>

<p align="center">
  <a href="docs/prototype/prototype.md">
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcset="docs/assets/readme/readme-workspace.png" />
      <img src="docs/assets/readme/readme-workspace.gif" alt="Recorded source GUI: orbit, drift and zoom through a mesh of fictional contexts. No real session work is dispatched." width="960" />
    </picture>
  </a>
  <br /><sub><a href="docs/assets/readme/readme-workspace.png">Workspace still</a></sub>
</p>

<p align="center">
  <a href="docs/guide.md#readme-artwork">
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcset="docs/assets/readme/readme-floating.png" />
      <img src="docs/assets/readme/readme-floating.gif" alt="Recorded transparent Floating Mesh: a dense globe of warm coral, amber and violet nodes over owner-supplied sea-glass wallpaper. Open and collapse the dock; the microphone stays accessible. Staged composite, not a desktop recording." width="960" />
    </picture>
  </a>
  <br /><sub><a href="docs/assets/readme/readme-floating.png">Floating Mesh still</a> · Owner-supplied wallpaper; actual transparent GUI capture, staged composite.</sub>
</p>

<p align="center">
  <a href="docs/guide.md#readme-artwork">
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcset="docs/assets/readme/readme-microphone.png" />
      <img src="docs/assets/readme/readme-microphone.gif" alt="Recorded source GUI: synthetic microphone input drives the glass microphone fill and symmetric live waves. No physical microphone, transcription, playback or agent dispatch." width="960" />
    </picture>
  </a>
  <br /><sub><a href="docs/assets/readme/readme-microphone.png">Microphone still</a></sub>
</p>

**Functional rebuild in progress (unpublished local work):** local development
connects the restricted controller to a durable multi-session scheduler, with
Intercom-node default focus, conditional checks, exclusions and manual tool
approvals. Clear requests need no second target/task confirmation. Disposable
fixtures verify this flow; real multi-session work and human speech quality
remain unqualified. Local multilingual Whisper uses explicit prepared-folder
setup and integrity checks, without silent Windows/CPU fallback. An 8 kHz
synthetic example confused session "Y" with "why": speech accuracy is not
accepted. Installer and portable GPU qualification remain unfinished. The
running/published .12 is unchanged; the implementation and qualification notes
remain local and are not included in this README/media update.
