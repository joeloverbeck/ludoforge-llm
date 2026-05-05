# Closeout and Follow-Up

1. If implementation completed and no blocking discrepancy remains, update the active ticket:
   - Set ticket status to its completed state when appropriate.
   - Add or amend the ticket outcome with what landed, boundary corrections, and verification that ran.
   - If the final diff intentionally omitted or expanded beyond original `Files to Touch`, record that explicitly in the ticket outcome.
2. Summarize what changed, what was verified, and any residual risk. Include:
   - Audited schema/artifact ripple effects (even if none needed)
   - Deferred verification owned by another ticket
   - Deferred sibling/spec scope confirmed during reassessment, when relevant
   - Resolved 1-3-1 decisions (especially Foundation type discipline)
   - Rules-evidence notes for game-specific legality corrections
   - Any unverified ticket premise (claimed repro seeds, counts, traces, production observations)
3. **Closeout checklist**:
   - What landed in this ticket
   - Which verification commands ran
   - Whether schema/artifact surfaces were checked and whether they changed
   - Scope deferred to sibling tickets, if any
   - Unverified ticket premises or residual risk
   - Whether `post-ticket-review` already ran; if not, state that the ticket is implemented but not archived and name `post-ticket-review` as the next review/archive workflow
   - Late-edit proof validity when any source, test, fixture, schema, ticket/spec status, command ledger, touched-file scope, or proof claim changed after the first final-proof lane: changed paths, edit class, proof invalidated yes/no, rerun command or no-invalidation rationale
   - Final dirty-state delta: compare `git status --short` against the early baseline, include untracked files, and classify any new unrelated paths as concurrent/pre-existing before final response
4. If the ticket appears complete, offer to archive per `docs/archival-workflow.md`.
5. If the user wants archival or follow-up review, hand off to `post-ticket-review`. When the main remaining work is archival hygiene, dependency integrity, or adjacent-ticket review, suggest it as the default next step. If this implementation superseded semantics in a recently archived sibling, call that out in the handoff.

## Final Acceptance Sweep

Before declaring completion or updating the ticket status, run one final acceptance sweep against the ticket text and your final diff:

- re-check non-command acceptance constraints such as file-size caps, named line-count limits, exact file/artifact deliverables, and explicit "do not modify X" boundaries
- use cheap structural probes when helpful (`wc -l`, targeted file existence checks, touched-file scope checks including untracked files)
- re-check repo-level structural conventions from `AGENTS.md` that remain relevant even if the ticket did not name them explicitly, such as file-size guidance, worktree discipline, and explicit artifact-touch expectations
- when a touched file was already over a repo file-size cap before the ticket and your diff grows it further, classify that explicitly as `preexisting oversize + active growth` before closeout. If a narrow extraction is clearly in-scope, do it; if extraction is nontrivial or would widen the ticket, stop for `1-3-1`; if the user or ticket boundary justifies deferring the split, record the exception and residual owner in the active ticket outcome before completion.
- for retained `preexisting oversize + active growth`, include the compact ledger in the active ticket outcome: starting condition, active-growth reason, extraction considered, deferral/in-scope decision, and residual owner or `none`
- compare the ticket's named file/artifact list against the actual touched-file scope; if a named file was not actually required or an unlisted file became required, correct the active ticket before marking it complete
- reconcile ticket classification fields that summarize the closeout contract, such as status, engine/code-change markers, effort/risk notes when present, `What to Change`, `Files to Touch`, generated-fallout expectations, and verification/proof ledger entries
- for mixed tickets, build a compact deliverable ledger from `What to Change`, `Files to Touch`, and any explicitly named artifacts/tests. Classify each item as `done`, `verified-no-edit`, `blocked`, `rewritten in active ticket`, or `deferred by confirmed boundary change` before using `COMPLETED`
- when a ticket-named file or artifact already satisfies the deliverable without a code diff, record it explicitly as `verified-no-edit` in the ticket outcome rather than implying it was missed
- confirm the final state reflects any nonblocking draft-ticket corrections you planned to carry
- for shared contract migrations, confirm the final diff covers the intended helper/fixture normalization strategy and that any preserved serialized surface still matches the ticket outcome text
- for new packages, crates, or other workspace units, confirm they are discoverable by the workspace/package filter, their build artifacts are intentionally ignored or checked in, and any package/task-runner output declarations remain truthful
- for binary/WASM/FFI ABI skeletons, confirm the ticket/spec outcome records the concrete ABI identity fields, buffer shape, mismatch/error behavior, and proof command that exercised both success and fail-closed paths
- if a command-level verification already passed but the acceptance sweep finds a remaining ticket invariant miss, fix that miss and rerun the affected proof lane before closeout
- for completed active tickets, use the explicit repo-local terminal status already used by the ticket or series, such as `IMPLEMENTED` or `COMPLETED`; do not normalize to `COMPLETED` when the family uses a different terminal implementation status

## Acceptance-Proof Invalidation

Acceptance-proof runs are invalidated by later edits to the proved surface or acceptance story. If code, tests, fixtures, schemas, goldens, generated artifacts, status, scope, touched-file expectations, command ledgers, acceptance wording, or proof claims change after the last green acceptance-proof lane, rerun the narrowest affected proof lanes before marking the ticket complete. Do not rely on an earlier green run once the final diff has changed.

Purely clerical ticket/spec edits, such as typo fixes or appending evidence that does not alter status, scope, command coverage, or proof claims, may preserve earlier proof only when you record an explicit no-invalidation decision in the ticket outcome or final closeout. If there is any doubt whether the edit changes the acceptance story, treat it as proof-affecting and rerun the affected lane.

Examples: changing scope, touched-file/header classification, acceptance wording, or a proof ledger claim is proof-affecting. Appending the exact result of a just-completed command can be clerical only when it changes no acceptance claim or command coverage. After all final lanes are green, classified, or explicitly substituted, setting the terminal status to the already-proven result can also be clerical when it changes no acceptance story; record the no-invalidation decision explicitly. When uncertain, rerun the focused affected lane or stop for `1-3-1` if the rerun cost or boundary change is no longer clearly authorized.

When the deliverable ledger shows any ticket-named item still classified as `blocked` or unresolved, do not mark the ticket `COMPLETED` unless the active ticket has first been rewritten to reflect the confirmed narrower boundary.

Suggested late-edit proof-validity ledger:

- `late edits`: `<paths changed after first final-proof lane>`
- `edit class`: `runtime | test | fixture | schema/artifact | ticket/spec closeout | dependency graph | clerical`
- `proof invalidation`: `<affected lanes rerun, or no-invalidation rationale such as "unused-code removal only; reran lint/typecheck/build; no runtime/test/acceptance-story change">`

## Durable Outcome Block

For tracked tickets, prefer making the closeout durable inside the ticket itself. A minimal tracked-ticket outcome block should capture:

- completion date or resulting status
- what landed in the owned boundary
- any boundary correction or semantic correction confirmed during reassessment
- verification commands that actually ran
- whether schema/artifact fallout was checked and whether it changed
- any retained `preexisting oversize + active growth` ledger when a touched source file stayed over repo guidance and grew during the ticket
- any late-edit proof-validity ledger needed to explain why final proof remained valid after post-proof edits

## Durable State Classification

When the active tracked ticket was truthfully narrowed or rewritten and the owned slice lands while a newly created or newly recognized prerequisite remains open, classify the ticket's durable state explicitly before you stop:

- `COMPLETED`: the rewritten active ticket's owned boundary is fully satisfied and no remaining blocker sits outside the ticket.
- `BLOCKED by prerequisite`: the active ticket's owned work is done or partially done, but truthful closure still depends on another active ticket or unresolved external blocker. Record the landed slice and the blocker in the ticket outcome rather than leaving the state implicit.
- `PHASE 1 COMPLETE / BLOCKED by Phase 2 approval`: the ticket itself is phase-gated, the investigation/report/harness phase landed, and the implementation phase remains explicitly gated by user or review approval. Record the completed phase artifact, approved boundary corrections, remaining gated phase, whether Phase 2 stays in the same ticket or moves to a successor, and the exact verification run for the completed phase.
- `PENDING untouched`: reassessment showed the ticket should stay forward-looking because implementation did not yet land any owned deliverable.

Prefer an explicit durable outcome block for the first two states so the ticket artifact reflects both the landed work and the remaining blocker.

If an explicit ticket-named broad acceptance lane is still red, `COMPLETED` is only truthful when the active ticket has first been rewritten to remove that lane from the owned boundary or the failures have been proven unrelated/pre-existing. A red changed-path, serialized-contract, or architectural-invariant failure should normally become `BLOCKED by prerequisite` or trigger 1-3-1 rather than a completed ticket plus an implicit follow-up.

## Optional State-Transition Ledger

For active-ticket rewrites that change the ticket graph itself, an optional final state-transition ledger can help keep the repo artifact honest:

- `active ticket after rewrite`
- `new/updated deps`
- `owned slice landed`
- `remaining blocker`
- `recommended durable status`

## Draft Ticket Durable Closeout

For active untracked draft tickets, prefer the same durable closeout pattern before finishing the turn: update the draft ticket status and outcome so later sessions inherit the corrected contract, touched-file scope, and repo-valid verification commands rather than the stale draft wording.

## Touched-File Scope Sweep

As part of the final acceptance sweep, explicitly compare `What to Change` / `Files to Touch` / other ticket-named artifacts against the final diff and untracked files before using `COMPLETED`. Remember that untracked new files may not appear in `git diff --name-only`; include them explicitly.

If that sweep finds ticket-named files that were intentionally left untouched because reassessment proved no live change was required, do not quietly leave the mismatch behind. Record the correction in the active ticket closeout so the final artifact explains why those paths remained unchanged.

If that sweep finds additional live-diff files or generated artifacts that were not named in the ticket, treat that as the same class of ticket drift as an untouched named file. Update the active ticket before closeout so the touched-file scope explains both omitted additions and omitted removals.

When a ticket that initially looked code-only widens during live reassessment into authored game data, policy catalogs, or other rule-authoritative assets, do not leave that ownership change implicit. Update `Files to Touch` / `What to Change` before final proof so the closeout truthfully records the mixed code-plus-authored-data boundary.

When a ticket requires checked-in logs, transcripts, or other generated artifact files, verify that those artifacts are not hidden by `.gitignore` or other ignore rules before the final proof pass. Treat ignored-but-required artifacts as acceptance drift and fix the delivery path (for example by narrowing the ignore rule) before closeout.

## Correction Ledger Pattern

When live implementation requires correcting stale ticket text, record a compact ledger in the active ticket before the final proof pass when proportionate:

- `ticket corrections applied`: `<stale claim> -> <live contract>`

Use this for concrete live-contract fixes such as helper signatures, export-surface ownership, touched-file scope, or verification command wording. Keep it short; do not turn it into a second narrative section when a one-line correction ledger is enough.

When the ticket lands successfully but the live investigation disproves part of the draft framing, still close the ticket truthfully if the owned evidence artifact was produced. In that case, keep the correction ledger explicit rather than quietly preserving the stale hypothesis. Typical shape:

- `ticket corrections applied`: `<draft hypothesis> -> <measured live result>`

## Draft Ticket Closeout Order

For active draft tickets that are likely to change durable status in the same turn, use this compact closeout order before the final proof run:

1. Keep the draft ticket's terminal status pending unless all named final lanes have already run and are green, classified, or explicitly substituted.
2. Record the intended durable state in prose, what landed, any boundary correction, and the verification set you intend to run.
3. Make any needed ticket-scope or touched-file corrections before the final acceptance-proof pass.
4. Run the final acceptance-proof set after those ticket edits so the last green run matches both code and ticket artifact.
5. Apply the terminal status (`COMPLETED`, `BLOCKED`, etc.) as the final narrow edit when the proof story is settled. If that final edit only sets the already-proven status and transcribes exact proof results without changing scope, command semantics, thresholds, dependency ownership, or acceptance boundaries, record the no-invalidation decision; otherwise rerun the narrowest affected proof lane.

If those ticket edits include path, dependency, archival, or ticket-id corrections, do one immediate narrow integrity pass before treating closeout as done:

1. Run a cheap self-reference check for the corrected literal/path when proportionate (for example `rg` on the active ticket for the old ticket id/path).
2. Run the narrowest repo integrity lane that validates ticket references or dependencies when available.
3. Treat any stale reference left inside the ticket's own correction ledger or outcome block as acceptance-proof drift and fix it before final closeout.

## Dependency Integrity Pass

If the session creates a new prerequisite/follow-up ticket or rewires deps across the active series, treat dependency validation as immediate, not optional:

1. update the affected deps/status fields first
2. run the narrowest available ticket-dependency integrity check immediately after that rewrite when the repo provides one
3. fix any cycle or stale dependency before continuing to broader proof or final closeout

## Successor-Before-Final-Proof Preflight

When the owned slice appears landed but truthful closeout requires a new successor, updated successor, dependent-ticket rewrite, spec ticket-list update, or other ownership handoff, do that handoff before the first lane you intend to cite as final proof:

1. classify the active ticket's durable state (`completed owned slice`, `blocked by prerequisite`, `partial`, or equivalent)
2. create or update the successor/follow-up owner, including concrete live evidence and repo-valid verification commands
3. update affected active specs, sibling tickets, and dependent tickets so the series names the new owner consistently
4. run dependency integrity immediately after the ticket graph edit
5. update the active ticket's touched-file/proof ledger to include the handoff artifacts
6. only then run the final acceptance-proof set; earlier green lanes become diagnostics if the handoff changed follow-up/dependency classification, touched-file ownership, or acceptance wording

Exception for red measured gates: if the active ticket explicitly allows completion on `red measured result + active route proof + successor owner`, no stricter materiality note blocks that closeout, and the successor's exact scope depends on the decisive measurement output, run the decisive measurement after active-route proof and required counters exist. Then create/update the successor, rewrite dependent tickets/specs, run dependency integrity, and rerun only proof lanes affected by the post-measurement edits. If the edits only transcribe metrics and ownership, record why the measurement remains valid instead of rerunning an expensive profile by reflex.

For red measured-gate tickets, prefer this terminal-status order unless the active ticket already dictates a different accepted closeout choreography:

1. Before the decisive metric, prewrite the active ticket outcome/status as pending or nonterminal.
2. Run the decisive metric and capture exact red/green values plus route diagnostics; if ticket/spec/reviewer wording requires materiality, record a compact ledger with `baseline`, `decisive final`, `target`, `delta`, `percent change`, `verdict`, and `terminal status allowed?`.
3. If red and successor completion is allowed, create or update the successor, dependent tickets, and spec ticket list.
4. Run dependency integrity immediately after the ticket graph rewrite.
5. Run the final acceptance-proof lanes affected by the code and handoff state.
6. Set the active ticket's terminal status as the last ticket edit when all lanes are green, classified, or explicitly substituted.

If the materiality verdict is `minor` or `not demonstrated`, do not set red-plus-successor terminal status unless the user confirms that revised closeout through `1-3-1`; otherwise use a truthful non-green durable state. Treat broad phrases such as "next owner", "follow up", or "handoff" as authorization to draft successor ownership, not as authorization to mark the active red gate complete.

Before patching the active ticket to a terminal status in the same edit that creates or rewrites a successor, ask whether every non-metric final lane has already run against the current code and ticket graph. If not, leave status pending or nonterminal in that patch, run the remaining final lanes, then apply the terminal status as a final narrow ticket edit. If the final edit only sets the already-proven status and transcribes exact proof results without changing scope, command semantics, thresholds, dependency ownership, or acceptance boundaries, record the no-invalidation decision; otherwise rerun the narrowest affected proof lane.

Pre-`apply_patch` stop-check: if a patch both sets terminal status and creates or rewrites a successor, stop unless all non-metric final lanes already ran against the current code and ticket graph. Otherwise leave status pending in that patch, run the remaining affected lanes, and apply terminal status as a final narrow patch.

If a final metric must remain valid after successor/dependency transcription, record explicitly that those edits did not change code, command semantics, thresholds, scope, or acceptance boundaries. If any of those changed, rerun the narrowest affected proof lane.

For red-gate successor closeout, include a compact post-metric proof-validity ledger in the active ticket outcome or final closeout:

- `post-metric graph edits`: `<successor/spec/dependency/status files changed after the decisive metric>`
- `proof invalidation`: `<affected lanes rerun, or no-invalidation rationale such as "metric-only ownership transcription; no code, command, threshold, scope, or acceptance-boundary change">`

## Follow-Up Ticket Creation During Implementation

When implementation reassessment proves that remaining work belongs in a new or extended follow-up ticket, apply the same authoring discipline expected by `post-ticket-review`:

1. inspect active tickets for overlap before creating a new owner; prefer extending an existing active ticket when that is clearer and non-overlapping
   - For numbered series or repeated residual tickets, use a concrete overlap preflight before authoring, for example `rg -n '<series-prefix>|<residual keyword>|<candidate owner>' tickets specs` plus targeted reads of plausible hits. Record a one-line `overlap checked` note in working notes, the active ticket outcome, or the successor when the handoff is nontrivial.
2. read `tickets/README.md` and `tickets/_TEMPLATE.md` when creating a new ticket, unless the repo has an already-current series-local template or established series format that the new ticket must follow
3. include concrete live evidence, deps, acceptance criteria, architecture/foundations check, and repo-valid verification commands
   - For profiling or benchmark successors backed by CPU-profile evidence, include a compact profiling evidence block in the successor: `profile command`, `profile artifact path` or explicit ephemeral-artifact note, `parser command` or parser method, baseline/current metric, top owners or residual stack samples, sample-surface classification (`inside timed acceptance surface`, `setup/process lifetime`, or `post-processing/observer overhead`), and why this successor is non-overlapping with the completed active slice.
4. update the active ticket, sibling tickets, and deps/status fields so the series tells one ownership story
5. run the narrowest available ticket-dependency or markdown integrity check immediately after the rewrite when the repo provides one
6. include the new untracked ticket in the final dirty-state delta and touched-file scope sweep

When applying ticket/spec graph rewrites, prefer `apply_patch` or a checked-in
repo helper over ad hoc shell one-liners. Markdown tickets commonly contain
backticks, command snippets, pipes, and paths; embedding that content in
`node -e`, `perl -e`, `sed`, or similar shell strings can trigger shell command
substitution or quoting drift before the edit reaches the intended tool.
For closeout sweeps, prefer plain-string anchors and single-quoted `rg`
patterns, for example `rg -n '150FITLWASM-027.md' tickets specs`. If the
target text appears inside markdown backticks, search for the path or id without
the backticks instead of using a double-quoted pattern that contains a code
span.

## Sibling Absorbed Ownership

When the active ticket absorbed ownership from sibling draft tickets in the same series, extend that closeout order:

1. Update each affected sibling draft to a truthful durable state before or alongside the final proof pass (`DEFERRED`, `BLOCKED`, or equivalent per repo convention).
2. Add a compact historical-resolution note so the series remains inspectable without rereading the whole session.
3. Treat stale sibling draft statuses after an ownership rewrite as acceptance-proof drift, not optional postscript cleanup.

Suggested compact sibling ledger:

- `Historical Resolution`: `owned slice absorbed by <ticket> on <date> due to <boundary reason>; retained as historical draft-series record only.`

When the sibling remains active but is narrowed rather than closed, use a compact handoff ledger instead of a historical-resolution note:

- `absorbed by active ticket`: `<ticket id>` absorbed `<specific former sibling slice>` due to `<Foundation/live-proof reason>`
- `remaining owned slice`: `<what this sibling still owns>`
- `deps`: `unchanged | updated to <ticket id> | removed because <reason>`
- `verification impact`: `<new proof lane or no change because <reason>>`

## Compact Final-Proof Ledger

Suggested compact final-proof ledger:

- `ticket corrections applied`: `<stale claim> -> <live contract>`
- `verification set`: `<commands run directly in final proof order>`
- `subsumed proof`: `<ticket-named command> -> <broader lane>` when applicable
- `proof gaps`: `none` or `<remaining blocker>`
- `architectural follow-up`: `<new spec/ticket id or proposed artifact> for <cross-ticket contract discovered during implementation>` when the ticket uncovered a broader design gap that outlives the local fix

For benchmark tickets with tried-and-reverted candidates, add a compact attempt ledger when it prevents future repetition:

- `candidate`: `<optimization/probe tried>`
- `correctness proof`: `<focused command or not reached>`
- `measurement`: `<sample/result/profile summary>`
- `decision`: `kept | reverted | abandoned | accepted by user exception`

For benchmark/performance tickets where a code slice is worth keeping but the ticket remains open because a named measured gate is still red, use a landed-but-not-closeable ledger:

- `accepted implementation`: `<landed root-cause reduction and files/seam changed>`
- `green proof`: `<focused build/test/correctness lanes>`
- `measured improvement`: `<owned root-cause metric before -> after, plus command/artifact>`
- `materiality`: `<baseline, decisive final, target, delta, percent change, verdict, terminal status allowed?>`
- `red acceptance lane`: `<ticket-named command and exact red result>`
- `durable status`: `IN PROGRESS | BLOCKED | PARTIAL | repo-equivalent`
- `residual owner`: `<active ticket if still same-ticket-owned, sibling/follow-up id, or unknown>`
- `next authorization`: `<already user-approved continuation, 1-3-1 needed, or intentionally deferred>`

For a user-approved acceptance exception on a red measured gate, make the exception explicit:

- `original gate`: `<metric and threshold>`
- `measured result`: `<samples, mean, variance, pass=false>`
- `authorization`: `<user-approved close-enough / waiver wording and date>`
- `durable status`: `<COMPLETED by user-approved acceptance exception or repo-equivalent>`
- `residual risk`: `<remaining hotspot/follow-up omitted or named owner>`

When a ticket-named broad lane remains red, use a more explicit residual handoff ledger:

- `red lane`: `<ticket-named command>`
- `direct rerun`: `<first failing file/command rerun directly>`
- `assertion`: `<short failing assertion or error class>`
- `classification`: `owned failure | same-series residual / dependency blocker | repo-preexisting unrelated blocker`
- `owner`: `<active ticket, sibling ticket, external blocker, or unknown>`
- `durable status`: `<COMPLETED | BLOCKED by prerequisite | PENDING untouched | repo-equivalent>`

Investigation-ticket example when the artifact landed but the hypothesis shifted:

- `ticket corrections applied`: `expected small viable subset on both seeds -> measured 44/44 on seed A and 1/30 on seed B`
- `verification set`: `<artifact-generation commands in final proof order>`
- `proof gaps`: `none`

Evidence-ticket compact closeout pattern when the deliverable is primarily a script plus checked-in report/artifact:

- `capture command`: `<stable artifact-producing command>`
- `repro command`: `<best live failure repro command>` or `same as capture command`
- `artifact paths`: `<checked-in report/script/generated artifact paths>`
- `measured result`: `<top-line quantitative or categorical outcome>`
- `mapping gaps`: `<top-N entries or observations not yet covered by the starter taxonomy>` or `none`
- `verification set`: `<commands run directly in final proof order>`
