---
name: implement-ticket
description: Read, reassess, and implement a repository ticket when the user asks to implement a ticket or provides a ticket path. Use for ticket-driven work that must validate the ticket against the current codebase, surface discrepancies before coding, then implement and verify the full deliverable set.
---

# Implement Ticket

Use this skill when the user asks to implement a ticket, gives a ticket file path, or clearly wants ticket-driven execution. Covers both code-changing tickets and non-code deliverables (measured decisions, archival updates, series-status corrections).

## Required Inputs

- A ticket path, glob, or enough context to locate the ticket
- Any extra constraints from the user

## Workflow

### Phase 1: Read and Understand

1. Read `docs/FOUNDATIONS.md` before planning or coding.
2. Read the ticket file(s) matching the provided path or glob.
3. Read referenced specs, docs, and `Deps`. Read `AGENTS.md` and respect worktree discipline (all reads, edits, greps, moves, and verification commands use the worktree root when the ticket lives under `.claude/worktrees/<name>/`; isolate your diff from unrelated edits).
4. Extract all concrete references: file paths, functions, types, classes, modules, tests, scripts, and artifacts the ticket expects.

**Session continuity**: If a prior ticket in the same series was implemented earlier in this session, reuse already-verified context. Prefer reusing or extracting helpers introduced by that earlier ticket over duplicating logic.

### Phase 2: Reassess Assumptions

5. Verify every referenced artifact against the live codebase with targeted reads and `rg`:
   - File existence and path accuracy
   - Named exports, functions, types, and signatures
   - Module structure and required dependencies/scripts
   - If a stale path uniquely identifies its intended artifact, treat as non-blocking and note the corrected path.
   - If a stale test path exists, prefer the live test surface that owns the behavior.
6. Build a discrepancy list for anything the ticket states that does not match reality.
7. Check architectural constraints the ticket may have underspecified:
   - Shared type or schema ripple effects
   - Foundation 14 atomic migrations for removals or renames
   - Required test, schema, or fixture updates
   - When the ticket disputes game-specific legality, consult local rulebook extracts or rules reports before deciding whether the fix is policy-only or a legality correction.
8. **Mid-migration awareness**: If the codebase is already mid-migration, distinguish the ticket's intended end state from work already landed. Treat extra files needed for Foundation 14 atomicity as required scope. Call out partial-migration state before coding. When a referenced spec is already dirty but the current ticket does not own spec edits, treat it as read-only context.
9. **Ticket rewrites**: If you materially correct the ticket scope before implementation, re-extract files, acceptance criteria, invariants, and verification commands from the corrected ticket. Treat the rewritten ticket as authoritative. If later verification disproves the rewrite premise, restore the original boundary and note why.
10. **Sibling ticket coherence**: If correcting one ticket changes ownership within an active series, inspect remaining siblings, update or defer overlapping tickets, keep deps and status coherent, and run the ticket dependency checker. If a user-confirmed 1-3-1 resolution changes inter-ticket contracts, update the downstream sibling in the same turn.

### Phase 3: Resolve Before Coding

11. If the ticket is factually wrong, stop and present discrepancies before editing code.
12. For scope gaps, implementation choices, dependency conflicts, or ambiguous boundaries, apply the **1-3-1 rule** (1 problem, 3 options, 1 recommendation). Do not proceed until the user confirms.
13. Continue reassessment after each confirmation until no boundary-affecting discrepancies remain — multiple sequential 1-3-1 rounds are normal.

**1-3-1 edge cases** (all resolve via 1-3-1 before coding):

| Situation | Preferred resolution |
|-----------|---------------------|
| Ticket uses raw strings for a branded domain type | Prefer the existing branded type |
| Ticket proposes a field already covered by an existing contract field | Reuse the existing field |
| Narrow factual mismatch inside a valid boundary | Bounded discrepancy, not automatic rewrite |
| Bug claim no longer reproducible but invariant is worth proving | Convert to proof/regression-only after confirmation |
| Audit shows the suspected surface already satisfies the invariant | Complete as audit-plus-proof with tests only |
| Acceptance claim lacks a verified reproducer | Correct to strongest evidenced boundary |
| Conversion boundary between plain domain object and trusted/validated form | Resolve ownership explicitly |

14. If the ticket is accurate and no blocking decision remains, proceed.

## Implementation Rules

### General Principles

- Implement every explicit ticket deliverable. Do not silently skip items.
- Prefer minimal, architecture-consistent changes over local patches.
- Follow TDD for bug fixes: write the failing test first, then fix the code. Never adapt tests to preserve a bug.
- Treat `docs/FOUNDATIONS.md` as higher priority than ticket wording. Surface conflicts and propose Foundation-compliant resolutions before continuing.
- The ticket's `Files to Touch` list is a strong hint, not a hard limit. Include adjacent files for contracts, runtime consumers, schemas, fixtures, or tests when coherent completion requires them.
- If the ticket says "no code changes", interpret as "no production/runtime behavior changes." Ticket outcomes, archival moves, dependency rewrites, and sibling-ticket status updates are still required when they are the owned deliverable.
- If reassessment reveals a generic architectural limitation broader than the ticket's boundary, prefer creating or extending a follow-up spec over burying the gap in ticket-only notes.

### Schema & Contract Migrations

When a change touches schemas or contracts, check updates across:

- **Authored layer**: schema/doc types, source-shape/parser-facing doc types, validators, unknown-key allowlists
- **Compiled/runtime layer**: kernel/runtime types, Zod/JSON schemas, compiled DSL/AST shapes, generated schema artifacts
- **Consumer layer**: diagnostics/debug snapshots, exported provider interfaces and adapter wrappers, injected callback plumbing from orchestration down to provider/factory layers
- **Test layer**: fixtures, goldens, manually constructed runtime/test context objects (e.g., `GameDefRuntime`)

Additional migration guidelines:
- When a ticket adds a new authored config key, surface family, or section field, update the authored-shape doc types even if the ticket only names lowering or validator files.
- When an earlier ticket made a field required, add empty/default placeholders across constructors, defaults, fixtures, and goldens for atomicity.
- If a new UI/store/model field mainly supports one feature path, consider keeping it optional on local test-helper contracts to avoid unnecessary fixture churn while production code supplies it explicitly.
- For additive compiled-field migrations, requiring the new field in compiler-owned artifacts while temporarily leaving handwritten TypeScript fixtures optional is valid when explicit, Foundation-compliant, and verified.
- Prefer a runtime-only storage layer behind the existing outward contract when an optimization would otherwise change canonical outward state or serialized shape.
- If Foundations require artifact-facing identifiers to remain canonical strings, introduce a separate runtime-only branded type rather than redefining the artifact-facing domain ID.
- When a ticket introduces callback-driven recursive evaluation on a derived state, verify that the inner pass resolves actor/seat identity and sources RNG from the derived state itself.
- When tightening authored `chooseN` minimums: check whether runtime `max` can drop below the new `min`; if so, update legality/cost-validation in the same change.

### Golden & Fixture Drift

When a change alters compiled output, scoring, move selection, observability, or preview readiness:
- Treat owned production goldens (catalogs, summaries, traces, fixed-seed outputs) as expected update surfaces unless evidence shows unexpected drift outside the ticket boundary.
- When earlier groundwork introduced a required placeholder and the current ticket populates it, expect goldens to drift from stubs to populated values — this is normal ticket-owned fallout.
- When enriching diagnostics or trace output, prefer preserving the existing coarse summary field and adding an optional detail field unless the ticket explicitly owns a breaking schema redesign.
- Preparatory tickets may add optional schema, trace, or contract fields ahead of later logic tickets, so long as verification proves artifact surfaces remain in sync.
- When a nearby golden looks like expected drift, probe it explicitly — "no ticket-owned diff" is a valid conclusion.

### Gate, Audit & Profiling Tickets

For tickets whose primary deliverable is a measured decision:
1. Identify the explicit threshold, decision gate, or downstream trigger.
2. Verify which sibling tickets, specs, or reports depend on that gate.
3. A complete implementation may legitimately end in "do not change runtime code" when the result closes proposed follow-up as not actionable. Still complete every owned repository deliverable: update ticket outcome, archive/amend deciding spec/report, reconcile dependent ticket statuses.
4. When a completed gate proves downstream siblings are not actionable, update those siblings in the same turn so the series no longer advertises invalid work.
5. Distinguish runtime/code changes from repository-owned deliverables (ticket outcomes, archived specs, dependency rewrites, status updates).
6. If a diagnostic report has no named output file, prefer `reports/` over ephemeral scratch files.

### Series Consistency

When a ticket change affects other active tickets in the same series:
- Inspect siblings for overlap, stale staged ownership, or stale assumptions.
- Update statuses, deps, and scope text so the active series stays coherent.
- Run `pnpm run check:ticket-deps` when available.
- If sibling drift is informative but non-blocking, note it in working notes and final summary without absorbing that sibling's scope.
- If a referenced spec mentions a deliverable split into a later sibling, keep implementation anchored to the current ticket boundary.
- When a new follow-up spec changes framing around an adjacent active spec, prefer a small cross-reference update over rewriting the adjacent spec's problem statement.

### Production-Proof & Regression Tickets

- For proof/regression tickets, prefer extending the live test module that already owns the contract under audit before creating new files solely to match stale ticket test paths.
- If cited production examples, cards, or seeds are stale, prefer a current deterministic reproducer or synthetic proof fixture.
- For production-proof tickets validating live authored data, run a bounded seed/turn/trace scan to discover a current reproducer, then encode it into owned integration tests.
- If the ticket names files to inspect rather than modify, read and assess them; leave unchanged when evidence shows no edit is needed; state the no-change decision explicitly.
- If a ticket names an authored data file as an optional surface tweak, verify whether compiled defaults already satisfy the contract before editing.

## Verification

### Core Steps

1. Run the most relevant tests for the touched area.
2. Run required typecheck, lint, or artifact-generation commands. If a full repo-wide command is too expensive, explain what was run and what remains unverified.
3. Report unrelated pre-existing failures separately from failures caused by your changes.
4. **Build ordering**: If tests depend on `dist`, run typecheck and rebuild first. If a focused `dist` check fails with module-resolution symptoms before the build completes, treat as an ordering problem and rerun after the serialized build finishes. Do not run verification commands in parallel when they read from or write the same generated output tree.
5. Prefer the narrowest commands that validate the real changed code path. For documentation-only tickets whose examples depend on already-verified prerequisite behavior, artifact inspection plus dependency-integrity checks may suffice.
6. When a ticket changes a fallback compilation or runtime path, verify that fallback path directly AND check the primary production path for non-regression.
7. **Broader failures**: Determine whether they are inside the corrected ticket boundary or owned by another active ticket. Do not silently absorb out-of-boundary scope. Document as residual risk if covered by another ticket; stop and resolve with the user if not.
8. **Test helper staleness**: If focused checks pass but a broader suite fails, inspect shared test helpers, fixtures, and goldens for stale assumptions. Check whether seed-specific helper states or turn-position fixtures have gone stale. Retarget to a current seed/turn that exercises the same invariant. When a compiled fast path is added, test malformed and unsupported shapes for clean fallback. When a new fast path depends on enriched context objects, check callers that construct minimal contexts.
9. **Non-functional regression clauses**: If a ticket includes a vague "no performance regression" clause without naming a benchmark surface, baseline, threshold, or command, resolve with 1-3-1 or satisfy through the nearest existing regression suite.
10. **Isolating test failures**: If `node --test` reports only a top-level file failure, rerun the failing file narrowly. Use test-name filtering or direct helper reproduction. Run the built test module directly to expose nested subtest output.

### Generated Artifact Checks

When acceptance depends on traces, goldens, schemas, or reports:
- Confirm the producing command has exited before diagnosing contents.
- Confirm the artifact path matches the command's real write target.
- Check freshness (timestamp or file size) before treating missing fields as real discrepancies.
- When a touched source file contributes to exported contracts or schema surfaces, expect generator-backed artifact checks even if the ticket didn't name a generated file.
- When a shared generator rewrites multiple artifacts, identify which encode the changed contract and summarize those specifically.
- If regeneration was required but leaves no persisted diff, state explicitly that the surface was checked and remained in sync.

### Measured-Gate Outcome (for profiling/audit tickets)

Capture: measured surface, command(s), decisive result, threshold comparison, downstream action (archived/amended/deferred/not-actionable).

### Standard Commands

```
pnpm turbo build
pnpm turbo test
pnpm turbo lint
pnpm turbo typecheck
pnpm turbo schema:artifacts
```

Prefer narrower package- or file-scoped checks when they fully cover the change. Keep commands that clean, rebuild, or regenerate the same output tree serialized.

## Follow-Up

1. Summarize what changed, what was verified, and any residual risk.
   - State explicitly: audited schema/artifact ripple effects (even if none needed), deferred verification owned by another ticket, resolved 1-3-1 decisions (especially Foundation type discipline), rules-evidence notes for game-specific legality corrections.
2. If the ticket appears complete, offer to archive per `docs/archival-workflow.md`.
3. If the user wants archival or follow-up review, hand off to `post-ticket-review`. If this implementation superseded semantics in a recently archived sibling, call that out in the handoff.

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
