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

## Workflow

### Ticket-Type Triage

Load `references/ticket-type-triage.md` to classify the ticket into the smallest live category before loading further references, and to run the category-specific preflights (bounded local refactor, proof/benchmark/audit/investigation, event/card/action-identity repro, gate/smoke/regression historical witness, historical-evidence sufficiency, contradictory live evidence, shared-contract downstream consumers).

### Bounded Local Refactor Fast Path

When ticket triage confirms a **bounded local refactor**, use this lean path unless reassessment later proves the boundary wider:

1. Read `docs/FOUNDATIONS.md`, the ticket, referenced specs/docs/Deps, and `AGENTS.md`.
2. Inspect repo state early and validate ticket-named files/functions/commands against the live codebase.
3. Do a **command sanity pass** for ticket-named verification commands. You do not need the full `references/verification.md` load yet if the checks stay straightforward.
4. Load `references/implementation-general.md` only if the ticket widens beyond the simple local slice, exposes sibling/follow-up ownership drift, or otherwise needs the broader series guidance.
5. Load `references/draft-handling.md` for bounded local refactors only when draft status creates real boundary uncertainty:
   - the draft ticket/spec wording appears stale or contradictory
   - multiple sibling drafts may have overlapping ownership
   - the ticket needs durable draft-ticket correction beyond the normal working-notes checkpoint and closeout
   Otherwise, it is sufficient to record draft status in working notes and correct the active draft ticket during closeout.
6. Load the full `references/verification.md` only when verification planning becomes nontrivial because of shared outputs, multi-lane acceptance proof, migration fallout, or tooling ambiguity.
7. Still emit the full working-notes checkpoint before coding and still perform the final acceptance sweep before closeout.

### Phase 1: Read and Understand

1. Read `docs/FOUNDATIONS.md` before planning or coding.
2. Read the ticket file(s) matching the provided path or glob.
3. Read referenced specs, docs, and `Deps`. Read `AGENTS.md` and respect worktree discipline (all reads, edits, greps, moves, and verification commands use the worktree root when the ticket lives under `.claude/worktrees/<name>/`).
   - If equivalent `AGENTS.md` instructions are already in session context, rely on that context but still prefer the file when repo-local details might differ or the ticket references on-disk policy.
4. Inspect repo state (e.g., `git status --short`) early. Call out unrelated dirty files, pre-existing failures, or concurrent work so your diff stays isolated.
5. Extract all concrete references: file paths, functions, types, classes, modules, tests, scripts, and artifacts the ticket expects.
   - When a draft or recently edited ticket names specific files, prefer a quick path-validation pass (`rg --files`, targeted `find`, or equivalent) before opening the file directly if there is any sign of path drift.
6. Sanity-check ticket-named verification commands against live repo tooling before relying on them later.
   - For bounded local refactors with straightforward verification, a light command-sanity pass is enough at this stage.
   - Load `references/verification.md` now only when the command sanity check itself is nontrivial or already reveals output contention, stale-runner drift, or tracked-vs-draft correction work that needs the fuller guidance.

#### Session, Series, and Draft Context

Load `references/implementation-general.md` for session continuity, series-slice discipline, named fallout classification, the active draft series sanity check, and ticket re-entry classification after a prior follow-up split when the ticket is not a bounded local refactor. For bounded local refactors, defer this load unless reassessment reveals split ownership, sibling drift, reopened follow-up context, or another concrete need for the broader series guidance.

Load `references/draft-handling.md` when the active ticket or referenced artifacts are untracked drafts, or when a tracked ticket appears stale, and draft status creates real reassessment or ownership ambiguity. For bounded local refactors, untracked-draft status alone does not force this load if the active draft can be kept honest through working notes, direct reassessment, and durable closeout updates.

### Phase 2: Reassess Assumptions

7. Verify every referenced artifact against the live codebase with targeted reads and `rg`. Load `references/triage-and-resolution.md` (Artifact Verification Checklist section) for what to validate — file existence, exports/signatures, callsite ownership, claimed dead fallbacks, widened compilation families, and auto-synthesized outputs.
8. Build a discrepancy list and classify each item per `references/triage-and-resolution.md` (Stale-vs-Blocking Triage). When legality/admissibility and sampled completion surfaces disagree, follow the Legality/Admissibility Contradiction Playbook in that reference before widening retries, adding fallbacks, or rewriting the boundary.
9. Check constraints the ticket may have underspecified. Load `references/schema-and-migration.md` (Reassessment Surfaces section) for the full shared-contract / cross-package / fixture / test-harness / rulebook / repro-reduction checklist.

Load `references/triage-and-resolution.md` when discrepancy classification is nontrivial, when the ticket is not a bounded local refactor, or when reassessment reveals boundary-affecting drift that would benefit from the fuller taxonomy. A bounded local refactor may skip this load if the discrepancy handling remains straightforward and is still recorded explicitly in working notes.

If the change involves a mid-migration state or ticket rewrite, load `references/schema-and-migration.md` (Migration & Rewrite Awareness section).

10. If correcting one ticket changes ownership within an active series, load `references/implementation-general.md` (Series Consistency section) and follow the sibling coherence rules.
11. If stronger live evidence contradicts an archived sibling ticket's benchmark or investigation verdict, load `references/triage-and-resolution.md` (Archived Sibling Contradiction section) and classify the contradiction explicitly before coding.

### Phase 3: Resolve Before Coding

Load `references/triage-and-resolution.md` (Stop Conditions and Boundary Resets section) for the full resolve-before-coding discipline: stop conditions (factually wrong ticket, unverifiable bug claim, scope gaps, semantic acceptance drift), 1-3-1 workflow, authoritative-boundary restatement, rewritten-clause sanity check, proof-shape classification, partial-completion/new-blocker handling, and acceptance-lane blocker classification.

## Implementation Rules

Load `references/implementation-general.md` by default for non-bounded tickets, and for bounded local refactors only when the ticket widens beyond a simple local change, exposes split ownership/follow-up handling, or otherwise needs the broader implementation guidance. Covers general principles, TDD for implementation-discovered defects, narrowest-witness preference, bounded campaign reductions, diagnostic instrumentation, follow-up ticket creation, and exploratory-diff classification after ticket splits.

If the ticket is a mechanical refactor, gate/audit, investigation, groundwork, or production-proof/regression ticket, load `references/specialized-ticket-types.md`.

If the change touches schemas, contracts, goldens, or involves a migration, load `references/schema-and-migration.md`. Covers in-memory vs serialized decisions, post-migration sweeps, identifier consumer sweeps, interim shared-contract state for staged tickets, and historical benchmark worktree handling.

## Verification

Load `references/verification.md` for non-bounded tickets, or for bounded local refactors once verification planning becomes nontrivial because of shared outputs, multi-lane acceptance proof, migration fallout, or environment/tooling ambiguity. This is the **full verification load**; do not treat the earlier command-sanity pass as requiring this whole reference by default. `references/verification.md` covers command sanity check, verification preflight, execution order, build ordering and output contention, verification safety, escalation ladder, failure isolation, schema & artifact regeneration, standard commands, and measured-gate outcome.

For evidence states, trace-heavy ticket inspection, and generated artifact triage, load `references/verification-evidence.md`.

## Follow-Up

Load `references/closeout-and-followup.md` for non-bounded tickets, or for bounded local refactors when closeout needs follow-up classification, ticket blocking, sibling rewrites, or other nontrivial handoff work. Covers the closeout summary, final acceptance sweep, acceptance-proof invalidation rules, tracked-ticket durable outcome block, durable state classification (`COMPLETED` / `BLOCKED by prerequisite` / `PENDING untouched`), optional state-transition ledger, and draft-ticket durable closeout.

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
