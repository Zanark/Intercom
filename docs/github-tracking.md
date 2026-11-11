# GitHub tracking adoption

## Authorized scope

The owner explicitly approved a dedicated GitHub Project and linked issues
during project initialization on 2026-11-10. Repository: `Zanark/Intercom`
(public). Only the public-safe numbered workstreams are mirrored.

Tracking authority does not authorize commits, pushes, deployment, scheduling,
Actions workflows, remote secrets, permission changes or private-continuity
publication. The owner subsequently requested the initial documentation push;
commit `3e2693cf2875af96f728e56a5066c7065aecaf93` was pushed to main.
The later explicit research-push request completed as
`20632243c38ae4a2689ffbdb676a2d70ff1c4a96`, independently verified on main.
Neither completed request was standing authority to publish later prototype work.
The owner's subsequent explicit EXE-release request authorized committing/
pushing the .1 prototype and publishing its unsigned Windows prerelease.
That completed publication is not standing authority for later .2/.3/.4/.5/.6 releases.
The microphone request initially authorized input choice and brief device checks.
Publication and asset receipts are recorded after independent verification,
not inferred from the packaging command.

## Source of truth and operation

Local numbered `.todo` files own descriptions, tasks, dependencies, criteria,
evidence, and completion. Each has a stable `Workstream ID` and `GitHub issue`
backlink. Mirror that source in the issue body after a stable HTML marker:
`<!-- intercom-workstream:ic-01 -->` or the corresponding ID.

This adoption is **agent-driven manual reconciliation**, not an automatic
synchronizer. No daemon or repository-local sync runtime is installed.
On an authorized workstream update:

1. Read the local file, its linked issue, and its Project item.
2. Check saved mapping and existing markers before creating anything.
3. Compare the normalized body hash with the saved baseline below. Stop on
   unexpected issue-body edits or unexplained state changes. Preserve
   human comments; never silently overwrite conflicting content.
4. Update the managed issue description from the public-safe workstream,
   excluding the self-referential `GitHub issue` line.
5. Reconcile issue state and actual Project status separately.
6. Read back body, state, Project membership/status, and local backlink.
7. Record partial success explicitly and reuse saved IDs on retry.

Preview before creating a workstream issue. A failed/uncertain read is not an
empty inventory. Do not delete issues/items or recreate a missing mapping
without reconciling its stable marker. Remote board movement does not rewrite
local status. New remote writes need applicable authority.

## Status mapping

Use the Project's discovered built-in status options, recorded in the mapping
below; do not guess option IDs.

| Local status | Issue | Project stage |
|---|---|---|
| NOT_STARTED | Open | Todo |
| IN_PROGRESS | Open | In Progress |
| BLOCKED | Open, blocker retained in body | Todo unless already actively underway |
| DONE | Closed / completed | Done |

Reopening a workstream reopens the same issue. Cancellation/supersession needs
an explicit decision and must not be reported as completed.

## Initial inventory and preview

Observed baseline: zero repository issues, no linked Project, and no existing
owner Project named Intercom. Existing unrelated Projects remain untouched.

- Include `ic-01`: repository foundation and continuity; initially active.
- Include `ic-02`: product decisions and first-slice definition; not started.
- Exclude `00_INDEX.todo`: navigation, not a feature issue.
- Exclude `03_DEVELOPMENT_LEDGER.todo`: perpetual history, not a feature issue.
- Never include `.agent-context`, raw chats, secrets, or private evidence.

### Voice-assistant roadmap preview (2026-11-10)

The existing tracking authorization covers these public-safe workstream
descriptions, not runtime execution or publication of private research:

- Update existing `ic-02` / #2 to IN_PROGRESS / Open / In Progress.
- Add `ic-04`: existing Agency connector qualification; NOT_STARTED / Open / Todo.
- Add `ic-05`: speech and wake qualification; NOT_STARTED / Open / Todo.
- Add `ic-06`: gated desktop voice/mesh slice; NOT_STARTED / Open / Todo.
- Add `ic-07`: gated reliability/lifecycle qualification; NOT_STARTED / Open / Todo.
- Keep `ic-01` / #1 unchanged. Continue excluding index, ledger, private
  continuity, audio, session catalog/transcripts and installation receipts.

Workstream IDs and file numbers stay stable; issue numbers are independent.
Before mutation, verify the existing two body hashes/states and Project stages,
inventory markers to prevent duplicate creation, then read back the final six
issue-backed mappings. The preview itself is not a completion receipt.

## Credentials

Use the shared manual's reviewed `scripts/with_github_token.py` runner with
trusted `gh` commands. Never inspect, print, copy, or package its local `.env`,
and never replace global authentication. This external runner is not a bundled
Intercom dependency or a synchronizer; without it, provision authorized access
locally without putting credentials in chat.

## Verified mapping

Dedicated owner Project: https://github.com/users/Zanark/projects/13,
title **Intercom**, private visibility. It is linked to `Zanark/Intercom`.
Repository issues remain public; the private board is not a private-content
upload boundary.

| Workstream | Local source | Issue | Project item ID |
|---|---|---|---|
| ic-01 | `TODO/01_PROJECT_FOUNDATION.todo` | [#1](https://github.com/Zanark/Intercom/issues/1) | `PVTI_lAHOAe2wCs4BrBRezhHi_ko` |
| ic-02 | `TODO/02_PRODUCT_DECISIONS.todo` | [#2](https://github.com/Zanark/Intercom/issues/2) | `PVTI_lAHOAe2wCs4BrBRezhHi_lg` |
| ic-04 | `TODO/04_AGENCY_CONNECTOR_PROOF.todo` | [#3](https://github.com/Zanark/Intercom/issues/3) | `PVTI_lAHOAe2wCs4BrBRezhHjXoI` |
| ic-05 | `TODO/05_SPEECH_AND_WAKE_QUALIFICATION.todo` | [#4](https://github.com/Zanark/Intercom/issues/4) | `PVTI_lAHOAe2wCs4BrBRezhHjXsM` |
| ic-06 | `TODO/06_DESKTOP_VOICE_MESH_SLICE.todo` | [#5](https://github.com/Zanark/Intercom/issues/5) | `PVTI_lAHOAe2wCs4BrBRezhHjXxs` |
| ic-07 | `TODO/07_RELIABILITY_AND_LIFECYCLE.todo` | [#6](https://github.com/Zanark/Intercom/issues/6) | `PVTI_lAHOAe2wCs4BrBRezhHjX3c` |

Project node: `PVT_kwHOAe2wCs4BrBRe`.
Status field: `PVTSSF_lAHOAe2wCs4BrBRezhpVzH8`.
Discovered options: Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657`.
Issue nodes: ic-01 `I_kwDOVph7S88AAAABeBr3Dw`;
ic-02 `I_kwDOVph7S88AAAABeBr5IA`;
ic-04 `I_kwDOVph7S88AAAABeCG3oA`;
ic-05 `I_kwDOVph7S88AAAABeCG83g`;
ic-06 `I_kwDOVph7S88AAAABeCHBXg`;
ic-07 `I_kwDOVph7S88AAAABeCHHsQ`.

Initial foundation reconciliation on 2026-11-10 verified exactly two issues
and issue-backed items: ic-01 CLOSED / COMPLETED / Done and ic-02 OPEN / Todo.
Both original descriptions were compared before the foundation completion
update; ic-02 required no mutation at that stage.

The later voice-roadmap reconciliation verified those saved body hashes,
states, stages and identities before writing. It updated the same ic-02 issue
to OPEN / In Progress and created ic-04 through ic-07 as OPEN / Todo.
Independent full GraphQL read-back verifies exactly six issues, six unique
issue-backed items, exact local description equality, all six backlinks,
states/status option IDs, private Project visibility, and the sole repository
link. ic-01's body and completion state remain unchanged. No background sync,
hosted automation, private session output, or audio was published.

The subsequent speed-first/selectable-priority clarification updated the same
ic-02, ic-05, ic-06 and ic-07 issues after all six prior body/state/stage
baselines matched. Independent read-back again verified full description
equality and unchanged issue/item identities and statuses. The hashes below
include that clarification; no new issue, runtime or permission was introduced.

The deep-research reconciliation compared all six saved bodies/states/stages
again, updated only the existing ic-02 and ic-04 through ic-07 descriptions, and
independently read back complete bodies, backlinks, identities, status option
IDs, visibility and membership. All six original mappings and stages remain
unchanged. The baselines below now include that research; no new issue/item,
application runtime, commit or research push was created.

The separately authorized prototype reconciliation checked all six research
baselines before writing. It updated only #2 and #5 descriptions and moved
the **existing** #5 Project item to In Progress. Independent full read-back
verified all six complete bodies, original issue/item identities, backlinks,
states/status option IDs, private visibility and sole repository linkage.
#1 remains CLOSED/COMPLETED/Done; #2 and #5 are OPEN/In Progress; #3, #4 and #6
remain OPEN/Todo. The early fixture UI does not complete the live voice/Agency
criteria or waive #5's dependencies. Hashes below now include this milestone.

The 2026-11-11 release reconciliation again matched all six prior baselines
before updating only the existing #2/#5 descriptions for microphone choice,
packaging and verified prerelease publication. Independent full-body read-back
verified all six descriptions, backlinks, original issue/item identities,
states/stages, private Project visibility and sole repository membership.
No stage changed and no issue/item was created; #5 remains In Progress because
its integrated voice/Agency acceptance criteria remain open. The hashes below
now include this release receipt.

The bounded voice-conversation reconciliation matched all six branding baselines
before updating only existing #2/#3/#4/#5 descriptions. It moved the existing
#3/#4 Project items to In Progress; no issue state, identity or membership
changed. Independent complete-body read-back verified all six descriptions,
backlinks, original issue/item IDs, status options, private visibility and sole
repository linkage. #1 remains CLOSED/COMPLETED/Done; #2/#3/#4/#5 are OPEN/In
Progress; #6 remains OPEN/Todo. No private target UUID, audio or raw session log
was published. The .3 local candidate is not a new release.

The .4 complete-slice reconciliation matched all six conversation baselines
before updating only existing #2/#3/#4/#5 descriptions. Independent read-back
verified all six complete bodies, backlinks, original issue/item identities,
states/status option IDs, private Project visibility and sole repository link.
No state/stage or mapping changed; no new issue, item, commit, push or release.
The updated evidence distinguishes native source work from packaged fixtures,
saved-grant behavior from actual permission prompts, and manual terminal entry
from automatic handoff. Full-product qualification workstreams remain open.

The .5 graph/window-controls reconciliation matched all six .4 baselines before
updating only the existing #5 description. Independent complete-body read-back
verified all six identities, backlinks, issue states, Project statuses/membership
and private visibility. No state/stage change, new issue/item or release.

### Managed-body conflict baselines

The .6 floating-controls reconciliation matched all six .5 baselines before
updating only the existing #5 description. Independent complete-body read-back
verified all six identities, backlinks, issue states, Project statuses/membership
and private visibility. No state/stage change, new issue/item or release.

Compute SHA-256 over UTF-8 body text after converting CRLF to LF and stripping
trailing whitespace only. The HTML identity marker is included. Local projection
excludes only the `GitHub issue:` line. Before an update, compare the actual
remote body against this saved baseline, then separately compare the new local
projection. Update these hashes only after an authorized conflict-free write and
exact read-back; never refresh them merely to hide a remote edit.

| Workstream | Verified remote body SHA-256 |
|---|---|
| ic-01 | `562ceaadaa676dcfb47fa40fa79c77ddc9dbce059965142c48b18082d66c9788` |
| ic-02 | `5052eecad889f461eb541ff12f429241b6bd07b07712979d34d409aae20e3866` |
| ic-04 | `5bdd0a9f6e12305f519617ed05d0614e44bdf8a464c2fb4a4a8b69b467abfd20` |
| ic-05 | `e134e21309fa9c29ff867363f542a00447b02914479b99c23ced0300fa2f2e75` |
| ic-06 | `735ee41c1af08321ebf6af6ed7bc113e4a8eb34b20373cb6f8a658e6668c0b58` |
| ic-07 | `072c0916f6106438b8f32e2ae02415645056015a3049f36f12ec4cfca281fe33` |

These reconciliations used the same saved issue/item identities on
read-back and confirmed no duplicates. Automated retry, reopening, and conflict
tests are not claimed because no sync runtime was introduced.

The .7 voice-profile reconciliation matched all six .6 baselines before
updating only existing #5's description. Independent complete-body read-back
verified all six identities, backlinks, issue states, Project statuses/membership
and private visibility. No new issue/item, state/stage change or publication.
Local installed voices and native/profile checks are implemented; the required
richer synthesis engine and human/performance acceptance remain explicitly open.

The subsequent owner-authorized .7 publication reconciliation matched all six
voice-profile baselines before updating only existing #5's description with the
verified source/tag, release and anonymous-download receipts. Independent
complete-body read-back verified all six backlinks, issue/item identities,
states, Project stages/membership and private visibility. No new issue/item or
completion/state change. The release tag remains at the qualified source;
the separate receipt-doc commit does not move it or replace either release.

The animated-README reconciliation matched all six publication baselines before
updating only existing #5's description with the qualified presentation milestone.
Independent complete-body read-back verified #5 equals its local projection;
the other five issues are unchanged. All six original issue/item identities,
states and Project stages, private visibility and sole repository membership
remain intact. No new issue/item, product completion, source push or release.

The node-inspection reconciliation matched all six animated-README baselines
before updating only existing #5's description with the local source milestone.
Independent complete-body read-back matches the local projection; the other
five issues are unchanged. Original identities, issue states, Project stages,
private visibility and sole-repository membership remain intact. No new
issue/item, package, commit, push or release; ic-06 remains In Progress.

The owner subsequently authorized committing and pushing the animated README
and node-inspection source changes. This is separate from the completed .7
prerelease and does not authorize replacing its source tag, binary or assets.
