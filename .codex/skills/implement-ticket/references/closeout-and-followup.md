# Closeout and Follow-Up

1. If implementation completed and no blocking discrepancy remains, update the active ticket:
   - Set ticket status to its completed state when appropriate.
   - Add or amend the ticket outcome with what landed, boundary corrections, and verification that ran.
   - If the final diff intentionally omitted or expanded beyond original `Files to Touch`, record that explicitly in the ticket outcome. A named file that required no edit should appear as `already satisfied / verified-no-edit`, not as an unexplained omission.
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
   - Final response handoff fields: `tracked modified paths`, `untracked additions`, `green proof lanes`, `classified non-final lanes or none`, `archive status`, and the exact `$post-ticket-review <ticket>` sentence when review/archive did not run
   - Late-edit proof validity when any source, test, fixture, schema, ticket/spec status, command ledger, touched-file scope, or proof claim changed after the first final-proof lane: changed paths, edit class, proof invalidated yes/no, rerun command or no-invalidation rationale. For terminal status/proof transcription after all lanes are green, use a compact rationale such as `No-invalidation: terminal status/proof transcription only; no scope, acceptance, command, touched-file, follow-up, or dependency change.`
   - Final dirty-state delta: compare `git status --short` against the early baseline, include untracked files, and classify any new unrelated paths as concurrent/pre-existing before final response
4. If the ticket appears complete, offer to archive per `docs/archival-workflow.md`.
5. If the user wants archival or follow-up review, hand off to `post-ticket-review`. When the main remaining work is archival hygiene, dependency integrity, or adjacent-ticket review, suggest it as the default next step. If this implementation superseded semantics in a recently archived sibling, call that out in the handoff.

## Final Acceptance Sweep

Before declaring completion or updating the ticket status, run one final acceptance sweep against the ticket text and your final diff:

- re-check non-command acceptance constraints such as file-size caps, named line-count limits, exact file/artifact deliverables, and explicit "do not modify X" boundaries
- use cheap structural probes when helpful (`wc -l`, targeted file existence checks, touched-file scope checks including untracked files)
- when a source-size ledger was drafted earlier, reconstructed after compaction, or transcribed from a handoff summary, rerun the cheap line-count probe for every ledger path immediately before the terminal ticket/status patch and reconcile the durable ledger with those exact counts
- re-check repo-level structural conventions from `AGENTS.md` that remain relevant even if the ticket did not name them explicitly, such as file-size guidance, worktree discipline, and explicit artifact-touch expectations
- when the ticket added a new source file that is near or over the repo's typical size band, classify it before terminal status: split now if a narrow extraction is clearly in scope, defer with rationale when splitting would widen the ticket, or stop for `1-3-1` if the durable state would otherwise violate an explicit cap
- hard source-size gate: if any touched source file ends over the repo cap (800 lines in this repo), crosses the cap because of active growth, or remains preexisting-oversize with active growth, do not set terminal status until the active ticket or final closeout contains the exact source-size ledger and one of these is true: narrow extraction is done, user-approved deferral exists, or a `1-3-1` decision resolves why extraction would widen the ticket
- exact source-size ledger means the durable ticket/final closeout names every field, not just current counts: `path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor if any`
- when a touched file was already over a repo file-size cap before the ticket and your diff grows it further, classify that explicitly as `preexisting oversize + active growth` before closeout. If a narrow extraction is clearly in-scope, do it; if extraction is nontrivial or would widen the ticket, stop for `1-3-1`; if the user or ticket boundary justifies deferring the split, record the exception and residual owner in the active ticket outcome before completion.
- when the touched oversized file is an established canonical table, lowerer, schema mirror, diagnostic registry, or comparable shared contract hub, a surgical adjacent addition may be the least risky ticket-sized change. Still record `preexisting oversize + active growth`, why extraction would widen or obscure the ticket seam, whether a narrow helper was considered, and the residual owner (`none` if no separate extraction ticket is justified).
- for retained `preexisting oversize + active growth`, include the compact ledger in the active ticket outcome: starting condition, active-growth reason, extraction considered, deferral/in-scope decision, and residual owner or `none`
- compare the ticket's named file/artifact list against the actual touched-file scope; if a named file was not actually required or an unlisted file became required, correct the active ticket before marking it complete
- reconcile ticket classification fields that summarize the closeout contract, such as status, engine/code-change markers, effort/risk notes when present, `What to Change`, `Files to Touch`, generated-fallout expectations, and verification/proof ledger entries
- for completed tracked tickets, sweep the outcome/proof block for stale forward-looking closeout phrasing such as `planned`, `pending`, `expected`, `will run`, or `to be verified`. Replace it with final evidence or keep it only when explicitly describing historical pre-proof state.
- when the active ticket corresponds to a parent spec checklist, MVP item, phase row, or other explicit completion marker, update that marker before final proof and include it in the touched-file/proof ledger. If this changes status, ticket-list parity, dependency ownership, or active/archive classification, run the repo's dependency or markdown-integrity checker before closeout.
- reconcile every ticket-named verification command before terminal status. For each named command, classify it as `run literally`, `subsumed by broader lane`, `replaced by repo-valid focused substitute`, `stale/overbroad and corrected in active ticket`, or `not run with explicit blocker/classification`. Record the exact mapping in the active ticket outcome before final proof when the literal command is not run.
- for mixed tickets, build a compact deliverable ledger from `What to Change`, `Files to Touch`, and any explicitly named artifacts/tests. Classify each item as `done`, `verified-no-edit`, `blocked`, `rewritten in active ticket`, or `deferred by confirmed boundary change` before using `COMPLETED`
- when a ticket-named file or artifact already satisfies the deliverable without a code diff, record it explicitly as `verified-no-edit` in the ticket outcome rather than implying it was missed
- confirm the final state reflects any nonblocking draft-ticket corrections you planned to carry
- for shared contract migrations, confirm the final diff covers the intended helper/fixture normalization strategy and that any preserved serialized surface still matches the ticket outcome text
- when the implementation added a status/result union, stable reason strings, or new ready/unavailable branches not already enumerated by the ticket, confirm the ticket outcome or final closeout classifies each branch as `tested`, `unreachable by construction`, or `deferred to confirmed sibling`
- when the ticket outcome records a `public-contract representation correction`, confirm it names the concrete evidence source for the live contract when practical, such as the inspected file/function/test/trace producer, before relying on the correction as a semantic clarification
- for new packages, crates, or other workspace units, confirm they are discoverable by the workspace/package filter, their build artifacts are intentionally ignored or checked in, and any package/task-runner output declarations remain truthful
- for binary/WASM/FFI ABI skeletons, confirm the ticket/spec outcome records the concrete ABI identity fields, buffer shape, mismatch/error behavior, and proof command that exercised both success and fail-closed paths
- if a command-level verification already passed but the acceptance sweep finds a remaining ticket invariant miss, fix that miss and rerun the affected proof lane before closeout
- for completed active tickets, use the explicit repo-local terminal status already used by the ticket or series, such as `IMPLEMENTED` or `COMPLETED`; do not normalize to `COMPLETED` when the family uses a different terminal implementation status
- when the active ticket is still `PENDING` and the terminal wording is not obvious from the ticket itself, inspect the nearest completed sibling ticket, series spec ticket list, or established family convention before choosing the terminal label. Record the rationale briefly when the series mixes terminal states or exception statuses.
- when adding files, do not summarize the touched-file surface from `git diff --stat` alone. Pair it with `git status --short` or explicitly list untracked files, because new tests, fixtures, reports, and tickets may otherwise disappear from the closeout.

## Acceptance-Proof Invalidation

Acceptance-proof runs are invalidated by later edits to the proved surface or acceptance story. If code, tests, fixtures, schemas, goldens, generated artifacts, status, scope, touched-file expectations, command ledgers, acceptance wording, or proof claims change after the last green acceptance-proof lane, rerun the narrowest affected proof lanes before marking the ticket complete. Do not rely on an earlier green run once the final diff has changed.

Purely clerical ticket/spec edits, such as typo fixes or appending evidence that does not alter status, scope, command coverage, or proof claims, may preserve earlier proof only when you record an explicit no-invalidation decision in the ticket outcome or final closeout. If there is any doubt whether the edit changes the acceptance story, treat it as proof-affecting and rerun the affected lane.

Examples: changing scope, touched-file/header classification, acceptance wording, or a proof ledger claim is proof-affecting. Appending the exact result of a just-completed command can be clerical only when it changes no acceptance claim or command coverage. After all final lanes are green, classified, or explicitly substituted, setting the terminal status to the already-proven result can also be clerical when it changes no acceptance story; record the no-invalidation decision explicitly. When uncertain, rerun the focused affected lane or stop for `1-3-1` if the rerun cost or boundary change is no longer clearly authorized.

Use this compact classifier for late closeout edits after the first final-proof lane:

| Late edit | Usually clerical? | Required action |
| --- | --- | --- |
| Terminal status set to the already-proven result | yes | Record no-invalidation when scope, acceptance, command coverage, touched-file scope, dependency ownership, and proof claims are unchanged. |
| Exact proof result transcription from a command that just ran | yes | Record the command and result; rerun only if the text changes command coverage or acceptance meaning. |
| Typo, formatting, or obvious grammar in non-contract prose | yes | Record or mention no-invalidation when the edit happens in the active ticket/spec after proof. |
| Touched-file scope, generated-fallout, sibling-owner, dependency, or deferred-scope change | no | Rerun the narrowest affected proof or integrity lane after updating the artifact. |
| Acceptance wording, invariant/proof matrix, command substitution, threshold, or status classification change | no | Treat as proof-affecting unless a prior user-approved boundary reset already covers the exact change. |
| Adding or removing a path in the durable outcome/proof ledger | usually no | Rerun or explicitly justify no-invalidation only when it is pure transcription of an already-proven dirty-state fact. |

After a proof-affecting ticket/spec/report edit, do not leave an earlier no-invalidation note standing if it no longer describes the final edit sequence. Search the edited outcome or ledger for stale `no-invalidation`, `terminal closeout`, or `status/proof transcription only` claims and reconcile them before terminal status. The final ledger should contain either the affected proof rerun or a no-invalidation rationale that still matches the final acceptance, scope, command, proof, and touched-file story.

When the deliverable ledger shows any ticket-named item still classified as `blocked` or unresolved, do not mark the ticket `COMPLETED` unless the active ticket has first been rewritten to reflect the confirmed narrower boundary.

Suggested late-edit proof-validity ledger:

- `late edits`: `<paths changed after first final-proof lane>`
- `edit class`: `runtime | test | fixture | schema/artifact | ticket/spec closeout | dependency graph | clerical`
- `proof invalidation`: `<affected lanes rerun, or no-invalidation rationale such as "unused-code removal only; reran lint/typecheck/build; no runtime/test/acceptance-story change">`
- `no-invalidation`: for status/proof transcription only, `terminal status/proof transcription only; no scope, acceptance, command, touched-file, follow-up, or dependency change`

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

Plain `git diff -- <path>` does not show untracked draft-ticket or draft-spec contents. For untracked active artifacts, inspect the file directly with `sed`/`rg`, include it in `git status --short`, or use an explicit baseline/no-index comparison when you need a textual diff. Do not treat an empty `git diff -- <untracked path>` as evidence that the draft artifact was unchanged.

## Touched-File Scope Sweep

As part of the final acceptance sweep, explicitly compare `What to Change` / `Files to Touch` / other ticket-named artifacts against the final diff and untracked files before using `COMPLETED`. Remember that untracked new files may not appear in `git diff --name-only`; include them explicitly.

Optional compact sweep recipe:

1. Extract ticket-named paths from `What to Change`, `Files to Touch`, acceptance criteria, command blocks, and named witness/artifact bullets.
2. Compare that list against `git diff --name-only` plus `git status --short`, not `git diff` alone, so untracked new tests, fixtures, reports, or draft tickets are visible.
3. For each ticket-named path, record `done`, `verified-no-edit`, `rewritten in active ticket`, `blocked`, or `needs 1-3-1`.
4. For each changed path not named by the ticket, classify it as `owned fallout`, `stale canonical drift`, or `unrelated churn`; update the active ticket closeout when the final diff intentionally includes it.
5. If the sweep finds a named artifact still missing or an unexplained extra artifact, fix the code/ticket boundary and rerun the narrowest affected proof before terminal status.

If that sweep finds ticket-named files that were intentionally left untouched because reassessment proved no live change was required, do not quietly leave the mismatch behind. Record the correction in the active ticket closeout so the final artifact explains why those paths remained unchanged.

If that sweep finds additional live-diff files or generated artifacts that were not named in the ticket, treat that as the same class of ticket drift as an untouched named file. Update the active ticket before closeout so the touched-file scope explains both omitted additions and omitted removals.

When a ticket that initially looked code-only widens during live reassessment into authored game data, policy catalogs, or other rule-authoritative assets, do not leave that ownership change implicit. Update `Files to Touch` / `What to Change` before final proof so the closeout truthfully records the mixed code-plus-authored-data boundary.

When a ticket requires checked-in logs, transcripts, or other generated artifact files, confirm the Phase 1 tracked/ignored delivery-path check is still true before the final proof pass. Treat ignored-but-required artifacts as acceptance drift and fix the delivery path (for example by narrowing the ignore rule or recording the approved ticket/report transcription path) before closeout.

## Correction Ledger Pattern

When live implementation requires correcting stale ticket text, record a compact ledger in the active ticket before the final proof pass when proportionate:

- `ticket corrections applied`: `<stale claim> -> <live contract>`

Use this for concrete live-contract fixes such as helper signatures, export-surface ownership, touched-file scope, or verification command wording. Keep it short; do not turn it into a second narrative section when a one-line correction ledger is enough.

When the ticket lands successfully but the live investigation disproves part of the draft framing, still close the ticket truthfully if the owned evidence artifact was produced. In that case, keep the correction ledger explicit rather than quietly preserving the stale hypothesis. Typical shape:

- `ticket corrections applied`: `<draft hypothesis> -> <measured live result>`

## Source-Size Ledger

When active work grows a source file that is already near/over repo guidance, or creates a source file that crosses guidance, use this exact closeout ledger in the active ticket outcome or final closeout:

- `source-size ledger`: `path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor if any`

If exact before counts were lost after compaction or late shared-contract fallout, reconstruct them mechanically for tracked modified files: capture `after` with `wc -l <path>`, capture added/deleted counts with `git diff --numstat -- <path>`, then compute `before = after - added + deleted`. For new files, use `before = 0`; for deleted files, use the pre-delete line count from Git when needed. If the file was also changed by unrelated user work in the same path, do not pretend the reconstructed count is ticket-local; classify the overlap before closeout.

If the touched oversized file is a canonical contract hub, schema mirror, generated-artifact source, diagnostic registry, or comparable shared table, a surgical addition may still be the right ticket-sized change. Record the exact before/after counts anyway, then state why extraction would widen or obscure the ticket seam and whether a successor is needed.

## Same-Series Draft Delta

When new same-series draft tickets appear after the initial checkpoint and the active ticket/spec references deferred sibling scope, carry this compact field into the running note or durable outcome:

- `new same-series drafts`: `paths | opened because | dependency role | active-boundary impact | final classification`

Use `final classification` values from the main skill guidance: `read-only sibling context`, `concurrent unrelated draft`, or `boundary-changing sibling`. If the classification is boundary-changing, update the active ticket/spec before final proof and rerun affected lanes; if it is read-only sibling context, keep the ledger as closeout evidence rather than expanding the active ticket.

## Split Phase Completion

When a spec phase or checklist item is satisfied by the combination of an already-landed predecessor plus the current ticket, record the basis before marking the phase complete:

- predecessor ticket/path and durable state
- current ticket-owned remaining slice
- why the combined work satisfies the spec item
- deferred sibling owner, or `none`
- proof lane that covers the current slice and any already-landed predecessor assumption you relied on

Do not mark a phase complete merely because the current ticket landed if a named predecessor or sibling condition is still unresolved.

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

### Bounded Tracked Refactor Terminal Closeout

For a small bounded refactor on an active tracked ticket, use this minimum terminal sequence when no schema/golden/migration/follow-up work is owned:

1. Prewrite the tracked ticket outcome while status remains pending: what landed, touched-file scope, generated fallout, deferred sibling/spec scope, exact source-size ledger when triggered, same-series draft delta when triggered, and exact final lanes.
2. Run the final lanes serially after that outcome text, with build-producing lanes before `dist` consumers and with focused generated-output consumers rerun after any later lane rebuilds the consumed output.
3. Apply a terminal status/proof transcription patch only after all final lanes are green or classified. Keep this patch to status and exact proof results when practical.
4. Run the narrowest ticket-dependency or markdown-integrity check when terminal status, deps, sibling state, active/archive classification, or same-series ownership is present.
5. Transcribe only the checker result, record the no-invalidation rationale, run `git diff --check`, and cover newly added untracked files explicitly before final handoff. For each untracked source, test, fixture, ticket, or report file, either run a targeted whitespace check such as `git diff --no-index --check /dev/null <path>` (treat empty stdout/stderr as whitespace-clean despite the ordinary diff exit code) or record the exact substitute lane that already covered the relevant hygiene for that file. Do not create a self-repeating hygiene loop: final `git diff --check` may be cited in the final response instead of transcribed into the ticket. If you do transcribe that final hygiene result into the ticket, rerun `git diff --check` once after the transcription and do not patch the ticket again solely to say that rerun passed.
6. In the final handoff, state that `post-ticket-review` has or has not run and name the next review/archive workflow when it has not.

### Small Tracked Engine Refactor Checklist

For a small tracked engine ticket that adds or edits TypeScript source/tests, consumes compiled `dist`, and has no schema/golden/migration/follow-up ownership, this is the preferred compact order:

1. Reassess the ticket against `docs/FOUNDATIONS.md`, the referenced spec, live source, and current `git status --short`; classify sibling scope and any stale assumptions before editing.
2. Emit the working-notes checkpoint, including the ticket-named deliverables ledger, generated-fallout expectation, output-contention plan, source-size risk, runtime surface breadth, and terminal status plan.
3. Make the source/test edits only after the checkpoint. Keep the diff inside the ticket-owned files unless live reassessment proves owned fallout.
4. Build the engine package before running focused compiled tests, then run the narrow ticket-owned `node --test packages/engine/dist/...` witness lanes.
5. Prewrite the active ticket outcome while status remains pending: what landed, touched-file scope including any untracked additions, generated fallout, sibling deferrals, exact source-size ledger when triggered, same-series draft delta when triggered, command substitutions, exact final proof lanes, and no-invalidation plan.
6. Run the ticket-named package/root lanes serially. Do not overlap any lane that rebuilds or cleans `dist`; after a broad lane rebuilds `dist`, rerun the focused compiled-output witness you still intend to cite as final acceptance evidence.
7. Apply the terminal status/proof transcription as a narrow final ticket edit only after final lanes are green or classified, then run the ticket-dependency or markdown-integrity checker when status/dependency/archive state changed.
8. Transcribe only the checker result, record why the transcription is clerical, run `git diff --check`, run targeted hygiene or record substitute coverage for untracked additions, and finish with untracked-aware `git status --short`.
9. In the final response, include tracked modified paths, untracked additions, final green lanes, cached broad-lane classifications, classified non-final lanes if any, archive status, and the `$post-ticket-review <ticket>` handoff when archival has not run.

### Bounded Draft Refactor Terminal Closeout

For a small bounded refactor on an active untracked draft ticket, use this minimum terminal sequence when no schema/golden/migration/follow-up work is owned:

1. Prewrite the draft outcome while status remains pending: what landed, touched-file scope, generated fallout, deferred sibling/spec scope, exact source-size ledger when triggered, same-series draft delta when triggered, and exact final lanes.
2. Run the final lanes serially after that outcome text, with build-producing lanes before `dist` consumers.
3. Apply a status-only terminal patch plus exact proof transcription after all lanes are green or classified.
4. Run the narrowest ticket-dependency or markdown-integrity check when terminal status, deps, sibling state, active/archive classification, or same-series ownership is present.
5. Transcribe only the checker result, record the no-invalidation rationale, run `git diff --check`, and finish with untracked-aware `git status --short`.
6. In the final handoff, state that `post-ticket-review` has or has not run and name the next review/archive workflow when it has not.

## Resume at Terminal Closeout

When resuming after context compaction, interruption, or a handoff and the remaining work appears limited to terminal closeout, use this compact sequence before any closeout edit:

1. Reopen the active ticket and confirm the visible handoff preserves the full deliverables ledger, final diff, untracked files, and proof-lane status. If not, reconstruct them from the ticket plus `git status --short`.
2. Confirm the terminal status is already supported by green, classified, or explicitly substituted final lanes, and that no source, test, fixture, schema, generated artifact, dependency, scope, acceptance, or touched-file edit remains expected.
3. Patch terminal status and proof transcription only when that edit changes no scope, acceptance criteria, command semantics, touched-file ownership, proof claims, follow-up ownership, or dependency classification. Record the no-invalidation rationale in the ticket outcome.
4. If terminal status, dependency edges, successor/follow-up ownership, sibling status, or active/archive classification changed, run the repo's narrow dependency or markdown-integrity checker immediately after the patch, or record why no checker exists.
5. Run `git diff --check` or an equivalent hygiene check covering the closeout edits, then run `git status --short` and classify the final dirty-state delta, including untracked files. Prefer citing this final hygiene result in the final response rather than patching the active ticket again. If the ticket explicitly requires the hygiene result in its outcome, transcribe it, rerun the hygiene check once after that transcription, and stop there unless the rerun exposes an actual diagnostic.
6. In the final handoff, state whether `post-ticket-review` already ran. If not, say the ticket is implemented but not archived and name `post-ticket-review` as the next review/archive workflow.
   - Use this exact handoff sentence when review/archive did not run: `Post-review: not run; the ticket is implemented but not archived. Next workflow: $post-ticket-review <ticket>.`

When proof is only partially complete after compaction or a long handoff, use this narrower recovery flow instead of jumping straight to terminal status:

1. Poll or classify any in-flight proof lane before launching another command that can contend for the same package, cache, `dist`, generated schema, compiled JSON, golden, or benchmark output.
2. Reconstruct the ticket-named deliverables ledger from the active ticket, final diff, and `git status --short`, including untracked additions.
3. Patch only the pending outcome/proof plan while status remains nonterminal when scope, touched-file ownership, command coverage, or proof claims still need final verification.
4. Run the remaining final lanes serially, with build-producing lanes before `dist` consumers and with focused compiled-output witnesses rerun after any later lane rebuilds or cleans the consumed output.
5. Apply terminal status as a final narrow patch only after the final lanes are green, classified, or explicitly substituted.
6. Run the dependency/markdown integrity check if status, dependency edges, sibling ownership, active/archive classification, or same-series ownership changed, then finish with hygiene and untracked-aware status checks.

### Status-Only Terminal Patch Sequence

When all final proof lanes are already green/classified and the only remaining closeout edit is terminal status plus exact proof transcription, use this order:

1. Patch the terminal status and exact proof transcription only; do not change scope, acceptance criteria, command semantics, touched-file ownership, follow-up ownership, or dependency classification in the same edit.
2. Record the no-invalidation rationale in the ticket outcome, for example `terminal status/proof transcription only; no scope, acceptance, command, touched-file, follow-up, or dependency change`.
3. Run the narrowest ticket-dependency or markdown-integrity check immediately when terminal status, deps, successor ownership, or active/archive classification changed or the family expects it.
4. Patch only the checker result into the ticket ledger. This checker-result transcription is clerical when it changes no ticket graph, scope, acceptance, command semantics, touched-file ownership, proof claim, follow-up ownership, or dependency classification.
   - Do not rerun the checker solely because you transcribed its exact just-run result; use `git diff --check` or the repo's normal markdown hygiene check plus untracked-aware status instead. Rerun the dependency checker if the transcription edit also changes status, deps, active/archive classification, sibling/successor ownership, or another graph-affecting claim.
5. Run the final hygiene and untracked-aware status sweep before the user handoff. The final hygiene check is allowed to live in the final response instead of the ticket outcome; if it is transcribed after the check, rerun the hygiene check once after that transcription and do not keep editing only to record the rerun.

Use this compact final handoff shape when implementation stops before archival:

- `implemented ticket`: active path and terminal status
- `archive status`: `implemented but not archived`, `archived`, or `post-ticket-review already ran`
- `tracked modified`: tracked files changed by this implementation
- `untracked added`: newly created files that `git diff --stat` will not show; use `none` only after checking `git status --short`
- `green proof lanes`: commands that passed and are final for the owned slice
- `cached broad lanes`: `none`, `cache-covered`, `cache-hit supplemental`, or `cache-hit proof pending`; for mixed Turbo output, name which broad lanes replayed cached logs and why the ticket-owned surface is still proven
- `classified red/non-final lanes`: failed, advisory, skipped, or substituted lanes with ownership classification
- `source-size ledger`: exact ledger if triggered, or `not triggered`
- `next workflow`: `$post-ticket-review <ticket>` unless archival already ran or the user explicitly asked to pause

For a large implementation diff, prefer this concrete final-response skeleton over a vague summary:

- `implemented ticket`: `<path>` — `<terminal status>`
- `tracked modified`: `<path group or exact list>; source-size ledger in <ticket/report section if triggered>`
- `untracked added`: `<exact new tests/fixtures/reports/tickets, or none>`
- `green proof lanes`: `<focused lanes>; <root/package lanes>`
- `cached broad lanes`: `<classification and direct-proof rationale, or none>`
- `classified red/non-final lanes`: `<none, or lane -> owner/substitution>`
- `archive status`: `<implemented but not archived | archived | post-ticket-review already ran>`
- `next workflow`: `Post-review: not run; the ticket is implemented but not archived. Next workflow: $post-ticket-review <ticket>.`

## Dependency Integrity Pass

If the session creates a new prerequisite/follow-up ticket, rewires deps across the active series, changes terminal status, or changes active/archive classification, treat dependency validation as immediate, not optional:

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
