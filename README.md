# Intercom

A voice-first desktop assistant for working with existing Agency/Copilot
sessions. Speak a request, choose terminal handoff or background execution, and
hear the result when the requested work finishes.

Its proposed visual surface is a 3D Context Mesh sphere: active context and
session paths light up while other relationships remain dimly visible.

**Top priority:** speed/performance by default, with selectable processing
priorities. Accuracy remains important; these controls are planned, not built.

**Stage:** architecture and roadmap only, as requested. Wake-word activation and
Agency-first integration are confirmed requirements. No application, selected
speech provider, approved desktop stack, or proven live-session connector exists.

**Engineering recommendation:** Tauri 2 + Rust host, React/TypeScript + Three.js
UI, native local-speech worker and SQLite jobs. This revises the initial
Electron recommendation; hardware measurements and Agency/speech proof still
gate selection.

## Start here

- [Product brief and open decisions](docs/product-brief.md)
- [Architecture and integration boundaries](docs/architecture.md)
- [Technology picks, alternatives and reversal gates](docs/technology-decisions.md)
- [Runtime, IPC, routing and recovery contracts](docs/runtime-contracts.md)
- [Performance profiles and qualification plan](docs/performance-and-qualification.md)
- [Primary-source research evidence](docs/research-sources.md)
- [Local and cloud speech comparison](docs/speech-options.md)
- [Phased roadmap and implementation gates](docs/roadmap.md)
- [Development manual](docs/development-manual.md)
- [Workstream index](TODO/00_INDEX.todo)
- [Development ledger](TODO/03_DEVELOPMENT_LEDGER.todo)
- [GitHub tracking policy](docs/github-tracking.md)
- [Contributor and agent instructions](AGENTS.md)
- [Intercom GitHub Project](https://github.com/users/Zanark/projects/13)

The repository uses numbered, evidence-backed workstreams. Product requirements
and the first vertical slice must be defined before introducing a framework or
dependencies. There are currently no application build, test, or launch commands.

## Development boundaries

Local agent execution does not guarantee offline model processing. Speech
privacy, permissions, retention, cancellation, and confirmation have proposed
contracts, not implemented protections. Do not capture audio, start an agent,
enable session-control services, or build the application under the current
documentation-only authorization.

Private session continuity lives in the Git-ignored `.agent-context` directory;
it is not part of public documentation or release packages.
