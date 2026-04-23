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

## High-Signal Reminders

- If the user-provided ticket path does not resolve, do a quick normalized-id/stem search across active tickets before assuming the request is blocked. Proceed only when the replacement ticket is unambiguous, and record the correction in working notes.
- If the active ticket is an untracked or draft ticket that you expect to rewrite durably (`COMPLETED`, `BLOCKED`, scope correction, outcome block), update the ticket before the final acceptance-proof pass so the last green run matches both code and ticket artifact.
- If live reassessment changes an **explicit ticket deliverable** rather than only clarifying proof shape — for example the required artifact, the default reproduction command, the owned witness shape, or another user-facing contract the ticket explicitly promised — do not silently rewrite that boundary just because the draft is wrong. In this repo, `AGENTS.md` `Ticket Fidelity` still applies: stop for `1-3-1` unless the user has already authorized that class of deliverable correction.
- Before marking a ticket complete, compare the ticket's named files/artifacts against the actual touched-file scope, including untracked files.
- If a ticket's named `Files to Touch` / `What to Change` list includes paths that reassessment proves do not require edits, do not silently ignore that mismatch. Either make the required change, or record the boundary correction in the active ticket before closeout so the untouched path is explained truthfully.
- If the final diff includes newly touched files or generated artifacts that the ticket did not name, do not leave that mismatch implicit. Update the active ticket's touched-file scope before closeout so the recorded boundary matches the live diff in both directions.
- Before marking a ticket complete, compare the ticket's named verification commands against the final proof set. Either run each named command directly or record, in the active ticket outcome, the exact broader lane that subsumed it.
- When a proof/regression ticket calls for a **small representative corpus** rather than a historically fixed witness set, preflight each candidate seed/case once through the authoritative live path before hardcoding the final witness subset. If one candidate fails for an unrelated live bug outside the owned invariant, replace it with an equivalently representative passing candidate and record that correction in the active ticket before final proof; this is ordinary reassessment, not a 1-3-1 boundary reset, as long as the ticket did not require the original candidate specifically.
- When a ticket names wildcard acceptance checks or grep-based emptiness proofs, validate early whether the literal pattern matches the true owned boundary. If the pattern overreaches into intentional derived surfaces outside the mutable slice, narrow the proof to the truthful owned invariant and record that correction in the active ticket before final closeout.
- When an acceptance command is a grep-based emptiness proof (`returns zero hits`, `returns empty`, or equivalent), remember that `rg` exits with status `1` when it finds no matches. Treat that combination as a passing proof result when the command otherwise ran cleanly; reserve failure classification for actual matches, stderr/tooling errors, or an over-broad pattern that still needs boundary correction.
- Before any “final” acceptance run, stop and ask: `Will the active ticket artifact change after this proof lane?` If yes, update the ticket first and only then run the final acceptance-proof set.
- Treat any code, test, fixture, generated-artifact, or ticket-text edit made after a proof lane as proof-invalidating for every affected acceptance command. Rerun the impacted focused/package/workspace lanes after those edits land; do not cite the earlier green run as final.
- When a ticket owns regenerated fixtures or other generated artifacts and the repo provides a nearby helper script, validate that helper against the current live runtime/API seam before relying on it as the authoritative regen path. If the helper partially rewrites owned artifacts and then fails, treat the entire owned artifact set as dirty, regenerate it again through a known-live seam, and only then continue toward final proof.
- If you become materially stuck after a partial repair, or you now have multiple plausible fixes with different tradeoffs and the next step is no longer clearly user-authorized, stop for the repo's `1-3-1` workflow instead of continuing to iterate. State the problem, give 3 options, recommend 1, and wait for confirmation before implementing another path.

## Final-Proof Gate

Before the first lane you intend to treat as the **final** acceptance-proof run, stop and verify all of the following:

1. the active ticket status and outcome block already match the live intended result (`COMPLETED`, `BLOCKED`, narrowed scope, etc.)
2. any command substitutions or ticket-correction ledger entries are already written into the active ticket when needed
3. any sibling-ticket, dependency, spec, or touched-file-scope edits required for a truthful closeout are already done
4. the exact final proof order is chosen and no later ticket-artifact rewrite is still expected

If any answer is `no`, update the ticket and related artifacts first, then start the final acceptance-proof set.

## Workflow

### Ticket-Type Triage

Load `references/ticket-type-triage.md` to classify the ticket into the smallest live category before loading further references, and to run the category-specific preflights (bounded local refactor, proof/benchmark/audit/investigation, event/card/action-identity repro, gate/smoke/regression historical witness, historical-evidence sufficiency, contradictory live evidence, shared-contract downstream consumers).

For **investigation / measurement / fixture-producing** tickets, do not default to the bounded-local-refactor fast path merely because the owned files are "just a script plus artifacts." If the ticket predicts an empirical outcome, witness distribution, or measured subset shape, prefer the investigation/proof path unless reassessment proves the evidence surface is trivial and contradiction risk is low.

For inventory, audit, or fixture-producing tickets, verify the **live ownership unit** before building the deliverable. A ticket may name a broad semantic surface (`march`, `event-card action`, `policy profile`, etc.) while the real repo-owned boundary is finer-grained (`actionPipeline` id, card side, phase variant, emitted report row, or another runtime-owned artifact). Build the deliverable against the finest truthful live unit rather than collapsing distinct surfaces into the draft ticket's coarser prose.

### Bounded Local Refactor Fast Path

When ticket triage confirms a **bounded local refactor**, use this lean path unless reassessment later proves the boundary wider:

1. Read `docs/FOUNDATIONS.md`, the ticket, referenced specs/docs/Deps, and `AGENTS.md`.
2. Inspect repo state early and validate ticket-named files/functions/commands against the live codebase.
   - When the ticket changes a public helper contract, exported JSDoc, or another API-surface guarantee, do one quick export-surface sweep for sibling public wrappers, batch variants, or re-exported entrypoints that may inherit the same contract. Do not assume the draft ticket's seed list is the full public surface when the live package exports a wider helper family.
   - When the ticket adds a new test file, verify the correct suite family against nearby witnesses and the live lane manifest before coding, not just the literal draft path. In this repo, `unit`, `integration`, `determinism`, `performance`, `memory`, and `e2e` encode proof ownership, so a draft example path may point at the wrong family even when the filename stem is otherwise fine.
3. Do a **command sanity pass** for ticket-named verification commands. You do not need the full `references/verification.md` load yet if the checks stay straightforward.
   - Prefer reading `package.json`, runner scripts, or lane manifests before probing package-manager commands with flags such as `--help`; do not assume script-level `--help` is non-executing.
   - Distinguish `the command is repo-valid` from `the command is runnable right now in the current artifact state`. If a lane depends on generated `dist/` output or another mutable build artifact, verify that prerequisite state explicitly before using the lane as the first acceptance-proof run.
   - In this repo, if a ticket names a stale focused engine proof command, prefer replacing it with the concrete runner shape the package actually supports: build first, then run `node --test dist/<focused-test>.js` from the package root, and record the correction in the active ticket outcome before final proof.
   - In this repo, when you need a truly focused runner proof lane, do not assume `pnpm -F @ludoforge/runner test -- <file>` narrows Vitest to that file. Prefer `pnpm -F @ludoforge/runner exec vitest run <file>` after confirming the package script/runner wiring, and record any substitution in the active ticket outcome before final proof.
   - When the ticket extends a helper with a diagnostic sibling, widened return shape, or other comparison-only contract, confirm the exact compared types from the canonical runtime surface before coding. Do not infer imported type paths or serialized-vs-runtime field shapes from draft prose when the live helper is meant to mirror an existing authoritative surface.
4. Load `references/implementation-general.md` only if the ticket widens beyond the simple local slice, exposes sibling/follow-up ownership drift, or otherwise needs the broader series guidance.
5. Load `references/draft-handling.md` for bounded local refactors only when draft status creates real boundary uncertainty:
   - the draft ticket/spec wording appears stale or contradictory
   - multiple sibling drafts may have overlapping ownership
   - the ticket needs durable draft-ticket correction beyond the normal working-notes checkpoint and closeout
   Otherwise, it is sufficient to record draft status in working notes and correct the active draft ticket during closeout.
6. Load the full `references/verification.md` only when verification planning becomes nontrivial because of shared outputs, multi-lane acceptance proof, migration fallout, or tooling ambiguity.
   - For straightforward bounded local refactors, prefer a cheap proof order: local package build or compile check first, then the narrowest focused test/proof lane for the owned change, then the package-level suite, then workspace-wide lanes last.
   - When the owned change is documentation-only or contract-surface-only (for example JSDoc, assertion markers, helper boundary wording, or other intended no-behavior-change normalization), prefer `build` plus the smallest retained witness on the owned helper/runtime seam, then package `lint` and `typecheck`, before considering broader package/workspace `test` lanes. If the draft ticket names broader commands, rewrite that proof substitution into the active ticket before final proof.
   - When the owned implementation slice and verified fallout stay inside one package, prefer rewriting draft acceptance commands from workspace-wide `pnpm turbo ...` lanes to the narrowest package-local build/typecheck/lint/test lanes that fully prove that package-owned boundary. Record the substitution in the active ticket before final proof instead of leaving a broader draft command in place by default.
   - If the ticket names only one focused proof file but the live diff changes additional owned seams that the named file does not exercise directly, add the smallest adjacent retained witness for each uncovered seam and record that proof-scope correction in the active ticket outcome before final proof.
   - When focused proof lanes, package suites, or workspace lanes consume freshly built `dist` output or another mutable package artifact, do not run them in parallel with the build step or with other commands that rebuild the same package. Finish the producing build first, then run the dependent proof lanes, package suite, and workspace lanes against that completed artifact set in sequence.
   - If an acceptance command cleans or rebuilds a shared output tree that another acceptance command reads from, treat that subset as order-sensitive even if the commands would otherwise be parallelizable. Shared `dist/` consumers are the common case: build first, then read-only proof lanes afterward.
   - Even when commands do not rebuild shared artifacts, do not fan out multiple expensive acceptance lanes in parallel when they overlap the same large corpus. Prefer one broad lane or one focused lane at a time, especially in constrained environments such as WSL2 or other memory-limited sessions.
7. Still emit the full working-notes checkpoint before coding and still perform the final acceptance sweep before closeout.
8. If the active ticket is an untracked or draft ticket that you expect to mark `COMPLETED`, `BLOCKED`, or otherwise durably rewrite at closeout, load `references/closeout-and-followup.md` before the final acceptance-proof pass so the ticket update lands before the last green run rather than invalidating it afterward.
9. If live proof shows that a ticket-owned witness input (seed set, benchmark case list, pinned exemplar, historical repro id, etc.) is stale and the user approves a re-blessing path, keep the change narrow:
   - Prefer the smallest credible candidate search first: already-curated nearby seeds/cases, the previous witness family, or explicitly referenced historical candidates before broad brute-force probing.
   - Capture exact old-vs-new witness evidence during reassessment so the ticket correction can cite why the original witness drifted under the live code.
   - Update the active ticket's correction ledger and witness description before the final acceptance-proof pass so the last green run matches the re-blessed artifact.
   - If the ticket only asked for a representative sample (`roughly 4-6 seeds`, `small cross-game corpus`, or similar) and did not bind ownership to exact candidates, first do a cheap fresh-path probe of the candidate pool. Keep the final set small, representative, and passing on the owned invariant; exclude unrelated failing candidates and record the substitution explicitly in the ticket outcome.
   - When the stale witness is a recorded benchmark or performance ceiling rather than a semantic correctness example, first distinguish `stale recorded budget` from `live runtime regression`:
     1. compare the failing witness against nearby control cases or previously stable exemplars in the same harness
     2. check whether the owned implementation actually changed the measured hot path or only invalidated an old stored baseline
     3. rebaseline only when the evidence shows the harness expectations are stale while the live runtime contract remains correct
     4. once the previously failing witness now terminates honestly, classify the remaining gap explicitly as either `correctness/pathology still unresolved` or `budget now stale after the fix`; only rebaseline in the second case
   - Record that classification explicitly in working notes and the active ticket correction ledger so rebasing does not look like silently relaxing a performance guard.

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
   - When a new test depends on runtime-generated identifiers (for example `DecisionKey`, bind-expanded names, dynamic branch ids, or similar kernel-owned identity surfaces), do not assume the draft spec or hand-written fixture literals match the live canonical form. Prefer deriving those identifiers from the real runtime seam first and then asserting against that observed canonical sequence.
   - When the ticket names wildcard acceptance checks or `returns empty` grep lanes, validate those patterns against the live repo early, especially if they span files outside the owned `Files to Touch` slice. Do not defer repo-wide empty-match assumptions until after coding.
   - If that early validation shows the ticket's literal pattern is broader than the real owned invariant, stop treating the draft pattern as authoritative. Decide the narrowest truthful live boundary up front, then carry that corrected proof description into working notes and the active ticket closeout.
6. Sanity-check ticket-named verification commands against live repo tooling before relying on them later.
   - For bounded local refactors with straightforward verification, a light command-sanity pass is enough at this stage.
   - When the command is a package-manager script target, prefer verifying the script definition and underlying runner entrypoint before using `--help` or ad hoc flags as a probe.
   - Load `references/verification.md` now only when the command sanity check itself is nontrivial or already reveals output contention, stale-runner drift, or tracked-vs-draft correction work that needs the fuller guidance.

#### Session, Series, and Draft Context

Load `references/implementation-general.md` for session continuity, series-slice discipline, named fallout classification, the active draft series sanity check, and ticket re-entry classification after a prior follow-up split when the ticket is not a bounded local refactor. For bounded local refactors, defer this load unless reassessment reveals split ownership, sibling drift, reopened follow-up context, or another concrete need for the broader series guidance.

Load `references/draft-handling.md` when the active ticket or referenced artifacts are untracked drafts, or when a tracked ticket appears stale, and draft status creates real reassessment or ownership ambiguity. For bounded local refactors, untracked-draft status alone does not force this load if the active draft can be kept honest through working notes, direct reassessment, and durable closeout updates.

### Phase 2: Reassess Assumptions

7. Verify every referenced artifact against the live codebase with targeted reads and `rg`. Load `references/triage-and-resolution.md` (Artifact Verification Checklist section) for what to validate — file existence, exports/signatures, callsite ownership, claimed dead fallbacks, widened compilation families, and auto-synthesized outputs.
8. Build a discrepancy list and classify each item per `references/triage-and-resolution.md` (Stale-vs-Blocking Triage). When legality/admissibility and sampled completion surfaces disagree, follow the Legality/Admissibility Contradiction Playbook in that reference before widening retries, adding fallbacks, or rewriting the boundary.
   - For proof, benchmark, audit, regression, or invariant-locking tickets, explicitly check whether any named warning, rejection, event, or failure surface is the architectural invariant itself or only one manifestation of it. If the live code preserves the broader invariant through a different layer or rejection surface, stop and reconcile the ticket/spec before changing production code just to force the named symptom surface.
   - When a broad acceptance lane fails or stalls inside a corpus that repo doctrine already classifies as advisory, non-blocking, or separately owned (for example via `docs/FOUNDATIONS.md`, lane-taxonomy tests, or CI workflow intent), verify that ownership before treating the surfaced file as a production-fix or harness-fix requirement. If the repo doctrine says the corpus should not block the owned ticket, prefer a truthful proof-boundary correction over repairing the advisory witness just to preserve the stale lane shape.
   - When an upstream result can be reclassified downstream (for example `completed` becoming a rejected or dead-end candidate later in the pipeline), verify that the ticket-owned diagnostic payload or invariant survives that handoff before changing retry policy, adding fallbacks, or rewriting the ticket boundary. Do not assume the first result surface is the only place the owned invariant must remain observable.
   - For investigation tickets that specify *how* to measure something, explicitly check whether the ticket's proposed probe method exercises the same live semantic seam as the subsystem being characterized. If the requested method and the live kernel/runner/agent seam differ, stop and reconcile that before generating durable evidence artifacts.
   - Explicitly check that each ticket/spec-required key input, identifier, or artifact is actually owned by the module boundary you are about to change. If a requirement depends on data that this seam does not legitimately receive or control, stop for 1-3-1 before coding rather than widening the API or silently weakening the requirement ad hoc.
9. Check constraints the ticket may have underspecified. Load `references/schema-and-migration.md` (Reassessment Surfaces section) for the full shared-contract / cross-package / fixture / test-harness / rulebook / repro-reduction checklist.
   - When the contradiction is specifically a stale witness input rather than a production-code bug, classify that separately from ordinary scope drift. If the user authorizes re-blessing, prefer replacing the witness with the narrowest validated live witness instead of widening semantics just to preserve the old example.
   - For bounded local refactors in this repo, if you add or rename a warning/error/event/schema literal, immediately check shared type unions, `schemas-core` definitions, and generated schema artifacts before treating the change as purely local.
   - For mutable caches or memo tables, decide `sharedStructural` versus `runLocal` explicitly instead of treating mutability alone as decisive. Verify: the cache key universe is bounded by the compiled artifact; cached values are pure functions of structural inputs; sharing cannot change cross-run semantics; and fork/reset is required only if one of those proofs fails.

For investigation tickets whose primary output is a checked-in measurement artifact, do one **minimal witness probe** before durable artifact generation whenever the ticket predicts a specific distribution, subset size, or diagnostic outcome. If that first probe contradicts the framing, stop for 1-3-1 before writing the durable fixture/report artifact; use a temp path or ephemeral output until the measurement seam is confirmed.

When an investigation/profiling ticket needs one command to **reproduce the live failure** and a different command to **produce a durable artifact** (for example a stable snapshot/report run versus a higher-turn crash repro), do not collapse them into one fuzzy story. Treat them as two explicit evidence lanes:

1. identify which command is the best failure repro
2. identify which command is the best durable artifact-capture path
3. if the ticket draft claimed one command served both roles and live evidence disproves that, stop for `1-3-1` unless the user has already authorized that deliverable correction
4. once authorized, record both commands explicitly in the active ticket outcome/report before the final proof pass

For heavy diagnostics that may run silently for a long time or where post-processing can distort the measured surface, add a lightweight observer-effect check before finalizing the artifact:

1. add only the minimum progress instrumentation needed to distinguish `still running` from `stuck`
2. keep that instrumentation outside the owned metric whenever practical, or report clearly when it can perturb the measurement
3. separate the target-system metric from analysis/post-processing overhead when both occur in one script (for example simulation heap versus heap-snapshot parsing cost)
4. report both numbers distinctly if the post-processing step materially changes the observed totals

When the owned deliverable is a large checked-in fixture or inventory artifact, prefer generating it from the most authoritative live seam available (compiled spec surface, runtime snapshot, parser output, or equivalent) instead of hand-authoring repeated rows. Before check-in:

1. record the derivation source in working notes
2. capture a compact summary (`entry counts`, `surface classes`, `deepest cases`, or similar) so the artifact can be sanity-checked without rereading the whole file
3. add or extend a validator that proves schema conformance plus coverage parity against the same live seam when proportionate

Load `references/triage-and-resolution.md` when discrepancy classification is nontrivial, when the ticket is not a bounded local refactor, or when reassessment reveals boundary-affecting drift that would benefit from the fuller taxonomy. A bounded local refactor may skip this load if the discrepancy handling remains straightforward and is still recorded explicitly in working notes.

If the change involves a mid-migration state or ticket rewrite, load `references/schema-and-migration.md` (Migration & Rewrite Awareness section).

10. If correcting one ticket changes ownership within an active series, load `references/implementation-general.md` (Series Consistency section) and follow the sibling coherence rules.
    - If the active ticket absorbs work originally owned by sibling draft tickets, plan the sibling-ticket status rewrite as part of closeout, not as optional cleanup after acceptance. The series artifact should tell the same ownership story as the final code and proof set.
    - If the active ticket's corrected live contract changes the interface, call shape, touched-file expectation, or verification assumption used by dependent active tickets in the same series, update those dependent tickets in the same turn before final proof so the active series remains internally consistent.
    - If that same boundary correction invalidates design language, assumptions, or the ticket list in an active spec, update the active spec in the same turn before final proof so tickets and specs stay parity-aligned.
    - If the active ticket uncovers a broader architectural gap that extends beyond the owned implementation slice but is now evidenced concretely by live code, tests, or rules artifacts, do not leave that discovery implicit. Propose or draft the narrowest truthful follow-on spec/design artifact before final closeout when the user wants series artifacts kept current, or record it explicitly as required follow-up ownership when the user prefers to defer spec work.
    - Treat this as an architecture-gap extraction case rather than ordinary ticket sprawl when the local fix is valid but the session proved a missing cross-ticket contract such as runtime cache ownership, terminal-phase semantics, or another boundary that should govern future tickets as well.
11. If stronger live evidence contradicts an archived sibling ticket's benchmark or investigation verdict, load `references/triage-and-resolution.md` (Archived Sibling Contradiction section) and classify the contradiction explicitly before coding.

### Phase 3: Resolve Before Coding

Load `references/triage-and-resolution.md` (Stop Conditions and Boundary Resets section) for the full resolve-before-coding discipline: stop conditions (factually wrong ticket, unverifiable bug claim, scope gaps, semantic acceptance drift), 1-3-1 workflow, authoritative-boundary restatement, rewritten-clause sanity check, proof-shape classification, partial-completion/new-blocker handling, and acceptance-lane blocker classification.

When the user approves a non-implementation boundary rewrite after 1-3-1, use this cleanup order before durable series edits:

1. Classify any in-progress code/test/schema/artifact diff for the abandoned path as exploratory or abandoned implementation work.
2. Restore, delete, or otherwise isolate that abandoned diff before rewriting active ticket/spec artifacts, unless the user explicitly wants it preserved as an investigation artifact.
3. Rewrite the active ticket to its truthful durable state (`BLOCKED`, narrowed historical draft, corrected boundary, etc.).
4. Create or update successor tickets and dependent sibling tickets/specs in the same turn so the active series tells one consistent ownership story.
5. Run the narrowest consistency proof for the rewrite itself (for example dependency or archival checks) after the artifact rewrite lands.

## Implementation Rules

Load `references/implementation-general.md` by default for non-bounded tickets, and for bounded local refactors only when the ticket widens beyond a simple local change, exposes split ownership/follow-up handling, or otherwise needs the broader implementation guidance. Covers general principles, TDD for implementation-discovered defects, narrowest-witness preference, bounded campaign reductions, diagnostic instrumentation, follow-up ticket creation, and exploratory-diff classification after ticket splits.

If the ticket is a mechanical refactor, gate/audit, investigation, groundwork, or production-proof/regression ticket, load `references/specialized-ticket-types.md`.

If the change touches schemas, contracts, goldens, or involves a migration, load `references/schema-and-migration.md`. Covers in-memory vs serialized decisions, post-migration sweeps, identifier consumer sweeps, interim shared-contract state for staged tickets, and historical benchmark worktree handling.

For named-witness regression tickets that cite a small seed/case matrix, add one cheap direct witness loop between candidate fixes and the heavier acceptance lanes:

1. rerun the exact named seeds/cases directly through the most authoritative live seam available
2. use that matrix to classify `still broken`, `partially repaired`, or `fully repaired on owned witnesses`
3. if the result is only `partially repaired`, stop for `1-3-1` before continuing when the remaining fix path is no longer obvious
4. only return to the heavier focused/package/workspace acceptance lanes once the named witness matrix matches the intended boundary

For representative-corpus proof tickets that do **not** bind to exact seeds/cases, use this compact preflight before writing or finalizing the durable witness set:

1. probe each candidate once through the authoritative fresh path
2. classify each candidate as `owned invariant exercised cleanly` or `candidate blocked by unrelated live failure`
3. keep the smallest representative passing subset that still covers the ticket's stated surface
4. record any dropped candidate and replacement in the ticket outcome before final proof so the closeout explains why the final corpus changed

### Synthetic Fixture Checklist

When a ticket needs a new narrow kernel/compiler proof with a synthetic fixture, prefer this setup unless live code says otherwise:

1. Use the real runtime seam whenever practical (`resolveMoveDecisionSequence`, `legalChoices`, classifier/admission helpers, etc.) instead of mocked request objects or hand-simulated intermediate structures.
2. Reuse existing fixture helpers such as `asTaggedGameDef`, effect-tag helpers, and nearby state builders before inventing new one-off scaffolding.
3. Verify whether the test should import from the public package surface or an internal module before writing the fixture.
4. If the assertion depends on runtime-generated identifiers, derive the canonical identifiers from the live seam first, then build the expected witness/certificate/assertion payload from that observed sequence rather than hardcoding draft-shaped literals.
5. If the production seam is intentionally absent because the ticket is proving feasibility ahead of implementation, prefer the smallest deterministic sketch harness that models the proposed contract directly. Keep that scaffold local to the test/prototype surface and make the proof target explicit (`feasibility`, `suspend/resume ordering`, `serialization stability`, etc.), not production readiness.

When a synthetic fixture proves simulator boundedness, turn retirement, or `runGame` stop behavior, add this stale-witness check before treating silence or timeout as harness drift:

1. verify the live stop budget the runtime actually enforces (`turnCount`, decision count, terminal condition, or another owned bound) instead of assuming the draft witness still targets the same budget surface
2. check that the fixture's legal-action frontier still advances the owned stop surface under the current protocol; a same-turn repeatable action may keep emitting legal decisions forever without progressing the budget the simulator now uses
3. if the fixture no longer advances that surface, fix the witness first and rerun before escalating to runner or harness diagnosis
4. when the remaining negative-path contract is a structured runtime/kernel error, prefer asserting the stable error code or equivalent structured field over a brittle regex against the formatted message

### Regression Placement Triage

When a bug lives in a shared runtime seam but the smallest truthful witness may be game-backed, choose the first regression target with this order:

1. prefer a narrow shared-seam unit test when the failing contract is reproducible without runtime-owned game identities or shipped-sequence context
2. prefer a shipped-game integration witness when the bug depends on live action identities, grant sequencing, event/card routing, or another runtime-owned surface that a synthetic fixture would have to guess
3. when both are useful, land the game-backed witness first for correctness, then add the shared-seam unit only if it stays narrow and does not duplicate the same proof burden

Record the chosen witness surface in working notes when the choice is not obvious from the ticket text.

### Direct Fallout Test Triage

When a ticket retires a public surface and the first build exposes a large direct-fallout test set, classify each affected test before editing:

1. `delete` the test when its primary asserted contract is the retired surface itself (deleted export, legacy overload, certificate/template helper, or another compatibility-era artifact)
2. `migrate` the test when it still proves a retained runtime, legality, visibility, replay, or agent behavior on the live boundary
3. if many fallout tests are deleted in one sweep, record the rationale in the active ticket outcome so the reduction is inspectable rather than looking like silent coverage loss

Use this rule to avoid both over-migrating dead compatibility tests and over-deleting tests that still prove live behavior.

## Verification

Before the final acceptance-proof pass, pause on this explicit checkpoint: `Will the active ticket artifact change after this proof lane?` If yes, update the ticket first and only then run the final acceptance-proof set.

For active draft tickets, treat the **Final-Proof Gate** above as mandatory, not advisory. Do not rely on memory that the ticket will be updated later; the ticket artifact should already be truthful before the first proof lane you plan to cite as final acceptance.

Load `references/verification.md` for non-bounded tickets, or for bounded local refactors once verification planning becomes nontrivial because of shared outputs, multi-lane acceptance proof, migration fallout, or environment/tooling ambiguity. This is the **full verification load**; do not treat the earlier command-sanity pass as requiring this whole reference by default. `references/verification.md` covers command sanity check, verification preflight, execution order, build ordering and output contention, verification safety, escalation ladder, failure isolation, schema & artifact regeneration, standard commands, and measured-gate outcome.

Before the final closeout, reconcile the ticket's explicit `Acceptance Criteria` and `Test Plan` commands against the commands you actually ran:

1. enumerate the exact named commands in the active ticket
2. mark each one as `ran directly`, `subsumed by <broader lane>`, or `not yet proven`
3. if any command remains `not yet proven`, run it or stop and explain why the ticket cannot truthfully close
4. record any non-direct subsumption in the ticket outcome so the proof trail stays inspectable

When a ticket-named **broad verification lane** (for example `pnpm turbo test`, workspace lint, or another multi-package suite) fails outside the owned diff, do not silently collapse that result into a vague "repo is red" note. Classify the failure explicitly before closeout:

1. identify the first failing owned path/test and decide whether it is inside the ticket's touched boundary
2. record the lane as either `owned failure` or `repo-preexisting unrelated blocker`
3. if it is `owned failure`, the ticket is not acceptance-proven; continue fixing or stop for `1-3-1` if the next path is unclear
4. if it is `repo-preexisting unrelated blocker`, keep the lane in the ticket outcome, cite the concrete failing path/test, state that the owned slice did not touch that surface, and preserve the proof gap explicitly instead of claiming the broad lane passed
5. only treat the ticket as closeable with that documented proof gap when the remaining acceptance evidence still truthfully proves the owned boundary and `AGENTS.md` does not require fixing the unrelated blocker as part of the ticket

After any acceptance or proof lane goes green, preserve that result only while the proved surface stays unchanged:

1. if you edit code, tests, fixtures, generated artifacts, or the active ticket text in a way that changes the acceptance story, immediately mark the affected earlier proof results as stale
2. rerun the narrowest affected focused lane first, then any broader package/workspace lanes that depended on the stale state
3. only treat the rerun set as the final proof record; earlier green runs become historical diagnostics, not closeout evidence

If the first broader proof lane fails on a newly added or modified test, do one focused recovery loop before rerunning the full lane:

1. isolate the failing owned test file or the narrowest direct harness that reproduces the failure
2. fix the issue against that focused lane first
3. if the broader lane is still running when you decide to probe the focused repro, wait for it to finish or terminate it cleanly before starting the heavy focused command; do not overlap two heavy proof lanes against the same package or artifact set
4. rerun the broader package/workspace lane only after the focused proof is green

When a broader proof lane fails on a surface that may be unrelated to the owned ticket slice, classify it before widening implementation:

1. `owned regression`: the failure directly exercises the changed contract, touched files, or an immediately dependent proof surface; fix it before treating broader proof as usable
2. `likely preexisting unrelated failure`: the failure targets a different contract or appears unchanged by the owned diff; record it explicitly, keep your diff isolated, and do not silently absorb it into the ticket scope
3. `harness/tooling defect`: the lane behavior itself appears broken or non-final; use the noisy-harness triage below before rewriting code around runner behavior

If the failure is `likely preexisting unrelated failure`, preserve the evidence in the ticket outcome or final closeout instead of quietly treating the lane as green.

When a standalone acceptance command starts cleanly but does not return a final harness summary in-terminal during the session, do not over-claim that lane as directly green. Record the exact observed output, classify whether the behavior appears to be the repo's existing silent-harness pattern or a new blocker, and state whether broader passing package/workspace suites covered the same lane.

In this repo, when the ticket names `pnpm -F @ludoforge/engine test`, inspect `packages/engine/scripts/run-tests.mjs` or the active lane manifest early enough to see whether the default lane tails into `policy-profile-quality` witnesses. If the owned ticket is not itself about policy-profile quality and the run later narrows to a long single-file convergence witness with only heartbeat progress, preserve that evidence explicitly in the ticket outcome instead of assuming the broad lane will soon return.

If that same inspection or direct witness repro shows the surfaced corpus is architecturally non-blocking or separately owned, do not keep treating it as mandatory blocking acceptance proof just because the current broad lane still includes it. Correct the lane ownership or ticket proof story first, then rerun proof against the truthful boundary.

For long-running package lanes that already printed `ok` lines for the ticket-owned retained regressions and later files, do one explicit progress triage before waiting indefinitely:

1. identify the last printed passing file and whether the runner is now only emitting repeated quiet-progress notices
2. probe the most likely expensive tail file directly with a bounded single-file run when proportionate
3. before launching that heavy tail-file probe, ensure the original broad lane is no longer running; if it is still live, either keep waiting on it or terminate it cleanly first instead of overlapping both commands
4. if that direct file run returns cleanly but the package lane still does not hand back a final shell prompt after repeated quiet-progress cycles, record the package lane as `harness-noisy / not final-confirmed` rather than blocking closeout indefinitely
5. cite the directly observed retained-regression passes plus any successful single-file tail probe separately from the noisy package-lane result

This preserves truthful proof language without requiring unbounded waiting on runner noise.

When a broad package/workspace lane becomes `harness-noisy / not final-confirmed`, preserve one deterministic **owned witness proof** whenever proportionate:

1. prefer a ticket-owned focused command, scripted replay, or exact witness file that exercises the corrected boundary directly
2. rerun that owned witness after the final code and ticket-artifact edits land
3. record it distinctly in the ticket outcome as the primary proof artifact for the owned behavior, separate from the non-final broad lane
4. do not describe the noisy broad lane as fully green unless it actually returns a final harness summary
5. before any later rebuild or rerun that touches the same produced artifacts, confirm the abandoned/noisy broad lane is no longer running; stop it first if needed so the next proof step starts from one live heavy verification lane

When a **single focused proof file** emits only an initial harness header (for example `TAP version 13`) and then stays silent, do not immediately classify it as the same package-lane noise pattern. First inspect the file or its obvious helper corpus to determine whether the lane legitimately fronts a heavy deterministic workload (large replay corpus, repeated production-spec compile, benchmark-scale fixture setup, or similar). If the workload is plausibly heavy:

1. rerun the file once with a proportionate longer bounded timeout rather than an open-ended wait
2. if it later returns cleanly, record the observed runtime in the ticket outcome so the slow-but-valid lane is distinguishable from harness drift
3. only fall back to `harness-noisy / not final-confirmed` language when source inspection and the bounded rerun still do not explain or complete the silence

If the focused file is synthetic, simulator-facing, or otherwise owns its own tiny witness fixture, do one more stale-witness check before calling it harness noise:

1. confirm the witness still progresses the live runtime seam it claims to prove (for example turn retirement, stop-budget advancement, or the current legality/publication contract)
2. if the fixture can now loop forever inside one turn or microturn budget, classify that as stale witness setup rather than reporter drift
3. repair the witness on the live seam first, then rerun the focused file before widening into runner-level diagnosis

When rerunning proof commands that write append-only local artifacts (for example temp NDJSON, captured logs, or ad hoc report files), prefer a fresh temp path per rerun or clear the artifact first so the resulting evidence reflects a single proof pass rather than accumulated historical rows.

When verification intentionally mutates a real repo file as a temporary negative/manual check, confirm that the file is restored exactly to its original contents and placement before running broader proof lanes. Treat any post-check restoration drift as proof-invalidating and rerun the affected acceptance set after the exact restore lands.

Before escalating that behavior into a harness defect or widening the ticket around runner tooling, do one concrete progress-triage pass:

1. inspect the relevant lane manifest / file list to see whether the command still had plausible slow tail files remaining after the last printed output
2. identify the most likely expensive tail file and, if proportionate, probe it directly with a bounded single-file run or source inspection
3. only treat the behavior as a likely runner defect once that triage no longer explains the silence

For durable closeout, use this rule when final proof mixes green owned witnesses with noisy broader lanes:

1. `COMPLETED` is still truthful when the owned implementation slice is proven by direct focused witnesses or equivalent deterministic owned proofs, and each non-final named broad lane is explicitly recorded as noisy/non-final rather than claimed green
2. do not mark `COMPLETED` when the only proof of the owned change depends on a lane that never returned a final result
3. if the ticket explicitly names a broad package/workspace lane as an acceptance command and that lane did not reach a final confirmed result in the current proof set, treat that command as `not yet proven` unless the active ticket is first corrected to record a truthful narrower proof substitution
4. if the ticket explicitly requires a final green result from a named broad lane and no narrower owned witness can satisfy that requirement truthfully, leave the ticket open or blocked instead of inferring success

If a ticket originally owned a specific noisy tail inside that broad lane and live proof shows the owned tail is now fixed while the remaining non-final behavior has moved to a different witness class or later file family:

1. record that shift explicitly in the active ticket outcome rather than continuing to describe the original owned tail as unresolved
2. keep the owned ticket `COMPLETED` only when the corrected slice is covered by direct focused witnesses or another deterministic owned proof
3. describe the remaining broad-lane non-final state by its new live location or witness class so the next follow-up, if any, starts from the truthful boundary

Compact closeout pattern for this case:

- `ticket corrections applied`: `<old blocking surface> -> <truthful owned boundary>`
- `subsumed proof`: `<named broad lane> -> owned witness proof plus explicit note that later quiet-progress moved to <new file or witness class>`
- `proof gaps`: `<new non-final tail outside owned scope>` or `none` if a different ticket already owns it

For long tickets whose final proof requires multiple expensive lanes after ticket-artifact rewrites, choose the final-proof choreography explicitly instead of rerunning ad hoc:

1. land all durable ticket/spec/sibling-artifact edits that change the acceptance story
2. run the producing build or artifact-generation step first when later proof lanes depend on that output
3. run the longest blocking acceptance lane next so you do not waste shorter final-proof runs on a state that may still fail
4. run the remaining shorter focused/package/workspace lanes afterward in dependency order
5. reconcile the final command ledger against the active ticket only after that exact rerun set completes

If a late artifact rewrite or benchmark rebaseline lands between those steps, treat every affected downstream proof lane as stale and restart the choreography from the earliest impacted step rather than appending one more run to the end.

For evidence states, trace-heavy ticket inspection, and generated artifact triage, load `references/verification-evidence.md`.

## Follow-Up

Load `references/closeout-and-followup.md` for non-bounded tickets, or for bounded local refactors when closeout needs follow-up classification, ticket blocking, sibling rewrites, or other nontrivial handoff work. Covers the closeout summary, final acceptance sweep, acceptance-proof invalidation rules, tracked-ticket durable outcome block, durable state classification (`COMPLETED` / `BLOCKED by prerequisite` / `PENDING untouched`), optional state-transition ledger, and draft-ticket durable closeout.

As part of the final acceptance sweep, explicitly compare `What to Change` / `Files to Touch` / other ticket-named artifacts against the final diff and untracked files before using `COMPLETED`.

If that sweep finds ticket-named files that were intentionally left untouched because reassessment proved no live change was required, do not quietly leave the mismatch behind. Record the correction in the active ticket closeout so the final artifact explains why those paths remained unchanged.

If that sweep finds additional live-diff files or generated artifacts that were not named in the ticket, treat that as the same class of ticket drift as an untouched named file. Update the active ticket before closeout so the touched-file scope explains both omitted additions and omitted removals.

When a ticket that initially looked code-only widens during live reassessment into authored game data, policy catalogs, or other rule-authoritative assets, do not leave that ownership change implicit. Update `Files to Touch` / `What to Change` before final proof so the closeout truthfully records the mixed code-plus-authored-data boundary.

When a ticket requires checked-in logs, transcripts, or other generated artifact files, verify that those artifacts are not hidden by `.gitignore` or other ignore rules before the final proof pass. Treat ignored-but-required artifacts as acceptance drift and fix the delivery path (for example by narrowing the ignore rule) before closeout.

When live implementation requires correcting stale ticket text, record a compact ledger in the active ticket before the final proof pass when proportionate:

- `ticket corrections applied`: `<stale claim> -> <live contract>`

Use this for concrete live-contract fixes such as helper signatures, export-surface ownership, touched-file scope, or verification command wording. Keep it short; do not turn it into a second narrative section when a one-line correction ledger is enough.

When the ticket lands successfully but the live investigation disproves part of the draft framing, still close the ticket truthfully if the owned evidence artifact was produced. In that case, keep the correction ledger explicit rather than quietly preserving the stale hypothesis. Typical shape:

- `ticket corrections applied`: `<draft hypothesis> -> <measured live result>`

For active draft tickets that are likely to change durable status in the same turn, use this compact closeout order before the final proof run:

1. Update the draft ticket status truthfully (`COMPLETED`, `BLOCKED`, etc.).
2. Record what landed, any boundary correction, and the verification set you intend to run.
3. Make any needed ticket-scope or touched-file corrections before the final acceptance-proof pass.
4. Run the final acceptance-proof set after those ticket edits so the last green run matches both code and ticket artifact.

If those ticket edits include path, dependency, archival, or ticket-id corrections, do one immediate narrow integrity pass before treating closeout as done:

1. Run a cheap self-reference check for the corrected literal/path when proportionate (for example `rg` on the active ticket for the old ticket id/path).
2. Run the narrowest repo integrity lane that validates ticket references or dependencies when available.
3. Treat any stale reference left inside the ticket's own correction ledger or outcome block as acceptance-proof drift and fix it before final closeout.

When the active ticket absorbed ownership from sibling draft tickets in the same series, extend that closeout order:

1. Update each affected sibling draft to a truthful durable state before or alongside the final proof pass (`DEFERRED`, `BLOCKED`, or equivalent per repo convention).
2. Add a compact historical-resolution note so the series remains inspectable without rereading the whole session.
3. Treat stale sibling draft statuses after an ownership rewrite as acceptance-proof drift, not optional postscript cleanup.

Suggested compact sibling ledger:

- `Historical Resolution`: `owned slice absorbed by <ticket> on <date> due to <boundary reason>; retained as historical draft-series record only.`

Suggested compact final-proof ledger:

- `ticket corrections applied`: `<stale claim> -> <live contract>`
- `verification set`: `<commands run directly in final proof order>`
- `subsumed proof`: `<ticket-named command> -> <broader lane>` when applicable
- `proof gaps`: `none` or `<remaining blocker>`
- `architectural follow-up`: `<new spec/ticket id or proposed artifact> for <cross-ticket contract discovered during implementation>` when the ticket uncovered a broader design gap that outlives the local fix

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

### Post-Closeout Reopen

If the user explicitly widens the work after an apparent closeout or after one acceptance-proof set already passed, treat that as a **reopen of the active ticket slice**, not as a free-floating follow-up:

1. Restate the new authoritative boundary and why it widened (`user-directed scope widening`, `new blocker inside acceptance lane`, or similar).
2. Mark the earlier acceptance proof as invalidated if any code, tests, fixtures, generated artifacts, or active-ticket text will change.
3. Re-enter reassessment only for the newly widened slice; do not redo the whole ticket blindly if the earlier verified work still stands.
4. If the widened work changes ticket status truthfully (for example from `COMPLETED` back to `BLOCKED` or `PENDING`, then back to `COMPLETED`), update the active ticket artifact so it matches the live state at each durable checkpoint.
5. Rerun the full acceptance-proof set after the reopened edits land.

## Codex Adaptation Notes

- Replaces Claude-specific invocation arguments with normal Codex conversation context.
- Do not rely on Claude-only skills or slash-command behavior.
- Execute implementation directly once the ticket is verified and no blocking discrepancy remains.
- When inspecting markdown from the shell, avoid unescaped backticks in search patterns; prefer plain-string anchors or direct file reads.
- When checking touched-file scope, remember that untracked new files may not appear in `git diff --name-only`; include them explicitly.
- For profiling or benchmark gate tickets, treat the ticket-owned harness/log/report surface as authoritative over exploratory single-run probes when the two differ.

## Example Prompts

- `Implement tickets/LEGACTTOO-009.md`
- `Implement the ticket at .claude/worktrees/feature-a/tickets/FOO-003.md`
- `Implement tickets/FITLSEC7RULGAP-001*. Read dependent specs first and stop if the ticket is stale.`
