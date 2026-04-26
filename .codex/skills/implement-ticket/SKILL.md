---
name: implement-ticket
description: Read, reassess, and implement a repository ticket when the user asks to implement a ticket or provides a ticket path. Use for ticket-driven work that must validate the ticket against the current codebase, surface discrepancies before coding, then implement and verify the full deliverable set.
---

# Implement Ticket

Use this skill when the user asks to implement a ticket, gives a ticket file path, or clearly wants ticket-driven execution. Covers both code-changing tickets and non-code deliverables (measured decisions, archival updates, series-status corrections).

## Required Inputs

- A ticket path, glob, or enough context to locate the ticket
- Any extra constraints from the user

## Working Notes

Load `references/working-notes.md` for the working-notes checklist, `commentary` usage, and the 1-3-1 boundary reset ledger format. Emit the compact working-notes checkpoint before coding.

Minimal checkpoint shape:

- `draft/untracked status`: active ticket/spec/sibling state that matters
- `discrepancy class`: blocking vs nonblocking live mismatches
- `authoritative boundary`: what this ticket now owns
- `expected generated fallout`: schema artifacts, goldens, compiled JSON, or `none`
- `verification substitutions`: any ticket-command or proof-shape corrections
- `acceptance-proof lanes`: final lanes you intend to cite
- `semantic corrections`: any stale draft expectation, example, or output-shape claim proven wrong by live evidence
- `deferred sibling/spec scope`: broader spec or series work explicitly confirmed out of scope, when relevant

## High-Signal Reminders

These are the reminders whose canonical guidance lives nowhere else in this skill. Rules about final-proof gating, touched-file scope sweeps, acceptance-command reconciliation, representative-corpus preflight, post-proof-edit invalidation, sibling handoffs, and already-landed slices are covered in their respective reference files.

- If the user-provided ticket path does not resolve, do a quick normalized-id/stem search across active tickets before assuming the request is blocked. Proceed only when the replacement ticket is unambiguous, and record the correction in working notes.
- If live reassessment changes an **explicit ticket deliverable** rather than only clarifying proof shape — for example the required artifact, the default reproduction command, the owned witness shape, or another user-facing contract the ticket explicitly promised — do not silently rewrite that boundary just because the draft is wrong. In this repo, `AGENTS.md` `Ticket Fidelity` still applies: stop for `1-3-1` unless the user has already authorized that class of deliverable correction.
- A stale **verification command** is not automatically the same as a changed deliverable. If the owned artifact and witness stay the same, but the ticket's literal command is repo-invalid or points at the wrong proof lane, correct the command in the active ticket before final proof instead of forcing `1-3-1`. Reserve `1-3-1` for cases where the owned deliverable itself changes.
- When a ticket names wildcard acceptance checks or grep-based emptiness proofs, validate early whether the literal pattern matches the true owned boundary. If the pattern overreaches into intentional derived surfaces outside the mutable slice, narrow the proof to the truthful owned invariant and record that correction in the active ticket before final closeout.
- When an acceptance command is a grep-based emptiness proof (`returns zero hits`, `returns empty`, or equivalent), remember that `rg` exits with status `1` when it finds no matches. Treat that combination as a passing proof result when the command otherwise ran cleanly; reserve failure classification for actual matches, stderr/tooling errors, or an over-broad pattern that still needs boundary correction.
- When a ticket owns regenerated fixtures or other generated artifacts and the repo provides a nearby helper script, validate that helper against the current live runtime/API seam before relying on it as the authoritative regen path. If the helper partially rewrites owned artifacts and then fails, treat the entire owned artifact set as dirty, regenerate it again through a known-live seam, and only then continue toward final proof.
- Once final proof starts, treat any later active ticket/spec/report edit that changes status, outcome, touched files, command ledger, acceptance wording, or other closeout metadata as proof-affecting. Reconcile the edited artifact immediately and rerun the narrowest affected proof lane before citing final acceptance.
  - Exception: append-only recording of a just-completed proof result does not invalidate that proof when it does not change status, acceptance criteria, command shape, scope, expected outcome, or any other contract. Rerun only the checks affected by the new or changed claim.
- If an explicit ticket-named acceptance lane is red after the owned slice lands, do not mark the ticket `COMPLETED` while classifying later. First classify each failing file/test. If any failure is on the changed execution path, a newly modified serialized/shared contract, or an architectural invariant the ticket touched, treat it as active-ticket-owned until proven otherwise and stop for `1-3-1` if the next fix or boundary change is not already user-authorized.
- If the user asks for a `FOUNDATIONS.md`-aligned reassessment mid-run, or confirms a recommended reassessment option, load `references/boundary-reset-recovery.md`, restate the new authoritative boundary, update the active ticket before final proof, and update sibling/spec artifacts when the corrected boundary changes their claims, dependency story, or ticket list. Then continue under the confirmed boundary.
- If you become materially stuck after a partial repair, or you now have multiple plausible fixes with different tradeoffs and the next step is no longer clearly user-authorized, stop for the repo's `1-3-1` workflow instead of continuing to iterate. State the problem, give 3 options, recommend 1, and wait for confirmation before implementing another path.

## Final-Proof Gate

Before the first lane you intend to treat as the **final** acceptance-proof run, stop and verify all of the following:

1. the active ticket status and outcome block already match the live intended result (`COMPLETED`, `BLOCKED`, narrowed scope, etc.)
2. any command substitutions or ticket-correction ledger entries are already written into the active ticket when needed
3. any sibling-ticket, dependency, spec, or touched-file-scope edits required for a truthful closeout are already done
4. the ticket's named commands are reconciled against the exact wrapper commands you intend to cite (for example root `pnpm test` versus `pnpm turbo test`)
5. the exact final proof order is chosen and no later ticket-artifact rewrite is still expected
6. no final proof lane is running in parallel with a build, schema, or artifact producer that can clean or rewrite the same output tree; a zero-test or module-resolution "green" from an overlapped compiled-output lane is invalid until rerun serially
7. any previously failed ticket-named broad lane has already been classified in the active ticket as `owned failure`, `same-series residual / dependency blocker`, or `repo-preexisting unrelated blocker`; do not use `COMPLETED` while a changed-path or architectural-invariant failure is still unclassified or still active-ticket-owned
8. the final touched-file sweep uses `git status --short` or an equivalent untracked-aware check, not only `git diff` / `git diff --stat`, so newly added ticket deliverables cannot disappear from the closeout view

If any answer is `no`, update the ticket and related artifacts first, then start the final acceptance-proof set.

## Workflow

### Ticket-Type Triage

Load `references/ticket-type-triage.md` to classify the ticket into the smallest live category before loading further references, and to run the category-specific preflights (bounded local refactor, proof/benchmark/audit/investigation, event/card/action-identity repro, gate/smoke/regression historical witness, historical-evidence sufficiency, contradictory live evidence, shared-contract downstream consumers).

For **investigation / measurement / fixture-producing** tickets, do not default to the bounded-local-refactor fast path merely because the owned files are "just a script plus artifacts." If the ticket predicts an empirical outcome, witness distribution, or measured subset shape, prefer the investigation/proof path unless reassessment proves the evidence surface is trivial and contradiction risk is low.

When the owned metric is **process-local** (`heapUsed`, GC time/percent, RSS, resident subprocess state, or similar), verify early whether the named package script / lane wrapper preserves that metric's meaning. If the runner batches multiple files in one process, adds helper subprocesses, or otherwise changes the measured process boundary, treat that wrapper as part of the owned proof surface rather than iterating on thresholds first.

When a proof ticket requires a **new calibrated threshold or ceiling**, prefer this order unless live evidence proves a different shape is cleaner: first land the narrowest truthful witness/harness, then run the smallest live calibration probe that exercises the owned seam, write the measured values and resulting threshold rationale back into the owned artifact, and only then start the final acceptance-proof lanes. Do not cite a draft or exploratory threshold as final if the ticket artifact still needs to change after calibration.

When a code migration lands but an **explicit benchmark/performance gate remains red**, do not mark the ticket `COMPLETED` merely because the implementation and ordinary tests are green. Record the measured samples, threshold comparison, and variance; create or update the follow-up owner required by the ticket/spec; update the active ticket/spec to a truthful blocked or partial state; and run dependency integrity after the ticket graph changes.

For inventory, audit, or fixture-producing tickets, verify the **live ownership unit** before building the deliverable. A ticket may name a broad semantic surface (`march`, `event-card action`, `policy profile`, etc.) while the real repo-owned boundary is finer-grained (`actionPipeline` id, card side, phase variant, emitted report row, or another runtime-owned artifact). Build the deliverable against the finest truthful live unit rather than collapsing distinct surfaces into the draft ticket's coarser prose.

For conformance, representative-corpus, or architectural-witness tickets, verify whether each named representative family actually exercises the ticket-owned runtime seam before treating the draft fixture shape as mandatory. If one production family exercises the active path and another only reaches a non-applicable or exit path, prefer a truthful split: active-path witness where live production states exercise it, non-applicable/exit witness where they do not, and a ticket/spec rewrite after `1-3-1` when the original deliverable explicitly required active-path coverage in the non-exercising family. Do not mutate production GameSpecDoc data or add game-specific engine behavior solely to manufacture a representative-family path; use a generic synthetic fixture only when the corrected boundary still requires an engine-generic second active-path witness.

For **small test-only regression tickets** whose owned deliverable is one new or modified test plus minor docs/ticket closeout, use the bounded local refactor fast path when live reassessment shows no blocking drift, no schema/fixture regeneration, and no wider shared-contract fallout. Still apply production-proof checks for stale examples, correct suite-family placement, compiled-test command shape, and acceptance-command reconciliation.

When a ticket otherwise looks bounded but changes a **serialized trace/result shape, generated schema, exported union, or required diagnostic field**, classify it as mixed `bounded local refactor + shared-contract` rather than pure bounded-local. Do an early cross-package `rg` for the changed field/type/literal, list runner/UI/report/fixture consumers, and plan a workspace-level build or typecheck lane before closeout.

### Bounded Local Refactor Fast Path

When ticket triage confirms a bounded local refactor, load `references/bounded-local-refactor.md` for the lean 9-step path. Still emit the full working-notes checkpoint before coding and still perform the final acceptance sweep before closeout.

### Phase 1: Read and Understand

1. Read `docs/FOUNDATIONS.md` before planning or coding.
2. Read the ticket file(s) matching the provided path or glob.
   - If the supplied path is missing, search for the nearest active ticket by normalized ticket id or stem before widening scope. If exactly one plausible replacement exists, use it and record `ticket entry correction: <requested path> -> <resolved ticket>` in working notes; if resolution is ambiguous, stop and clarify.
3. Read referenced specs, docs, and `Deps`. Read `AGENTS.md` and respect worktree discipline (all reads, edits, greps, moves, and verification commands use the worktree root when the ticket lives under `.claude/worktrees/<name>/`).
   - If equivalent `AGENTS.md` instructions are already in session context, rely on that context but still prefer the file when repo-local details might differ or the ticket references on-disk policy.
   - If the user explicitly points at rulebooks, rules directories, production game data, or other rule-authoritative assets, verify early whether the live bug may belong in authored spec/policy data rather than assuming the fix is engine-only. In this repo, game-backed regressions can widen from runtime code into `data/games/<game>/...` or similar GameSpecDoc-owned surfaces while still remaining the truthful ticket boundary.
   - If a referenced spec or sibling ticket is already dirty from concurrent work and the active ticket does not require a parity correction there, classify it as concurrent state, call it out in working notes or commentary, and leave it untouched.
4. Inspect repo state (e.g., `git status --short`) early. Call out unrelated dirty files, pre-existing failures, or concurrent work so your diff stays isolated.
5. Extract all concrete references: file paths, functions, types, classes, modules, tests, scripts, and artifacts the ticket expects.
   - When a draft or recently edited ticket names specific files, prefer a quick path-validation pass (`rg --files`, targeted `find`, or equivalent) before opening the file directly if there is any sign of path drift.
   - When the ticket retires or removes a public contract, literal, or descriptor shape, do one early same-package fallout sweep for that retired surface before locking the owned boundary. Prefer a fast `rg` over the affected package so same-package tests, fixtures, and presentation layers do not surface only after the first broad proof lane.
   - When tests need to exercise package `scripts/*.mjs`, verify whether the repo build actually emits those files into `dist/` before writing dist-relative imports or assertions. In this repo, tests may need to resolve the source script from package root instead.
   - For every new module or test you expect to add, decide explicitly whether imports should come from the public package surface or an internal file path. Verify the required export surface before coding rather than discovering it during the first build.
   - When a ticket names a private helper as the proof target, prefer proving the behavior through the nearest public runtime seam instead of exporting the helper only for the test. Correct the ticket wording if the public seam is the truthful contract.
   - When a new test depends on runtime-generated identifiers (for example `DecisionKey`, bind-expanded names, dynamic branch ids, or similar kernel-owned identity surfaces), do not assume the draft spec or hand-written fixture literals match the live canonical form. Prefer deriving those identifiers from the real runtime seam first and then asserting against that observed canonical sequence.
   - When a new conformance or regression test depends on production states reaching a specific runtime seam, run the smallest live witness-discovery probe before writing durable fixtures: build first if the probe consumes `dist/`, exercise the nearest public runtime API, search only enough seeds/steps to classify whether the seam is active or non-applicable, and record the probe as reassessment evidence rather than as the final proof. Encode the durable test through normal repo helpers after the boundary is settled.
   - When the ticket names wildcard acceptance checks or `returns empty` grep lanes, validate those patterns against the live repo early, especially if they span files outside the owned `Files to Touch` slice. Do not defer repo-wide empty-match assumptions until after coding.
   - If that early validation shows the ticket's literal pattern is broader than the real owned invariant, stop treating the draft pattern as authoritative. Decide the narrowest truthful live boundary up front, then carry that corrected proof description into working notes and the active ticket closeout.
6. Sanity-check ticket-named verification commands against live repo tooling before relying on them later.
   - For bounded local refactors with straightforward verification, a light command-sanity pass is enough at this stage.
   - When the command is a package-manager script target, prefer verifying the script definition and underlying runner entrypoint before using `--help` or ad hoc flags as a probe.
   - When the owned change is a **new test file only**, verify how the acceptance lane discovers files before assuming the ticket's named command covers the new witness. Check whether membership is explicit, manifest-driven, or directory-derived, and record any resulting command or lane-coverage correction before closeout.
   - When a focused proof consumes `dist/` or another regenerated build output, do not run that proof command in parallel with the build or artifact-generation step that is mutating the same output tree. Finish the producer step first, then run the consumer against stable output.
   - Load `references/verification.md` now only when the command sanity check itself is nontrivial or already reveals output contention, stale-runner drift, or tracked-vs-draft correction work that needs the fuller guidance.

#### Session, Series, and Draft Context

Load `references/implementation-general.md` for session continuity, series-slice discipline, named fallout classification, the active draft series sanity check, and ticket re-entry classification after a prior follow-up split when the ticket is not a bounded local refactor. For bounded local refactors, defer this load unless reassessment reveals split ownership, sibling drift, reopened follow-up context, or another concrete need for the broader series guidance.

When the active ticket names a sibling ticket as a condition for a deliverable, search both active `tickets/` and archived ticket roots such as `archive/tickets/` before deciding whether that condition has fired. Record the resolved sibling state in working notes when it changes the owned closeout work.

Load `references/draft-handling.md` when the active ticket or referenced artifacts are untracked drafts, or when a tracked ticket appears stale, and draft status creates real reassessment or ownership ambiguity. For bounded local refactors, untracked-draft status alone does not force this load if the active draft can be kept honest through working notes, direct reassessment, and durable closeout updates.

### Phase 2: Reassess Assumptions

7. Verify every referenced artifact against the live codebase with targeted reads and `rg`. Load `references/triage-and-resolution.md` (Artifact Verification Checklist section) for what to validate — file existence, exports/signatures, callsite ownership, claimed dead fallbacks, widened compilation families, and auto-synthesized outputs.
   - If those checks show the ticket's named code/test/module slice is already landed on live `HEAD`, explicitly classify the run as `verification + truthful closeout` rather than fresh implementation. From that point, the owned work is to validate the proof surface, confirm whether any cited blocker still reproduces, and rewrite ticket/spec/sibling artifacts before claiming completion or retaining `BLOCKED`.
8. Build a discrepancy list and classify each item per `references/triage-and-resolution.md` (Stale-vs-Blocking Triage). When legality/admissibility and sampled completion surfaces disagree, follow the Legality/Admissibility Contradiction Playbook in that reference before widening retries, adding fallbacks, or rewriting the boundary.
   - For proof, benchmark, audit, regression, or invariant-locking tickets, explicitly check whether any named warning, rejection, event, or failure surface is the architectural invariant itself or only one manifestation of it. If the live code preserves the broader invariant through a different layer or rejection surface, stop and reconcile the ticket/spec before changing production code just to force the named symptom surface.
   - When a broad acceptance lane fails or stalls inside a corpus that repo doctrine already classifies as advisory, non-blocking, or separately owned (for example via `docs/FOUNDATIONS.md`, lane-taxonomy tests, or CI workflow intent), verify that ownership before treating the surfaced file as a production-fix or harness-fix requirement. If the repo doctrine says the corpus should not block the owned ticket, prefer a truthful proof-boundary correction over repairing the advisory witness just to preserve the stale lane shape.
   - When an upstream result can be reclassified downstream (for example `completed` becoming a rejected or dead-end candidate later in the pipeline), verify that the ticket-owned diagnostic payload or invariant survives that handoff before changing retry policy, adding fallbacks, or rewriting the ticket boundary. Do not assume the first result surface is the only place the owned invariant must remain observable.
   - For microturn publication, recovery, rollback, fallback, or pass-fallback tickets, run an explicit one-rules-protocol parity sweep before treating the first fix as complete. Check the relevant surfaces together: `publishMicroturn`, `applyPublishedDecision`, `applyMove`, `applyTrustedMove`, `legalMoves`, `enumerateLegalMoves`, `probeMoveLegality`, and `probeMoveViability`. When the ticket/spec proposes direct `applyMove` / `applyTrustedMove` for an incomplete action-selection or continuation move, validate the first live transition seam against `publishMicroturn` + `applyPublishedDecision` before locking the implementation shape. The invariant should survive publication, raw/classified enumeration, direct apply, trusted apply, and probe/admissibility paths; otherwise broad parity lanes can expose the same bug after the focused seam is green.
   - For policy-preview or agent-preview tests over production incomplete action-selection moves, do not assume `enumerateLegalMoves` entries will carry a `trustedMove`. If the production surface publishes only the move plus viability, exercise the preview/runtime classification fallback rather than constructing a synthetic trusted-move index unless the ticket specifically owns trusted-move production.
   - For investigation tickets that specify *how* to measure something, explicitly check whether the ticket's proposed probe method exercises the same live semantic seam as the subsystem being characterized. If the requested method and the live kernel/runner/agent seam differ, stop and reconcile that before generating durable evidence artifacts.
   - Explicitly check that each ticket/spec-required key input, identifier, or artifact is actually owned by the module boundary you are about to change. If a requirement depends on data that this seam does not legitimately receive or control, stop for 1-3-1 before coding rather than widening the API or silently weakening the requirement ad hoc.
9. Check constraints the ticket may have underspecified. Load `references/schema-and-migration.md` (Reassessment Surfaces section) for the full shared-contract / cross-package / fixture / test-harness / rulebook / repro-reduction checklist.
   - When the contradiction is specifically a stale witness input rather than a production-code bug, classify that separately from ordinary scope drift. If the user authorizes re-blessing, prefer replacing the witness with the narrowest validated live witness instead of widening semantics just to preserve the old example.
   - For bounded local refactors in this repo, if you add or rename a warning/error/event/schema literal, immediately check shared type unions, `schemas-core` definitions, and generated schema artifacts before treating the change as purely local.
   - If you add, rename, or make required a serialized trace/result field, diagnostic outcome, generated-schema property, or exported union member, immediately search downstream package fixtures and consumers for hand-authored object literals or exhaustiveness assumptions before the first broad proof lane. Treat runner, UI, report, trace-summary, and golden-fixture fallout as shared-contract fallout, not surprise late cleanup.
   - For mutable caches or memo tables, decide `sharedStructural` versus `runLocal` explicitly instead of treating mutability alone as decisive. Verify: the cache key universe is bounded by the compiled artifact; cached values are pure functions of structural inputs; sharing cannot change cross-run semantics; and fork/reset is required only if one of those proofs fails.

For investigation-ticket-specific reassessment rules (minimal witness probe before durable artifact generation, long-running measurement narrowing, command-reproducer vs artifact-capture separation, observer-effect check, large-fixture derivation), load `references/specialized-ticket-types.md` (Investigation Ticket Reassessment Patterns section).

Load `references/triage-and-resolution.md` when discrepancy classification is nontrivial, when the ticket is not a bounded local refactor, or when reassessment reveals boundary-affecting drift that would benefit from the fuller taxonomy. A bounded local refactor may skip this load if the discrepancy handling remains straightforward and is still recorded explicitly in working notes.

If the change involves a mid-migration state or ticket rewrite, load `references/schema-and-migration.md` (Migration & Rewrite Awareness section).

10. If correcting one ticket changes ownership within an active series, load `references/implementation-general.md` (Series Consistency section) and follow the sibling coherence rules.
    - If the active ticket absorbs work originally owned by sibling draft tickets, plan the sibling-ticket status rewrite as part of closeout, not as optional cleanup after acceptance. The series artifact should tell the same ownership story as the final code and proof set.
    - If reassessment instead proves that the remaining implementation work belongs to a sibling ticket rather than the currently active one, stop and make that handoff explicit. Restate the successor owner, confirm the user has authorized that boundary change when required, update the successor and any affected sibling/spec artifacts before more code changes, then emit a fresh working-notes checkpoint and continue under the successor ticket's proof surface.
    - If the active ticket's corrected live contract changes the interface, call shape, touched-file expectation, or verification assumption used by dependent active tickets in the same series, update those dependent tickets in the same turn before final proof so the active series remains internally consistent.
    - If that same boundary correction invalidates design language, assumptions, or the ticket list in an active spec, update the active spec in the same turn before final proof so tickets and specs stay parity-aligned.
    - If the active ticket uncovers a broader architectural gap that extends beyond the owned implementation slice but is now evidenced concretely by live code, tests, or rules artifacts, do not leave that discovery implicit. Propose or draft the narrowest truthful follow-on spec/design artifact before final closeout when the user wants series artifacts kept current, or record it explicitly as required follow-up ownership when the user prefers to defer spec work.
    - Treat this as an architecture-gap extraction case rather than ordinary ticket sprawl when the local fix is valid but the session proved a missing cross-ticket contract such as runtime cache ownership, terminal-phase semantics, or another boundary that should govern future tickets as well.
11. If stronger live evidence contradicts an archived sibling ticket's benchmark or investigation verdict, load `references/triage-and-resolution.md` (Archived Sibling Contradiction section) and classify the contradiction explicitly before coding.

### Phase 3: Resolve Before Coding

Load `references/triage-and-resolution.md` (Stop Conditions and Boundary Resets section) for the full resolve-before-coding discipline: stop conditions (factually wrong ticket, unverifiable bug claim, scope gaps, semantic acceptance drift), 1-3-1 workflow, authoritative-boundary restatement, rewritten-clause sanity check, proof-shape classification, partial-completion/new-blocker handling, and acceptance-lane blocker classification.

For boundary-reset decision paths that apply after a bounded slice lands but the acceptance story shifts (broad acceptance lane classification, moved live blocker, diagnostic narrowing loop, non-implementation boundary rewrite cleanup, same-ticket widened re-entry, successor ticket re-entry, post-closeout reopen), load `references/boundary-reset-recovery.md`.

## Implementation Rules

Load `references/implementation-general.md` by default for non-bounded tickets, and for bounded local refactors only when the ticket widens beyond a simple local change, exposes split ownership/follow-up handling, or otherwise needs the broader implementation guidance. Covers general principles, TDD for implementation-discovered defects, narrowest-witness preference, bounded campaign reductions, diagnostic instrumentation, follow-up ticket creation, exploratory-diff classification, named-witness regression loop, representative-corpus preflight, same-ticket widened continuation, synthetic fixture setup, regression placement triage, and direct fallout test triage.

If the ticket is a mechanical refactor, gate/audit, investigation, groundwork, or production-proof/regression ticket, load `references/specialized-ticket-types.md`.

If the change touches schemas, contracts, goldens, or involves a migration, load `references/schema-and-migration.md`. Covers in-memory vs serialized decisions, post-migration sweeps, identifier consumer sweeps, interim shared-contract state for staged tickets, and historical benchmark worktree handling.

## Verification

Before the final acceptance-proof pass, pause on the explicit checkpoint from the **Final-Proof Gate** above: `Will the active ticket artifact change after this proof lane?` If yes, update the ticket first and only then run the final acceptance-proof set. For active draft tickets, treat the Gate as mandatory, not advisory — the ticket artifact should already be truthful before the first proof lane you plan to cite as final acceptance.

Load `references/verification.md` for non-bounded tickets, or for bounded local refactors once verification planning becomes nontrivial because of shared outputs, multi-lane acceptance proof, migration fallout, or environment/tooling ambiguity. Covers command sanity check, verification preflight, execution order, build ordering and output contention, verification safety, escalation ladder, failure isolation, schema & artifact regeneration, standard commands, and measured-gate outcome.

For performance, profiling, or audit gates, a green TAP/process exit is not enough if the command does not assert or print the ticket-owned metric. Confirm that the lane reports the concrete value, threshold, and verdict the ticket needs; otherwise run or create a repo-owned measurement path before closeout and record that command substitution in the active ticket.

Load `references/verification-acceptance-proof.md` for acceptance-proof discipline: acceptance command reconciliation, wrapper and child command isolation, silent-but-healthy lanes, broad-lane failure classification, post-proof-edit invalidation, focused recovery loop, unrelated failure vs owned regression, package script / runner widening, and final-proof choreography.

For bounded local refactors, if the owned focused witness is green but a broader acceptance lane fails, rerun the first failing file or command directly before editing anything else. If the broad-lane failure is a timeout, repeated quiet-progress stall, or silent/noisy harness behavior, load `references/verification-noisy-harness.md` before the direct rerun and use a bounded single-file probe. Classify the result as `owned regression`, `owned fallout`, `repo-preexisting unrelated blocker`, or `harness-noisy / not final-confirmed`, then record that classification in the active ticket closeout instead of leaving the broad failure ambiguous.

If the failing broad lane was named by the ticket and the direct rerun exposes a changed-path failure, serialized-contract fallout, or architectural invariant touched by the ticket, the active ticket is not closeout-complete. Fix it, or use the repo `1-3-1` flow to get explicit authorization for a narrower durable state or sibling handoff before setting the ticket status to `COMPLETED`.

Load `references/verification-noisy-harness.md` for silent/noisy harness handling: standalone silent acceptance command, long-running package lane progress triage, owned witness preservation under harness-noisy lanes, single focused proof file silence, artifact hygiene during rerun, harness defect escalation triage, and durable closeout with mixed results.

For evidence states, trace-heavy ticket inspection, and generated artifact triage, load `references/verification-evidence.md`.

## Follow-Up

Load `references/closeout-and-followup.md` for non-bounded tickets, or for bounded local refactors when closeout needs follow-up classification, ticket blocking, sibling rewrites, or other nontrivial handoff work. Covers the closeout summary, final acceptance sweep, acceptance-proof invalidation rules, tracked-ticket durable outcome block, durable state classification (`COMPLETED` / `BLOCKED by prerequisite` / `PENDING untouched`), state-transition ledger, draft-ticket durable closeout, touched-file scope sweep, correction ledger pattern, draft-ticket closeout order, dependency integrity pass, sibling absorbed ownership, and compact final-proof / investigation-ticket / evidence-ticket ledgers.

## Codex Adaptation Notes

- Replaces Claude-specific invocation arguments with normal Codex conversation context.
- Do not rely on Claude-only skills or slash-command behavior.
- Execute implementation directly once the ticket is verified and no blocking discrepancy remains.
- When inspecting markdown from the shell, avoid unescaped backticks in search patterns; prefer plain-string anchors or direct file reads.
- For profiling or benchmark gate tickets, treat the ticket-owned harness/log/report surface as authoritative over exploratory single-run probes when the two differ.

## Example Prompts

- `Implement tickets/LEGACTTOO-009.md`
- `Implement the ticket at .claude/worktrees/feature-a/tickets/FOO-003.md`
- `Implement tickets/FITLSEC7RULGAP-001*. Read dependent specs first and stop if the ticket is stale.`
