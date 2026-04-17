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

- In Codex sessions, use concise `commentary` updates as the default surface unless the ticket requires a durable repo artifact.
- In normal Codex runs, capture the working-notes checklist in `commentary` updates and/or the final closeout; do not create a repo artifact just to hold these notes unless the ticket explicitly requires one.
- Capture reassessment outcomes affecting correctness: discrepancy lists, evidence classification, authoritative boundary restatements, verification-owned scope corrections.
- In Codex sessions, record at minimum: draft/untracked status when relevant, the discrepancy class (`blocking` vs `nonblocking`), the final authoritative boundary, and any verification command substitutions or semantic expectation corrections.
- A minimal Codex working-notes checklist is:
  - `draft/untracked status`: active ticket, referenced specs, and sibling drafts when relevant
  - `discrepancy class`: `blocking` or `nonblocking` for each boundary-affecting mismatch
  - `authoritative boundary`: the final owned implementation slice after reassessment
  - `expected generated fallout`: schema artifacts, goldens, compiled JSON, or `none`
  - `verification substitutions`: any repo-valid replacement command or required flag/output-path correction
  - `acceptance-proof lanes`: the final verification gates required before the ticket can close, distinct from intermediate green lanes
  - `semantic corrections`: any stale draft expectation, example, or output-shape claim proven wrong by live evidence
  - `deferred sibling/spec scope`: broader spec or series work explicitly confirmed out of scope, when relevant
- Before coding, emit one compact working-notes checkpoint in `commentary` (or the equivalent running notes surface) using the checklist order above. If multiple discrepancies exist, group them under the same checkpoint rather than scattering the minimum fields across multiple updates.
- Do not create scratch files solely to satisfy this requirement.
- When a ticket goes through repeated 1-3-1 boundary resets in the same session, prefer a compact authoritative-boundary ledger in working notes:
  - `previous boundary`
  - `new evidence`
  - `new authoritative boundary`
  - `invalidated proof lanes`
  - `new acceptance-proof lanes`

## Workflow

### Ticket-Type Triage

Before loading every optional reference, classify the ticket into the smallest live category that preserves correctness:

- **Bounded local refactor**: one main module or a tight cluster of same-domain files, no schema/serialized artifact ownership, no blocking discrepancies, and no verified sibling ownership drift beyond a lightweight sanity check
- **Shared-contract or migration ticket**: exported types, schemas, generated artifacts, serialized surfaces, or broad fixture fallout are likely
- **Proof, benchmark, audit, or investigation ticket**: the decisive deliverable is evidence, measurement, or a verdict rather than production code
- **Mixed ticket**: more than one category applies; load the minimum extra references for each active category rather than defaulting to the whole skill body

When the ticket is a **bounded local refactor**, keep the read phase lean after the mandatory `FOUNDATIONS.md`, ticket, `Deps`, repo-state, and `AGENTS.md` checks:

1. Validate the named files, functions, and commands.
2. Open sibling drafts only long enough to confirm the current ticket has not been absorbed or contradicted.
3. Load only the optional reference files needed by the live boundary you actually found.
4. Still emit the full working-notes checkpoint before coding.
5. Do not automatically load every later reference file named elsewhere in this skill. Treat those loads as conditional for bounded local refactors unless reassessment reveals blocking drift, migration/shared-contract fallout, or another concrete need.

When the ticket is a **proof, benchmark, audit, or investigation ticket**, do this compact gate checklist before heavy commands:

1. Identify the authoritative measurement or verdict surface (`harness`, saved report, trace, direct runner, etc.).
2. Confirm which logs, reports, or other artifacts this ticket actually owns.
3. Classify the comparison baseline as live-to-be-rerun versus already-recorded historical evidence.
4. Restate the downstream threshold action before running commands (`close sibling`, `keep sibling active`, `create follow-up`, `mark blocked`, etc.).

When a ticket depends on an **event-driven, card-driven, or action-identity-sensitive repro**, do this identity check before tracing deeper into a plausible candidate:

1. Verify the exact currently resolved card, action, branch, or other runtime-owned identity from live state, trace, or authoritative harness output.
2. Prefer that direct identity evidence over an inferred nearby candidate when multiple adjacent events or actions could explain the same symptom.
3. Record the confirmed current witness identity in working notes before deeper implementation or TDD proof work.

When a **gate, smoke, or regression ticket** depends on a named historical witness, classify that witness before preserving it literally in the active ticket:

1. `same seam`: the witness still fails or passes for the same underlying contract the ticket names.
2. `absorbed fix`: the witness is already green on current `HEAD`, so it is now a proof gate rather than a production-fix owner.
3. `new prerequisite bug`: the witness now fails for a materially different live bug class, so it should move to a new prerequisite or follow-up ticket rather than remain mislabeled inside the current gate.
4. Record that classification in working notes before coding or rewriting the active ticket.

When a **proof, benchmark, investigation, or mixed ticket** requires an exact historical reproduction artifact or incident characterization, do this historical-evidence sufficiency check before assuming the ticket can close on present-day proof alone:

1. Classify the repo evidence as `reconstructable`, `summary-only`, or `missing` for the named historical state, trace slice, or benchmark incident.
2. If the evidence is `summary-only` or `missing`, decide before closeout whether the ticket can:
   - close on an equivalent bounded live proof plus an explicit ticket rewrite
   - remain `BLOCKED` pending a reconstructable artifact or new instrumentation
   - require a 1-3-1 boundary reset because the literal historical deliverable is not currently attainable from repo-owned evidence
3. Record that classification in working notes so later implementation and closeout do not silently downgrade an exact historical deliverable into a looser modern proof.

When a profiling or investigation ticket may close on **contradictory live evidence** rather than on a code fix, use this quick contradiction checklist before widening scope:

1. Rerun the named baseline in the same environment when the ticket depends on a relative performance claim.
2. Rerun current `HEAD` in that same environment before treating an earlier recorded verdict as definitive.
3. Reclassify the current ticket as `evidence-only closeout`, `still-live fix ticket`, or `needs 1-3-1 boundary reset` before profiling deeper or editing code.

When the ticket is a **shared-contract or migration ticket**, do this compact downstream-consumer checkpoint before coding:

1. List the repo-owned downstream packages or modules that consume the changed runtime surface.
2. Classify each consumer as `runtime owner`, `serialized/display boundary`, `generated artifact consumer`, or `tests/fixtures only`.
3. Record which verification lanes are intermediate local proofs versus final acceptance-proof lanes for the ticket.
4. If any downstream consumer is outside the main package you are editing, plan at least one workspace-level build/typecheck lane before considering the ticket complete.

### Phase 1: Read and Understand

1. Read `docs/FOUNDATIONS.md` before planning or coding.
2. Read the ticket file(s) matching the provided path or glob.
3. Read referenced specs, docs, and `Deps`. Read `AGENTS.md` and respect worktree discipline (all reads, edits, greps, moves, and verification commands use the worktree root when the ticket lives under `.claude/worktrees/<name>/`).
   - If equivalent `AGENTS.md` instructions are already in session context, rely on that context but still prefer the file when repo-local details might differ or the ticket references on-disk policy.
4. Inspect repo state (e.g., `git status --short`) early. Call out unrelated dirty files, pre-existing failures, or concurrent work so your diff stays isolated.
5. Extract all concrete references: file paths, functions, types, classes, modules, tests, scripts, and artifacts the ticket expects.
   - When a draft or recently edited ticket names specific files, prefer a quick path-validation pass (`rg --files`, targeted `find`, or equivalent) before opening the file directly if there is any sign of path drift.
6. Sanity-check ticket-named verification commands against live repo tooling before relying on them later.
   - Prefer catching stale runner assumptions early (for example, Jest-style flags in a Node test-runner package) so the focused proof lane is valid before implementation starts.
   - Validate behavior, not just syntax: confirm default flag interactions, output paths, and artifact-write conditions when the ticket depends on a specific file or JSON field.
   - Determine whether each critical verification lane executes source files or compiled/generated outputs such as `dist`. If compiled/generated outputs are involved, identify the authoritative rebuild step before trusting runtime failures or green results.
   - Check whether any likely verification commands contend on generated output trees such as `dist`, schema artifacts, compiled JSON, or goldens. If they do, plan those lanes as sequential-only before you start running checks.
   - When a command is stale but the intended verification surface is clear, treat it as nonblocking drift and note the repo-valid substitution in working notes.
   - For tracked tickets kept as historical records, prefer preserving the original command block and recording the repo-valid substitution in working notes and the ticket outcome unless the user explicitly asks for in-place cleanup.
   - For active tracked tickets that are not yet archival records, correct nonblocking stale wording or path drift in place before marking the ticket complete so the active ticket remains a reliable session contract for later turns.
   - For active untracked drafts, prefer correcting stale command examples in the ticket once the repo-valid replacement is confirmed, so future turns do not inherit the drift.

#### Session and Series Context

- **Session continuity**: Reuse already-verified context from prior tickets in the same series. Prefer reusing or extracting helpers over duplicating logic. If a completed sibling already satisfied part of the current deliverable, anchor reassessment to the remaining gap.
- **Series slice discipline**: When a referenced spec is broader than the current ticket, treat the ticket as the implementation boundary unless verified evidence shows the slice is stale, internally inconsistent, or impossible without broader fallout. Confirm which broader spec work is deferred to siblings.
- **Named fallout classification**: When a ticket names multiple fallout surfaces, explicitly classify each as `still failing`, `already green`, or `already absorbed by sibling` before coding. Treat already-green named artifacts as verified non-owners unless new evidence reopens them.
- **Active draft series sanity check**: When the active draft ticket explicitly references sibling draft tickets by number, scope, or out-of-scope ownership, open those siblings long enough to confirm the current ticket has not already been absorbed, contradicted, or rendered stale. A lightweight sanity pass is enough unless reassessment reveals real ownership drift.
- **Ticket re-entry after follow-up creation**: If the same area was previously split into a follow-up ticket and the user now reopens or explicitly points back to the original ticket, classify the relationship before coding as one of:
  - `resume original`: the original ticket was never truly closed, and the follow-up is redundant or advisory
  - `continue follow-up`: the original ticket remains complete enough, and the new work still belongs to the follow-up
  - `user override of earlier split`: the user is intentionally putting the remaining work back under the original ticket
  Record that classification in working notes and restate the authoritative boundary so the active ticket/follow-up ownership is explicit before implementation resumes.

#### Draft Handling

When the active ticket or referenced artifacts are untracked drafts:

1. Confirm draft/untracked state explicitly, including siblings and referenced specs.
2. Treat the active draft ticket as the session contract once reassessment is complete.
3. Classify stale draft wording separately from true boundary errors in working notes and final closeout.
4. Prefer correcting the active draft ticket over broad sibling/spec cleanup unless the live boundary truly requires wider edits.
5. When live evidence proves a draft example snippet, helper sketch, or command block is semantically wrong but the owned boundary is still correct, update the active draft ticket so future turns do not inherit the stale example.
   - Timing: apply these nonblocking draft-ticket corrections either immediately after reassessment or during final closeout, but do not mark the ticket complete while the stale draft text remains.
   - Preference: if the stale draft text could mislead the implementation itself (for example wrong type mutability, wrong owned file, wrong command shape, or wrong acceptance semantics), correct the active draft ticket before code edits. If it only affects future readability or closeout accuracy, correcting it during final closeout is acceptable.
   - Acceptance-text rule: rewrite the active draft ticket before completion when the stale wording changes the meaning of an acceptance criterion, invariant, owned file list, or verification expectation a later turn could reasonably follow literally. A closeout-only semantic correction is sufficient only when the live boundary stayed correct and the stale text is clearly documented in the outcome without leaving the ticket’s forward-looking contract misleading.
6. Prefer minimal sibling edits until live verification or authoritative evidence proves ownership drift. If live verification forces absorbed fallout, update the active ticket outcome first, then narrow or rewrite only the directly affected siblings.
7. If a draft ticket's acceptance text or test description asserts the wrong value shape, output contract, or semantic expectation, distinguish that from a wrong implementation boundary. Wrong semantic expectations may still require a stop-and-confirm if satisfying the literal text would violate the live contract or `AGENTS.md` ticket fidelity.
8. When an active untracked draft ticket completes, update it before closeout so it reflects the final status, actual touched-file scope, and repo-valid verification commands that ran. Do not leave a completed draft with stale forward-looking acceptance text or stale command examples.

#### Draft Drift Preflight

When the active ticket is an untracked draft, or when a tracked ticket appears stale, run this quick preflight before coding:

1. Confirm ticket-named file paths still exist before opening them blindly.
2. Confirm ticket-named commands still match the live repo tooling and output paths.
3. Check example snippets for semantic drift that would mislead implementation (for example `readonly` vs mutable fields, stale return shapes, or wrong helper names).
4. Check sibling draft ownership only far enough to confirm the current ticket has not already been absorbed, contradicted, or split differently.

### Phase 2: Reassess Assumptions

6. Verify every referenced artifact against the live codebase with targeted reads and `rg`:
   - File existence and path accuracy
   - Named exports, functions, types, and signatures
   - Module structure and required dependencies/scripts
   - Concrete callsites: check whether behavior is still owned there or has been centralized behind a shared helper; treat already-migrated sites as stale sub-claims.
   - Claimed dead fallbacks: when a ticket says an immutable fallback, compatibility branch, or alternate path is now dead, enumerate remaining callers and classify the path as `dead`, `shared immutable authority`, or `must be migrated now` before accepting removal.
   - Widened compilation/optimization for an existing AST/expression family: compare live interpreter/evaluator semantics directly before accepting the ticket's claimed subset.
   - When a ticket depends on auto-synthesized or compiler-generated outputs, compare the pre-synthesis authored source, the post-synthesis compiled section, and every downstream consumer that relies on the generated ids or artifacts. Confirm they share the same live source of truth before accepting a YAML-only or caller-local fix.
7. Build a discrepancy list. Classify each item per `references/triage-and-resolution.md`.
8. When legality/admissibility and sampled completion disagree, run this contradiction playbook before widening retries, adding fallbacks, or rewriting the ticket boundary:
   - compare the raw legality/viability surface, the admission/satisfiability surface, and the sampled completion result for the same `(def, state, move)` tuple
   - if those surfaces still disagree, exhaustively classify the smallest bounded decision surface that can prove whether successful branches actually exist
   - only after that proof should you decide whether the owning seam is legality/admissibility, completion policy, or retry progression
8. Check constraints the ticket may have underspecified:
  - Shared type or schema ripple effects
  - Repo-owned downstream consumers of the changed contract, especially UI/display, trace/serialization, generated-fixture, and sibling-package boundaries
  - Staged shared-contract ownership: when the current ticket introduces a new shared field/type surface and a downstream sibling owns population, migration, or full enforcement, explicitly decide whether the interim shape must be `required now`, `optional until sibling lands`, or `blocking until 1-3-1`
   - Shared contract migration fanout: estimate the likely blast radius early with targeted `rg` counts before coding so fixture fallout, helper updates, and broad touch points are visible up front
   - Cross-package fallout for shared exported unions, serialized trace kinds, and exhaustiveness-based consumers
   - Cross-package mocked-contract fallout for shared exported unions or result-shape changes: grep sibling-package tests, mocks, worker fixtures, and structured-clone fixtures for stale discriminants, mocked return kinds, and hand-authored payload shapes
   - Same-package fallout for widened shared unions: grep local `switch` statements, discriminated-union helpers, exhaustiveness guards
   - When changing a shared callable type contract, grep both runtime callsites and their tests
   - When changing helper signatures, argument threading, or call arity, also grep for source-guard, AST-policy, and contract-style tests that assert call shape or helper wiring
   - Shared state/object-shape migrations: explicitly inspect initializers, clone/draft builders, serialization/deserialization, and any runtime delete/unset/cleanup helpers that may silently reintroduce shape drift after your main type change
   - Foundation 14 atomic migrations for removals or renames
   - Required test, schema, or fixture updates
   - Direct fixture fanout: when tests or helpers author runtime state inline, decide whether a shared builder/default can absorb the migration or whether a deliberate mechanical bulk update is the correct narrow move
   - Policy/catalog fallout for agent or scoring changes: check compiled policy catalogs, explicit consideration-list assertions, and fixed-seed policy goldens or summary traces when the repo owns them
   - Test harness / fixture-authoring invariants: when tests manually author or mutate runtime state, verify coupled invariants such as `stateHash` / `_runningHash`, trusted-move source hashes, branded-vs-serialized identifier domains, and any cache keys derived from state
   - When the ticket disputes game-specific legality, consult local rulebook extracts or rules reports
   - Acceptance criteria / test text that may be semantically stale even when the command or file path is still valid: wrong raw value shape, wrong contract expectation, wrong output type, wrong asserted invariant
   - Campaign/simulation repro reduction opportunity: whether a broad harness witness can be reduced to the earliest deterministic failing prefix and then replaced by a narrower direct proof surface without changing ticket ownership

Load `references/triage-and-resolution.md` when discrepancy classification is nontrivial, when the ticket is not a bounded local refactor, or when reassessment reveals boundary-affecting drift that would benefit from the fuller taxonomy. A bounded local refactor may skip this load if the discrepancy handling remains straightforward and is still recorded explicitly in working notes.

If the change involves a mid-migration state or ticket rewrite, load `references/schema-and-migration.md` (Migration & Rewrite Awareness section).

9. If correcting one ticket changes ownership within an active series, load `references/implementation-general.md` (Series Consistency section) and follow the sibling coherence rules.
10. If stronger live evidence contradicts an archived sibling ticket's benchmark or investigation verdict, classify that contradiction explicitly before coding:
   - `historical evidence only`: the archived sibling remains an accurate record of what was measured then, and the current ticket documents the stronger rerun plus the updated live boundary
   - `active-series contract drift`: the contradiction changes how active dependent tickets should be interpreted, so rewrite the active current ticket before completion
   - `blocking verdict conflict`: the contradiction changes the series decision boundary so materially that proceeding would violate ticket fidelity; stop via 1-3-1 before coding or closeout
   Prefer `historical evidence only` when the archived ticket remains a truthful record of its own run and the current ticket can carry the stronger same-environment comparison without misleading future work.

### Phase 3: Resolve Before Coding

Every stop condition below requires resolution before implementation proceeds.

10. **Factually wrong ticket**: Stop and present discrepancies. Do not stop for nonblocking drift (see triage reference).
11. **Unverifiable bug claim**: If a ticket's bug claim is not reproducible, or only mechanism is verified while incidence remains unproven, stop and resolve via **1-3-1** (proof-only, proof-plus-fix, or scope correction).
    - If the user confirms a proof-only or proof-plus-fix path, record explicitly whether evidence is `incidence verified`, `mechanism verified`, or `both verified`, and do not overstate reproduced incidence in working notes or closeout.
12. **Scope gaps or ambiguity**: Apply the **1-3-1 rule** (1 problem, 3 options, 1 recommendation).
13. **Semantic acceptance drift**: If a draft ticket's acceptance criteria, expected values, or test descriptions are semantically wrong about the live contract, classify whether that is:
   - nonblocking drift: the implementation boundary is still correct and the literal wording can be safely corrected in working notes / closeout without misleading the user
   - blocking drift: implementing the literal text would change or misstate the live contract, conflict with `FOUNDATIONS.md`, or violate `AGENTS.md` ticket fidelity
   For blocking drift, stop and resolve via **1-3-1** before coding.
14. Continue reassessment after each confirmation until no boundary-affecting discrepancies remain. Multiple 1-3-1 rounds are normal.
15. If a **1-3-1** stop leads to a user-confirmed boundary change for an active draft ticket, immediately refresh the working-notes checkpoint and rewrite the active ticket before coding so the recorded contract matches the confirmed direction.
16. If the confirmed resolution changes the active draft ticket's contract, rewrite the active ticket first so the implementation boundary matches the confirmed direction before coding.
16a. After rewriting the active ticket from a user-confirmed boundary reset, sanity-check each newly rewritten acceptance clause against the narrowest live witness before coding when the rewrite introduced deterministic seeds, exact counts, exact file/artifact outputs, or other concrete proof-shape claims.
   - If the rewritten clause is already directly witnessed, record that confirmation in working notes and proceed.
   - If the rewritten clause is directionally right but still overclaims a specific witness detail, correct the active ticket again before coding rather than treating the first rewrite as settled.
   - If the rewritten clause cannot be validated without wider probing than the ticket can tolerate, stop and resolve via another 1-3-1 round instead of silently weakening or assuming the proof shape.
17. Restate the authoritative boundary in working notes and confirm no blocking discrepancies remain before coding.
    - If the ticket's acceptance depends on traces, harness output, campaign metrics, or another observability surface, classify the expected proof shape before coding:
      - `direct proof`: the current repo surface exposes the exact invariant or contribution path the ticket names
      - `indirect proof`: the current repo surface proves the change through a compiled artifact, golden, catalog, or adjacent observable effect, but not the literal named field
      - `missing proof surface`: the repo cannot currently prove the acceptance claim without new instrumentation or trace/schema changes
    - `missing proof surface` is not automatically blocking when the implementation boundary is still correct, but you must explicitly decide whether the ticket can be closed with indirect proof, needs a ticket rewrite, or requires a stop-and-confirm via 1-3-1.
18. If the ticket is accurate and no blocking decision remains, proceed.
19. If valid owned work lands and only then reveals a new blocker that prevents full acceptance, treat that as a distinct `partial completion, new blocker` state rather than either forcing completion or discarding the completed work.
    - Record the completed owned work explicitly in working notes and in the active ticket.
    - Mark the active ticket `BLOCKED` rather than `COMPLETE` when acceptance is still unmet.
    - Restate the remaining unmet acceptance or invariant as the new live boundary.
    - Stop before further implementation widens the ticket again unless the user confirms the broader boundary.
20. When acceptance-lane failures persist after the original contract or boundary seam is repaired, explicitly classify whether the remaining red lane is:
    - `same seam still incomplete`: the failures still share the original ticket-owned contract/boundary cause
    - `adjacent fallout still required`: the failures are downstream but still part of the same narrowly coherent ticket-owned seam
    - `new semantic/runtime blocker`: the failures now show broader gameplay, preview, or runtime behavior divergence beyond the original seam
    If the classification is `new semantic/runtime blocker`, stop widening the active ticket by default. Record the completed owned work, mark the ticket `BLOCKED`, and create or update a follow-up ticket unless the user explicitly confirms a broader boundary.

## Implementation Rules

Load `references/implementation-general.md` by default for non-bounded tickets, and for bounded local refactors only when the ticket widens beyond a simple local change, exposes split ownership/follow-up handling, or otherwise needs the broader implementation guidance.

- If implementation exposes a new bug or semantic defect inside the owned ticket slice, follow repo TDD rules when practical: add the narrowest failing proof first, then fix it, and record the proof lane in working notes.
- Before inventing a brand-new synthetic failing test, check whether an existing nearby unit/integration fixture, regression, or focused failing lane already proves the same seam closely enough. Prefer extracting, tightening, or adapting the smallest existing repo-owned witness when it remains the narrowest valid proof.
- If a focused failing proof is not practical for an implementation-discovered defect, state why and keep the verification lane as narrow and behavior-specific as possible.
- If an initially plausible integration reproducer fails for reasons outside the owned boundary, pivot to the narrowest live authority surface that still proves the ticket's invariant. Record the substitution and whether the resulting evidence is direct or indirect.
- When a ticket's authoritative witness is a long campaign, replay, or simulation harness, prefer a compact reduction before patching:
  1. rerun the authoritative harness
  2. locate the earliest deterministic failing move prefix or state slice
  3. inspect the authoritative post-prefix runtime state or current action/card identity
  4. replace the broad repro with the narrowest direct proof lane that still preserves the ticket invariant
- If bounded reads, targeted probes, and narrow helper-level checks still cannot isolate the live hot path during reassessment, temporary diagnostic instrumentation is allowed. Keep it narrowly scoped, gate it behind an explicit env flag or similarly local switch, use it only long enough to confirm the boundary, and remove it before final verification.
- If completed owned work remains valid but a newly exposed blocker is narrower and prerequisite to the original ticket acceptance, prefer creating a new prerequisite ticket and blocking the current active ticket rather than repeatedly widening the active ticket. Keep the current ticket focused on its delivered work plus the now-explicit dependency.
- When a ticket is split after exploratory or partial code changes already exist in the worktree, explicitly classify those diffs before closeout:
  - `belongs to completed current ticket`: keep and document them under the current ticket's partial/completed outcome
  - `keep as in-progress for follow-up`: leave them in place only if they match the new live boundary and call that out explicitly in working notes or closeout
  - `revert before handoff`: remove them if they no longer belong to either the current ticket or the new prerequisite
  Record the classification so the ticket rewrite and the live workspace state do not silently diverge.

If the ticket is a mechanical refactor, gate/audit, investigation, groundwork, or production-proof/regression ticket, load `references/specialized-ticket-types.md`.

If the change touches schemas, contracts, goldens, or involves a migration, load `references/schema-and-migration.md`.

When a ticket changes an in-memory contract, object shape, or serialized surface, explicitly decide whether runtime and serialized representations are both supposed to change. Preserve or migrate serialized behavior intentionally, then record that decision in working notes before broader verification.

For broad contract migrations, representation changes, or identifier migrations, add an explicit post-implementation sweep before broad verification:
- grep for legacy comparisons, stringification, or serialization of the migrated field (`String(...)`, raw equality checks, hand-authored literals, trace/summary emitters, golden producers)
- classify each surviving surface as `must migrate`, `intentional serialized boundary`, or `non-owner`
- run one or two representative runtime proofs on user-facing or serialized surfaces before assuming typecheck-complete means ticket-complete
- when a test file mixes authored `GameSpecDoc`/spec fixtures with compiled `GameDef`/`GameState` runtime fixtures, explicitly classify each edited block as `authored boundary` or `compiled runtime` before changing ids or expectations; keep string identifiers only on the authored side unless live code proves that surface was already compiled

For identifier migrations specifically (`ActionId`, `ZoneId`, `Token.type`, variable ids, marker ids, and similar), use this compact consumer sweep:
- runtime contract and compiler lowering
- engine/runtime fixtures and helper builders
- serialized or display-restoration boundaries (runner, traces, reports, visual-config validation, human-readable logs)
- committed generated artifacts or compiled fixture consumers in sibling packages
- at least one workspace-level build/typecheck lane before closeout when more than one package consumes the migrated identifiers

When the ticket introduces a shared contract surface but a downstream sibling still owns population, migration, or full enforcement, make the interim contract state explicit before coding:
- identify which ticket introduces the surface and which sibling owns the follow-through
- decide whether the live boundary requires the new surface to be `required now`, `optional until sibling lands`, or `blocking until 1-3-1`
- rewrite active draft acceptance text before completion if the original wording would misstate that interim contract
- verify the interim shape with the narrowest build-safe proof lane instead of silently absorbing the downstream sibling's work

For historical benchmark sweeps across commits, branches, or detached worktrees:
- expect each isolated worktree to need its own dependency/bootstrap setup before the first measurement
- treat measurement logs written inside those worktrees as evidence artifacts; do not overwrite or discard them just to reuse the same worktree for a different commit
- if preserving those logs blocks further checkout movement, create a fresh isolated worktree for the next comparison rather than destroying the recorded evidence
- record in working notes which measurements were temp-worktree evidence versus which logs were refreshed in the main repo as the ticket-owned final artifacts

## Verification

Load `references/verification.md` for non-bounded tickets, or for bounded local refactors once verification planning becomes nontrivial because of shared outputs, multi-lane acceptance proof, migration fallout, or environment/tooling ambiguity. For straightforward bounded local refactors, the verification rules in this file may be applied directly without loading the extra reference.

Before running any substantive verification, do a verification preflight for each planned lane:
1. Confirm whether the command exercises source files, compiled artifacts, generated schemas, compiled JSON, or goldens.
2. Identify the authoritative rebuild/regeneration prerequisite, if any.
3. Record whether the lane is safe to overlap with other commands that touch the same outputs.
4. Decide what evidence level that lane can provide: focused proof, package-level proof, or full acceptance proof.
5. For shared-contract or migration tickets, explicitly label each lane as `intermediate green` or `acceptance-proof`; do not treat an intermediate package-local green lane as ticket completion if downstream repo-owned consumers remain unverified.

Before running broader checks, identify whether any ticket-relevant commands clean or rewrite shared outputs such as `packages/*/dist`, generated schemas, compiled JSON, or goldens. If they do, run those lanes serially even when the surrounding Codex guidance favors parallel tool use.

For bugfix tickets, the red step can come from an existing failing proof lane. If the ticket already names a failing test or reproducer that cleanly proves the bug, rerun that lane first and treat it as the red proof unless the bug needs a narrower or more direct witness. If the repo already contains a nearby passing or semantically adjacent regression that exercises the same seam, prefer adapting that witness before authoring a brand-new fixture from scratch.

If a verification lane fails immediately after overlapping output-contending commands, treat the first result as inconclusive until you rerun it serially. Recovery order:
1. Classify the failure as a possible ordering artifact rather than as code-caused.
2. Rebuild the touched package or regenerate the touched artifact tree to restore a clean authoritative output.
3. Rerun the failed proof lane serially before drawing conclusions or widening scope.

### Verification Safety

- Keep bugfix/regression verification on a red-green path: when you add or expose a focused failing proof for the ticket, keep rerunning that focused lane until it passes before escalating to broader package or repo commands.
- After a focused-front repair is green on a broad test or fixture migration, prefer package-level `typecheck` before the full package `test` lane when both are relevant. Residual mechanical fallout often appears there first and is cheaper to resolve before rerunning the full suite.
- For shared-contract, migration, or identifier-change tickets, require at least one workspace-level build or typecheck lane before declaring completion whenever another repo-owned package consumes the changed surface.
- Treat verification commands that delete or regenerate shared outputs as sequential-only unless the repo explicitly documents them as parallel-safe.
- In repositories where tests execute compiled files from `dist`, do not run build commands that rewrite `dist` in parallel with those tests. A build that starts with `rm -rf dist` can create false negative failures unrelated to the implementation.
- Treat transitive task-graph builds as output contenders too: `turbo` lanes such as `turbo typecheck` or `turbo test` may invoke package `build` tasks that rewrite `dist`, so do not overlap them with compiled-file test runs unless you have confirmed the graph is output-safe.
- If a broad verification failure appears immediately after overlapping build/test commands, rerun the affected checks sequentially before classifying the failure as code-caused.
- When the ticket changes phase transitions, running hashes, turn/phase boundary accounting, or similarly sensitive shared invariants, grep for the nearest invariant-focused test file and run that focused lane before escalating to the full package or repo suite.
- When a ticket's focused proof surface mixes a cheap new unit/integration lane with a heavier replay, campaign, or determinism lane, run the cheap independent lane first so local regressions surface before you pay the higher-cost proof run.
- When a ticket names a broad scan, campaign, replay window, or other potentially expensive proof command, estimate feasibility early with one or two representative worst-case witnesses before committing to the literal full run. If those witnesses show the named proof surface is no longer proportionate to the live boundary, stop via 1-3-1 instead of discovering that drift deep into implementation.
- For deterministic but seed-sensitive preparation flows, prefer bounded witness discovery over hardcoding an unverified seed. Keep the search bounded, deterministic, and aligned with the invariant being proven.
- When a ticket changes RNG consumption, retry branching, representative sampling order, or any other deterministic random-path behavior, immediately audit fixed-seed proof surfaces for intentional fallout: representative-seed helpers, exact completion-order assertions, exact success-count assertions, policy summary goldens, and other fixed-seed trace fixtures may need to be rewritten from old-path expectations to invariant-based proofs or refreshed golden outputs.
- For deterministic-RNG changes, prefer assertions on boundedness, determinism, witness elimination, and the intended chosen representative over preserving a formerly incidental random-path order unless the ticket explicitly owns that order as part of the contract.
- When a ticket names a simulator path, agent profile, campaign harness, replay harness, or other configuration-sensitive reproducer, preserve that authoritative setup in quick repro probes before classifying the witness as stale, fixed, or shifted. Do not treat a cheaper default-path probe as authoritative if profile wiring, RNG routing, or harness behavior can materially change the witness.
- If an initial bounded witness proves only part of the target invariant, keep searching for a stronger bounded witness before classifying the ticket as stale, contradictory, or blocked. Escalate only after bounded search aligned to the full invariant fails or reveals a true contract conflict.
- Treat generated production fixtures and compiled JSON assets as first-class owned fallout when the ticket changes the live compiled surface. Check whether authoritative verification writes or validates them, prefer isolated regeneration when unrelated fixture drift exists elsewhere in the repo, and record any intentional scoped substitution. When the change is a shared contract or identifier migration, explicitly check for downstream committed fixture consumers in other packages as well, such as runner bootstrap `*-game-def.json`, compiled production snapshots, or other checked-in generated runtime artifacts that may need regeneration before runtime verification is trustworthy.
- After any shared generator command, inspect every changed generated artifact and classify it as `owned` or `unrelated churn` before closeout. Keep owned fallout, rerun the affected checks, and revert unrelated churn so the final diff stays isolated to the ticket boundary.
- When a focused built-test rerun still hides the concrete assertion mismatch, inspect the compiled runtime object or generated artifact directly with the narrowest possible probe before patching tests or code.

### Verification Evidence States

When verification is partially blocked by environment behavior, flaky wrappers, or shell/session desynchronization, report the strongest honest evidence state instead of overstating the result:

1. `focused proof green`: the narrow reproducer or owned acceptance witness is green
2. `package lane green`: the relevant build/typecheck/test package lane is green with a confirmed exit code
3. `full acceptance green`: the complete ticket-owned verification set is green with confirmed exit codes
4. `partial clean evidence only`: logs or partial output show a clean run through a meaningful checkpoint, but the final exit code or tail segment is unconfirmed

If you cannot reach `full acceptance green`, state exactly:
- which lanes are confirmed green
- which lane or exit code remains unconfirmed
- whether the remaining gap is a code failure, an environment/tooling failure, or merely missing proof capture

For long-running suites or flaky terminal sessions, prefer capturing authoritative evidence early:
- use a stable log-capture wrapper from the start when feasible
- preserve the exact command and the intended acceptance scope
- if the environment still drops the final status, split the suite into smaller deterministic lanes rather than making an unqualified green claim
- For campaign, tournament, or trace-inspection tickets, prefer the smallest bounded seed/run window that reaches the claimed scenario or reproducer before escalating to larger harness runs. If the first bounded run misses the target behavior, widen only enough to reach the intended trace slice.
- When a ticket names a high-level reproducer but the setup proves too coupled or noisy, prefer the narrowest valid proof surface that still exercises the owned invariant: first the authority/helper that owns the behavior, then a production-data integration slice, then the broader end-to-end flow only if needed.
- For shared contract or object-shape migrations, verify both sides of the boundary deliberately: the live runtime shape you intended to change, and any serialized/golden/fixture surface you intended to preserve. Do not assume one implies the other.
- When one ticket-owned acceptance lane is known to be long-running but independent of other verification surfaces, it is acceptable to overlap that wait with non-contentious workspace checks such as downstream typecheck or unrelated package-local proof lanes, as long as the final closeout still waits for the long lane's result before claiming completion.

### Trace-Heavy Ticket Evidence

Use this when the ticket's acceptance depends on saved traces, decision-gap inspection, harness summaries, or campaign metrics:

1. Confirm which command writes the authoritative trace/report artifact and where it lands.
2. Confirm whether the existing artifact exposes the literal acceptance field or only an adjacent proxy.
3. Inspect one saved artifact directly before broad reruns so you know what the surface can and cannot prove.
4. Classify evidence gathered during verification as:
   - `direct`: the artifact shows the exact invariant the ticket names
   - `indirect`: the artifact proves the change through compiled structure, goldens, score gaps, or adjacent observable behavior
   - `insufficient`: the artifact does not expose enough to support the claim
5. If evidence remains `indirect`, state that explicitly in working notes and closeout instead of overstating certainty.

### Generated Artifact Isolation Checklist

Use this after commands that regenerate fixtures, bootstrap JSON, schema artifacts, or golden files:

1. Run the narrowest authoritative generator for the owned surface.
2. Inspect every regenerated file, not just the one the ticket named.
3. For shared contract or identifier migrations, check whether another package consumes the regenerated surface through committed fixture artifacts rather than live source compilation.
4. Classify each regenerated artifact as `owned`, `already-owned sibling fallout`, or `unrelated churn`.
5. For owned metadata or summary artifacts, verify semantic ordering as well as freshness when the generated output exposes user-facing ordered lists such as factions, phases, seats, or action summaries.
6. Keep only the owned artifacts required to make the ticket true in live runtime.
7. Revert unrelated churn before final closeout.
8. Rerun the narrowest affected proof lane after artifact triage so the kept generated files are validated.

### Standard Commands

These are the default broader verification lanes, not an automatic must-run set for every ticket. Ticket-named commands remain authoritative; when the live change boundary is narrower, run the strongest relevant subset and state what was intentionally not run.

```
pnpm turbo build
pnpm turbo test
pnpm turbo lint
pnpm turbo typecheck
pnpm turbo schema:artifacts
```

## Follow-Up

Load `references/closeout-and-followup.md` for non-bounded tickets, or for bounded local refactors when closeout needs follow-up classification, ticket blocking, sibling rewrites, or other nontrivial handoff work. A straightforward bounded local refactor may use the closeout checklist below directly without loading the extra reference.

Before declaring completion or updating the ticket status, run one final acceptance sweep against the ticket text and your final diff:
- re-check non-command acceptance constraints such as file-size caps, named line-count limits, exact file/artifact deliverables, and explicit "do not modify X" boundaries
- use cheap structural probes when helpful (`wc -l`, targeted file existence checks, touched-file scope checks including untracked files)
- re-check repo-level structural conventions from `AGENTS.md` that remain relevant even if the ticket did not name them explicitly, such as file-size guidance, worktree discipline, and explicit artifact-touch expectations
- compare the ticket's named file/artifact list against the actual touched-file scope; if a named file was not actually required or an unlisted file became required, correct the active ticket before marking it complete
- for mixed tickets, build a compact deliverable ledger from `What to Change`, `Files to Touch`, and any explicitly named artifacts/tests. Classify each item as `done`, `verified-no-edit`, `blocked`, `rewritten in active ticket`, or `deferred by confirmed boundary change` before using `COMPLETED`
- when a ticket-named file or artifact already satisfies the deliverable without a code diff, record it explicitly as `verified-no-edit` in the ticket outcome rather than implying it was missed
- confirm the final state reflects any nonblocking draft-ticket corrections you planned to carry
- for shared contract migrations, confirm the final diff covers the intended helper/fixture normalization strategy and that any preserved serialized surface still matches the ticket outcome text
- if a command-level verification already passed but the acceptance sweep finds a remaining ticket invariant miss, fix that miss and rerun the affected proof lane before closeout
- for completed active tickets, use the explicit status spelling `**Status**: COMPLETED` unless the repo artifact already documents a different final status class such as `BLOCKED`, `DEFERRED`, or `REJECTED`

Acceptance-proof runs are invalidated by later edits. If any code, tests, fixtures, schemas, goldens, generated artifacts, or active-ticket text changes after the last green acceptance-proof lane, rerun the full acceptance-proof set before marking the ticket complete. Do not rely on an earlier green run once the final diff has changed.

When the deliverable ledger shows any ticket-named item still classified as `blocked` or unresolved, do not mark the ticket `COMPLETED` unless the active ticket has first been rewritten to reflect the confirmed narrower boundary.

For tracked tickets, prefer making the closeout durable inside the ticket itself. A minimal tracked-ticket outcome block should capture:
- completion date or resulting status
- what landed in the owned boundary
- any boundary correction or semantic correction confirmed during reassessment
- verification commands that actually ran
- whether schema/artifact fallout was checked and whether it changed

When the active tracked ticket was truthfully narrowed or rewritten and the owned slice lands while a newly created or newly recognized prerequisite remains open, classify the ticket's durable state explicitly before you stop:
- `COMPLETED`: the rewritten active ticket's owned boundary is fully satisfied and no remaining blocker sits outside the ticket.
- `BLOCKED by prerequisite`: the active ticket's owned work is done or partially done, but truthful closure still depends on another active ticket or unresolved external blocker. Record the landed slice and the blocker in the ticket outcome rather than leaving the state implicit.
- `PENDING untouched`: reassessment showed the ticket should stay forward-looking because implementation did not yet land any owned deliverable.
Prefer an explicit durable outcome block for the first two states so the ticket artifact reflects both the landed work and the remaining blocker.

For active-ticket rewrites that change the ticket graph itself, an optional final state-transition ledger can help keep the repo artifact honest:
- `active ticket after rewrite`
- `new/updated deps`
- `owned slice landed`
- `remaining blocker`
- `recommended durable status`

For active untracked draft tickets, prefer the same durable closeout pattern before finishing the turn: update the draft ticket status and outcome so later sessions inherit the corrected contract, touched-file scope, and repo-valid verification commands rather than the stale draft wording.

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
