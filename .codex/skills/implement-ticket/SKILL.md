---
name: implement-ticket
description: Read, reassess, and implement a repository ticket when the user asks to implement a ticket or provides a ticket path. Use for ticket-driven work that must validate the ticket against the current codebase, surface discrepancies before coding, then implement and verify the full deliverable set.
---

# Implement Ticket

Use this skill when the user asks to implement a ticket, gives a ticket file path, or clearly wants ticket-driven execution.

## Required Inputs

- A ticket path, glob, or enough context to locate the ticket
- Any extra constraints from the user

## Workflow

### Phase 1: Read and Understand

1. Read `docs/FOUNDATIONS.md` before planning or coding.
2. Read the ticket file(s) matching the provided path or glob.
3. Read referenced specs and docs from the ticket, especially anything in `Deps`, explicit file references, and user-provided context.
4. Read repository instructions from `AGENTS.md` and respect worktree discipline when the ticket lives under `.claude/worktrees/<name>/`.
5. Extract all concrete references from the ticket:
   - file paths
   - function, type, class, and module names
   - tests, scripts, and artifacts the ticket expects

If a prior ticket in the same series was implemented earlier in the session, reuse already-verified context and only reassess newly introduced references.

### Phase 2: Reassess Assumptions

6. Verify every referenced artifact against the live codebase with targeted reads and `rg`:
   - Does each file exist at the stated path?
   - Do named exports, functions, types, and signatures exist as described?
   - Does the module structure match the ticket?
   - Are required dependencies and scripts present?
   - If a referenced file path is stale but the intended owned artifact is uniquely discoverable and the ticket boundary stays the same, treat the path as non-blocking and note the corrected live path in your working notes.
7. Build a discrepancy list for anything the ticket states that does not match reality.
8. Check for architectural constraints the ticket may have underspecified:
   - shared type or schema ripple effects
   - Foundation 14 atomic migrations for removals or renames
   - required test, schema, or fixture updates
9. If the codebase is already mid-migration:
   - distinguish between the ticket's intended end state and migration work that has already landed
   - decide whether the remaining deliverable boundary is still clear and implementable without a new product decision
   - treat extra adjacent files needed for Foundation 14 atomicity as required scope, not optional cleanup
   - call out the partial-migration state explicitly before coding
10. If you rewrite or materially correct the ticket scope before implementation:
   - re-extract the concrete files, acceptance criteria, invariants, and verification commands from the corrected ticket
   - do not keep using the stale ticket's original verification surface by inertia
   - treat the rewritten ticket as the authoritative implementation boundary for the rest of the task
11. If correcting one active ticket materially changes ownership within an active ticket series:
   - inspect the remaining active sibling tickets in that series before coding
   - update or defer overlapping sibling tickets so they do not still claim invalid staged ownership
   - keep dependency references and status values coherent across the series
   - run the repo's ticket dependency checker after the series rewrite when available

### Phase 3: Resolve Before Coding

12. If the ticket is factually wrong, stop and present the discrepancies before editing code.
13. If the issue is not a factual error but a scope gap, implementation choice, dependency conflict, or ambiguous partial-migration boundary, apply the repository's `1-3-1` rule:
    - 1 clearly defined problem
    - 3 concrete options
    - 1 recommendation
14. Do not proceed with implementation until the user confirms when a discrepancy or `1-3-1` decision is outstanding.
15. If the ticket is accurate and no blocking decision remains, proceed.

## Implementation Rules

- Implement every explicit ticket deliverable. Do not silently skip items.
- Prefer minimal, architecture-consistent changes over local patches.
- Follow TDD for bug fixes: write the failing test first, then fix the code.
- Never adapt tests to preserve a bug.
- Respect worktree discipline:
  - If working in a worktree, all reads, edits, greps, moves, and verification commands must use the worktree root.
  - If unrelated edits already exist, isolate your diff and do not overwrite them.
- Treat `docs/FOUNDATIONS.md` as higher priority than ticket wording. If the ticket conflicts with Foundations, surface the conflict and propose the Foundation-compliant resolution before continuing.
- When implementing a migration, separate:
  - the new authoritative authored/runtime path you are moving toward
  - any temporary compatibility or transitional surface you intentionally retain so nearby code and tests stay coherent
  Record that distinction in your working notes and final summary.
- The ticket's `Files to Touch` list is a strong hint, not a hard limit. If coherent completion requires adjacent files for contracts, runtime consumers, schemas, fixtures, or tests, include them and explain why.
- For schema or contract migrations, explicitly check whether the change needs updates across:
  - authored schema/doc types
  - compiled/kernel/runtime types
  - Zod or JSON schemas
  - diagnostics or debug snapshots
  - fixtures, goldens, and tests
- When a migration adds or removes a required compiled field, treat owned production goldens that snapshot compiled catalogs, summaries, or traces as expected update surfaces unless evidence shows unexpected behavioral drift.

## Verification

Before claiming completion:

1. Run the most relevant tests for the touched area.
2. Run any required typecheck, lint, or artifact-generation command needed to validate the deliverable.
3. If a full repo-wide command is too expensive, explain what was run and what remains unverified.
4. Report unrelated pre-existing failures separately from failures caused by your changes.
5. Confirm whether the package's test commands execute source files directly or built `dist` output:
   - if tests depend on `dist`, run `typecheck` first and rebuild before trusting targeted test results
   - if the change affects generated artifacts or schemas, regenerate or validate them explicitly
   - do not run verification commands in parallel when they read from or rewrite the same generated output tree such as `dist/`
6. Prefer the narrowest commands that validate the real changed code path, not stale build output.
7. If broader failing checks remain:
   - determine whether they are inside the corrected ticket boundary or are owned by another active ticket
   - if they are outside the corrected boundary and already covered by an active ticket, do not silently absorb that scope
   - document the failure as residual risk or deferred verification and name the owning active ticket(s)
   - if no active ticket owns the remaining failure, stop and resolve the boundary with the user
8. If focused checks pass but a broader suite fails:
   - inspect shared test helpers, fixtures, and goldens for assumptions that the focused tests did not exercise
   - do not assume the failure is a product regression until helper-level assumptions are ruled out
9. If `node --test` or another runner reports only a top-level file failure:
   - rerun the failing file as narrowly as possible
   - use test-name filtering or direct helper reproduction when needed to isolate the failing assertion before editing code

Use the repo's standard commands from `AGENTS.md` when appropriate:

- `pnpm turbo build`
- `pnpm turbo test`
- `pnpm turbo lint`
- `pnpm turbo typecheck`
- `pnpm turbo schema:artifacts`

Prefer narrower package- or file-scoped checks when they fully cover the change.

Optional verification ordering for `dist`-driven packages:
- `typecheck`
- `build`
- regenerate or check schema/artifacts
- targeted `dist` tests for the changed surface
- full package test suite
- broader repo checks
- keep commands that clean, rebuild, or regenerate the same output tree serialized rather than parallel

## Follow-Up

After implementation and verification:

1. Summarize what changed, what was verified, and any residual risk.
   - if any verification was intentionally deferred because an adjacent active ticket owns that scope, state that explicitly
2. If the ticket appears complete, offer to archive it per `docs/archival-workflow.md`.
3. If the user wants archival or a concrete follow-up review, hand off to `post-ticket-review`.

Optional series consistency pass after a ticket rewrite:
- inspect sibling active tickets in the same series for overlap or stale staged ownership
- update statuses, deps, and scope text so the active series remains internally coherent
- run `pnpm run check:ticket-deps` when the repo provides it

## Codex Adaptation Notes

- This skill replaces Claude-specific invocation arguments with normal Codex conversation context.
- Do not rely on Claude-only skills or slash-command behavior.
- Execute the implementation directly once the ticket is verified and no blocking discrepancy remains.

## Example Prompts

- `Implement tickets/LEGACTTOO-009.md`
- `Implement the ticket at .claude/worktrees/feature-a/tickets/FOO-003.md`
- `Implement tickets/FITLSEC7RULGAP-001*. Read dependent specs first and stop if the ticket is stale.`
