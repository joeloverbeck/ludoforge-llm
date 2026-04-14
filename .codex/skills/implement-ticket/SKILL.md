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
  - `semantic corrections`: any stale draft expectation, example, or output-shape claim proven wrong by live evidence
  - `deferred sibling/spec scope`: broader spec or series work explicitly confirmed out of scope, when relevant
- Before coding, emit one compact working-notes checkpoint in `commentary` (or the equivalent running notes surface) using the checklist order above. If multiple discrepancies exist, group them under the same checkpoint rather than scattering the minimum fields across multiple updates.
- Do not create scratch files solely to satisfy this requirement.

## Workflow

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

#### Draft Handling

When the active ticket or referenced artifacts are untracked drafts:

1. Confirm draft/untracked state explicitly, including siblings and referenced specs.
2. Treat the active draft ticket as the session contract once reassessment is complete.
3. Classify stale draft wording separately from true boundary errors in working notes and final closeout.
4. Prefer correcting the active draft ticket over broad sibling/spec cleanup unless the live boundary truly requires wider edits.
5. When live evidence proves a draft example snippet, helper sketch, or command block is semantically wrong but the owned boundary is still correct, update the active draft ticket so future turns do not inherit the stale example.
   - Timing: apply these nonblocking draft-ticket corrections either immediately after reassessment or during final closeout, but do not mark the ticket complete while the stale draft text remains.
   - Preference: if the stale draft text could mislead the implementation itself (for example wrong type mutability, wrong owned file, wrong command shape, or wrong acceptance semantics), correct the active draft ticket before code edits. If it only affects future readability or closeout accuracy, correcting it during final closeout is acceptable.
6. Prefer minimal sibling edits until live verification or authoritative evidence proves ownership drift. If live verification forces absorbed fallout, update the active ticket outcome first, then narrow or rewrite only the directly affected siblings.
7. If a draft ticket's acceptance text or test description asserts the wrong value shape, output contract, or semantic expectation, distinguish that from a wrong implementation boundary. Wrong semantic expectations may still require a stop-and-confirm if satisfying the literal text would violate the live contract or `AGENTS.md` ticket fidelity.

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
8. Check constraints the ticket may have underspecified:
   - Shared type or schema ripple effects
   - Shared contract migration fanout: estimate the likely blast radius early with targeted `rg` counts before coding so fixture fallout, helper updates, and broad touch points are visible up front
   - Cross-package fallout for shared exported unions, serialized trace kinds, and exhaustiveness-based consumers
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

Load `references/triage-and-resolution.md`.

If the change involves a mid-migration state or ticket rewrite, load `references/schema-and-migration.md` (Migration & Rewrite Awareness section).

9. If correcting one ticket changes ownership within an active series, load `references/implementation-general.md` (Series Consistency section) and follow the sibling coherence rules.

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

## Implementation Rules

Load `references/implementation-general.md`.

- If implementation exposes a new bug or semantic defect inside the owned ticket slice, follow repo TDD rules when practical: add the narrowest failing proof first, then fix it, and record the proof lane in working notes.
- If a focused failing proof is not practical for an implementation-discovered defect, state why and keep the verification lane as narrow and behavior-specific as possible.
- If an initially plausible integration reproducer fails for reasons outside the owned boundary, pivot to the narrowest live authority surface that still proves the ticket's invariant. Record the substitution and whether the resulting evidence is direct or indirect.
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

## Verification

Load `references/verification.md`.

Before running broader checks, identify whether any ticket-relevant commands clean or rewrite shared outputs such as `packages/*/dist`, generated schemas, compiled JSON, or goldens. If they do, run those lanes serially even when the surrounding Codex guidance favors parallel tool use.

For bugfix tickets, the red step can come from an existing failing proof lane. If the ticket already names a failing test or reproducer that cleanly proves the bug, rerun that lane first and treat it as the red proof unless the bug needs a narrower or more direct witness.

If a verification lane fails immediately after overlapping output-contending commands, treat the first result as inconclusive until you rerun it serially. Recovery order:
1. Classify the failure as a possible ordering artifact rather than as code-caused.
2. Rebuild the touched package or regenerate the touched artifact tree to restore a clean authoritative output.
3. Rerun the failed proof lane serially before drawing conclusions or widening scope.

### Verification Safety

- Keep bugfix/regression verification on a red-green path: when you add or expose a focused failing proof for the ticket, keep rerunning that focused lane until it passes before escalating to broader package or repo commands.
- Treat verification commands that delete or regenerate shared outputs as sequential-only unless the repo explicitly documents them as parallel-safe.
- In repositories where tests execute compiled files from `dist`, do not run build commands that rewrite `dist` in parallel with those tests. A build that starts with `rm -rf dist` can create false negative failures unrelated to the implementation.
- Treat transitive task-graph builds as output contenders too: `turbo` lanes such as `turbo typecheck` or `turbo test` may invoke package `build` tasks that rewrite `dist`, so do not overlap them with compiled-file test runs unless you have confirmed the graph is output-safe.
- If a broad verification failure appears immediately after overlapping build/test commands, rerun the affected checks sequentially before classifying the failure as code-caused.
- When the ticket changes phase transitions, running hashes, turn/phase boundary accounting, or similarly sensitive shared invariants, grep for the nearest invariant-focused test file and run that focused lane before escalating to the full package or repo suite.
- When a ticket's focused proof surface mixes a cheap new unit/integration lane with a heavier replay, campaign, or determinism lane, run the cheap independent lane first so local regressions surface before you pay the higher-cost proof run.
- When a ticket names a broad scan, campaign, replay window, or other potentially expensive proof command, estimate feasibility early with one or two representative worst-case witnesses before committing to the literal full run. If those witnesses show the named proof surface is no longer proportionate to the live boundary, stop via 1-3-1 instead of discovering that drift deep into implementation.
- For deterministic but seed-sensitive preparation flows, prefer bounded witness discovery over hardcoding an unverified seed. Keep the search bounded, deterministic, and aligned with the invariant being proven.
- When a ticket names a simulator path, agent profile, campaign harness, replay harness, or other configuration-sensitive reproducer, preserve that authoritative setup in quick repro probes before classifying the witness as stale, fixed, or shifted. Do not treat a cheaper default-path probe as authoritative if profile wiring, RNG routing, or harness behavior can materially change the witness.
- If an initial bounded witness proves only part of the target invariant, keep searching for a stronger bounded witness before classifying the ticket as stale, contradictory, or blocked. Escalate only after bounded search aligned to the full invariant fails or reveals a true contract conflict.
- Treat generated production fixtures and compiled JSON assets as first-class owned fallout when the ticket changes the live compiled surface. Check whether authoritative verification writes or validates them, prefer isolated regeneration when unrelated fixture drift exists elsewhere in the repo, and record any intentional scoped substitution.
- After any shared generator command, inspect every changed generated artifact and classify it as `owned` or `unrelated churn` before closeout. Keep owned fallout, rerun the affected checks, and revert unrelated churn so the final diff stays isolated to the ticket boundary.
- When a focused built-test rerun still hides the concrete assertion mismatch, inspect the compiled runtime object or generated artifact directly with the narrowest possible probe before patching tests or code.
- For campaign, tournament, or trace-inspection tickets, prefer the smallest bounded seed/run window that reaches the claimed scenario or reproducer before escalating to larger harness runs. If the first bounded run misses the target behavior, widen only enough to reach the intended trace slice.
- When a ticket names a high-level reproducer but the setup proves too coupled or noisy, prefer the narrowest valid proof surface that still exercises the owned invariant: first the authority/helper that owns the behavior, then a production-data integration slice, then the broader end-to-end flow only if needed.
- For shared contract or object-shape migrations, verify both sides of the boundary deliberately: the live runtime shape you intended to change, and any serialized/golden/fixture surface you intended to preserve. Do not assume one implies the other.

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
3. Classify each regenerated artifact as `owned`, `already-owned sibling fallout`, or `unrelated churn`.
4. Keep only the owned artifacts required to make the ticket true in live runtime.
5. Revert unrelated churn before final closeout.
6. Rerun the narrowest affected proof lane after artifact triage so the kept generated files are validated.

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

Load `references/closeout-and-followup.md`.

Before declaring completion or updating the ticket status, run one final acceptance sweep against the ticket text and your final diff:
- re-check non-command acceptance constraints such as file-size caps, named line-count limits, exact file/artifact deliverables, and explicit "do not modify X" boundaries
- use cheap structural probes when helpful (`wc -l`, targeted file existence checks, touched-file scope checks including untracked files)
- compare the ticket's named file/artifact list against the actual touched-file scope; if a named file was not actually required or an unlisted file became required, correct the active ticket before marking it complete
- confirm the final state reflects any nonblocking draft-ticket corrections you planned to carry
- for shared contract migrations, confirm the final diff covers the intended helper/fixture normalization strategy and that any preserved serialized surface still matches the ticket outcome text
- if a command-level verification already passed but the acceptance sweep finds a remaining ticket invariant miss, fix that miss and rerun the affected proof lane before closeout

For tracked tickets, prefer making the closeout durable inside the ticket itself. A minimal tracked-ticket outcome block should capture:
- completion date or resulting status
- what landed in the owned boundary
- any boundary correction or semantic correction confirmed during reassessment
- verification commands that actually ran
- whether schema/artifact fallout was checked and whether it changed

## Codex Adaptation Notes

- Replaces Claude-specific invocation arguments with normal Codex conversation context.
- Do not rely on Claude-only skills or slash-command behavior.
- Execute implementation directly once the ticket is verified and no blocking discrepancy remains.
- When inspecting markdown from the shell, avoid unescaped backticks in search patterns; prefer plain-string anchors or direct file reads.
- When checking touched-file scope, remember that untracked new files may not appear in `git diff --name-only`; include them explicitly.

## Example Prompts

- `Implement tickets/LEGACTTOO-009.md`
- `Implement the ticket at .claude/worktrees/feature-a/tickets/FOO-003.md`
- `Implement tickets/FITLSEC7RULGAP-001*. Read dependent specs first and stop if the ticket is stale.`
