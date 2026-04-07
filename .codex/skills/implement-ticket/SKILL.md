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

**Session continuity**: If a prior ticket in the same series was implemented earlier in this session, reuse already-verified context. Prefer reusing or extracting helpers introduced by that earlier ticket over duplicating logic. If that freshly completed sibling already satisfied part of the current ticket's original deliverable, anchor reassessment to the remaining owned gap rather than treating the broader stale wording as a new discrepancy by default.

### Phase 2: Reassess Assumptions

5. Verify every referenced artifact against the live codebase with targeted reads and `rg`:
   - File existence and path accuracy
   - Named exports, functions, types, and signatures
   - Module structure and required dependencies/scripts
   - If a stale path uniquely identifies its intended artifact, treat as non-blocking and note the corrected path.
   - Path-only drift is not a scope discrepancy by itself. Example: a ticket names `src/kernel/foo.ts` but the live artifact clearly moved to `src/contracts/foo.ts` with the same owned purpose.
   - If a stale test path exists, prefer the live test surface that owns the behavior.
6. Build a discrepancy list for anything the ticket states that does not match reality.
7. Check architectural constraints the ticket may have underspecified:
   - Shared type or schema ripple effects
   - Cross-package fallout for shared exported unions, serialized trace kinds, and exhaustiveness-based consumers (translators, adapters, viewers, switch statements)
   - Foundation 14 atomic migrations for removals or renames
   - Required test, schema, or fixture updates
   - When the ticket disputes game-specific legality, consult local rulebook extracts or rules reports before deciding whether the fix is policy-only or a legality correction.
8. When a ticket claims a live bug, measured runtime symptom, or concrete production evidence (counts, seeds, traces, campaign observations), classify what you verified before coding:
   - **Incidence verified**: you reproduced the claimed current-case symptom in the live codebase
   - **Mechanism verified**: you proved the current code still permits the claimed failure mode or invariant violation
   - **Both verified**
   - **Neither verified**
   Record this explicitly in working notes and use it to decide whether implementation can proceed.
9. **Mid-migration awareness**: If the codebase is already mid-migration, distinguish the ticket's intended end state from work already landed. Treat extra files needed for Foundation 14 atomicity as required scope. Call out partial-migration state before coding. When a referenced spec is already dirty but the current ticket does not own spec edits, treat it as read-only context.
10. **Ticket rewrites**: If you materially correct the ticket scope before implementation, re-extract files, acceptance criteria, invariants, and verification commands from the corrected ticket. Treat the rewritten ticket as authoritative. If later verification disproves the rewrite premise, restore the original boundary and note why. When the rewrite disproves an active spec's stated root cause, fix point, or owned boundary, update that spec in the same turn unless another active ticket explicitly owns that correction.
11. **Sibling ticket coherence**: If correcting one ticket changes ownership within an active series, inspect remaining siblings, update or defer overlapping tickets, keep deps and status coherent, and run the ticket dependency checker. If a user-confirmed 1-3-1 resolution changes inter-ticket contracts, update the downstream sibling in the same turn. Explicitly note which earlier sibling outcomes remain authoritative, which were superseded by the correction, and which shared contracts or helpers are being reused unchanged.

### Phase 3: Resolve Before Coding

12. If the ticket is factually wrong, stop and present discrepancies before editing code.
13. If a ticket's bug claim or measured symptom is not currently reproducible, or only the mechanism is verified while the claimed incidence remains unproven, stop and resolve that boundary before coding. Apply the **1-3-1 rule** to choose between proof-only, proof-plus-fix, or ticket-scope correction. Do not proceed until the user confirms.
14. For scope gaps, implementation choices, dependency conflicts, or ambiguous boundaries, apply the **1-3-1 rule** (1 problem, 3 options, 1 recommendation). Do not proceed until the user confirms.
15. Continue reassessment after each confirmation until no boundary-affecting discrepancies remain — multiple sequential 1-3-1 rounds are normal.

**Confirmation semantics**:
- If the user explicitly authorizes reassessment and instructs you to proceed with the best `FOUNDATIONS.md`-compliant option after you have already presented the discrepancy and choices, treat that as confirmation for the recommended option. Restate the authoritative boundary, then continue without forcing an extra confirmation round.
- If the user's response is only informational or does not clearly authorize one of the proposed directions, remain stopped and ask for confirmation.

**Stale ticket boundary triage**:
- If the ticket wording is stale but the owned problem boundary is still valid, keep the boundary, correct the stale claims explicitly, and resolve the implementation direction via 1-3-1 before coding.
- If the reported incidence is stale but the underlying invariant or failure mechanism is still relevant, treat this as a proof-boundary decision, not an automatic ticket invalidation.
- If reassessment shows the ticket's owned boundary is itself wrong, stop and resolve whether to rewrite, narrow, or supersede the ticket before coding.

**Post-confirmation architecture reset**:
- When a user-confirmed 1-3-1 decision broadens or reframes the solution beyond the original ticket wording, restate the new authoritative boundary in working notes before coding.
- Re-extract owned deliverables, affected files, and proof obligations from that confirmed boundary rather than continuing from the original stale phrasing.

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
| Ticket narrows semantics for one member of an existing shared surface family | Prefer the already-landed shared family contract unless the ticket owns a family-wide redesign |

16. If the ticket is accurate and no blocking decision remains, proceed.

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
- When the current ticket itself makes a shared field required, treat repo-owned constructors, helpers, fixtures, runtime schemas, and generated artifacts needed to keep the repo coherent as in-scope immediately, even if sibling tickets or stale wording tried to defer them.
- Do not preserve a ticket's original slice when doing so would leave the repository in a knowingly broken mid-migration state. `FOUNDATIONS.md` §14 and §15 override that slicing.
- When a user-confirmed reassessment establishes a broader authoritative behavior boundary, minimal repo-owned fallout may absorb work a later sibling originally claimed, if that deferred work is necessary to make the confirmed boundary actually true in live runtime behavior. Call out the absorbed sibling boundary explicitly in working notes and final verification.
- If a new UI/store/model field mainly supports one feature path, consider keeping it optional on local test-helper contracts to avoid unnecessary fixture churn while production code supplies it explicitly.
- Prefer updating shared helpers first, then use focused typecheck output to mop up remaining direct inline fixtures owned by the changed contract.
- For additive compiled-field migrations, requiring the new field in compiler-owned artifacts while temporarily leaving handwritten TypeScript fixtures optional is valid when explicit, Foundation-compliant, and verified.
- Prefer a runtime-only storage layer behind the existing outward contract when an optimization would otherwise change canonical outward state or serialized shape.
- If Foundations require artifact-facing identifiers to remain canonical strings, introduce a separate runtime-only branded type rather than redefining the artifact-facing domain ID.
- When a ticket introduces callback-driven recursive evaluation on a derived state, verify that the inner pass resolves actor/seat identity and sources RNG from the derived state itself.
- When a ticket evaluates existing authored expressions against a derived state, audit the full expression subtree for hidden reads of the original state and migrate caches/helpers to be state-scoped, not just the top-level resolver.
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
- For bug tickets backed by concrete production evidence, distinguish clearly between **incidence proof** (the cited repro still happens now) and **mechanism proof** (the code still permits the failure). If incidence remains unverified, do not silently treat mechanism proof as equivalent; resolve via 1-3-1 first.
- For lifecycle/state-source migrations where a field becomes the single source of truth, audit both read paths and all write paths that can advance, consume, skip, expire, or probe that field. Check grant construction, issue-time probes, post-consumption advancement, post-skip/expire behavior, and any derived-state authorization or probe-time synthesized pending state.
- When you reproduce a live measured symptom before fixing it, record the exact pre-fix evidence in a durable owned surface before the implementation overwrites that state. Prefer the rewritten ticket, active spec, or implementation notes for counts, seeds, traces, and other decisive measurements.
- When a proof needs live authored behavior plus a small test-only policy or authoring hook, it is valid to compile the production spec with a narrow in-memory overlay rather than editing production data solely to make the invariant testable.
- If the ticket names files to inspect rather than modify, read and assess them; leave unchanged when evidence shows no edit is needed; state the no-change decision explicitly.
- If a ticket names an authored data file as an optional surface tweak, verify whether compiled defaults already satisfy the contract before editing.

## Verification

### Core Steps

1. Run the most relevant tests for the touched area.
2. Run required typecheck, lint, or artifact-generation commands. If a full repo-wide command is too expensive, explain what was run and what remains unverified.
3. Report unrelated pre-existing failures separately from failures caused by your changes.
4. **Build ordering**: If tests depend on `dist`, run typecheck and rebuild first. If a focused `dist` check fails with module-resolution symptoms before the build completes, treat as an ordering problem and rerun after the serialized build finishes. Do not run verification commands in parallel when they read from or write the same generated output tree.
5. Prefer the narrowest commands that validate the real changed code path. For documentation-only tickets whose examples depend on already-verified prerequisite behavior, artifact inspection plus dependency-integrity checks may suffice.
6. **Ticket-named commands are authoritative**: If the ticket explicitly names verification commands in acceptance criteria or test plan, run them before declaring completion unless reassessment proves they are stale, invalid, or superseded. Narrower checks may be used first for fast feedback, but they do not replace ticket-explicit commands.
7. **Command substitution**: If a ticket's example command conflicts with live repo tooling conventions (for example, Jest-style flags in a Node test-runner package), use the current repo-approved equivalent that proves the same behavior. State the substitution explicitly in working notes and final verification.
8. **Verification escalation ladder**: Default order is:
   1. focused test or reproducer for the touched behavior
   2. touched package typecheck/build/lint or equivalent
   3. required artifact regeneration for schema/contract changes
   4. ticket-explicit broader package or root commands
   Escalate sooner if shared exported contracts or cross-package consumers are in play.
9. When a ticket changes a fallback compilation or runtime path, verify that fallback path directly AND check the primary production path for non-regression.
10. **Broader failures**: Determine whether they are inside the corrected ticket boundary or owned by another active ticket. Do not silently absorb out-of-boundary scope. If the failure is repo-owned fallout from a changed shared exported contract or union, treat the minimal downstream fix as required scope for coherent completion. Document as residual risk if covered by another ticket; stop and resolve with the user if not.
11. **Test helper staleness**: If focused checks pass but a broader suite fails, inspect shared test helpers, fixtures, and goldens for stale assumptions. Check whether seed-specific helper states or turn-position fixtures have gone stale. Retarget to a current seed/turn that exercises the same invariant. When a compiled fast path is added, test malformed and unsupported shapes for clean fallback. When a new fast path depends on enriched context objects, check callers that construct minimal contexts.
12. **Non-functional regression clauses**: If a ticket includes a vague "no performance regression" clause without naming a benchmark surface, baseline, threshold, or command, resolve with 1-3-1 or satisfy through the nearest existing regression suite.
13. **Isolating test failures**: If `node --test` reports only a top-level file failure, rerun the failing file narrowly. Use test-name filtering or direct helper reproduction. Run the built test module directly to expose nested subtest output. For compiler or schema authoring tests, it is also valid to reproduce the minimal compile input directly against the built module to inspect diagnostics and lowered output when the test runner still hides the failing subtest.
14. **Schema/runtime shape changes**: If you changed runtime Zod/object schemas or shared serialized contract shapes, assume schema artifact regeneration is part of verification before interpreting schema-test failures. Regenerate first, then rerun the focused schema lane.
15. **Raw-vs-classified debugging**: When debugging legality, completion, or policy-preparation regressions, compare the raw `legalMoves(...)` output, the classified `enumerateLegalMoves(...)` result, and any downstream agent preparation surface separately. Do not assume a mismatch at one layer identifies the owning bug.

### Generated Artifact Checks

When acceptance depends on traces, goldens, schemas, or reports:
- Confirm the producing command has exited before diagnosing contents.
- Confirm the artifact path matches the command's real write target.
- Check freshness (timestamp or file size) before treating missing fields as real discrepancies.
- If a build or package script cleans `dist` before rebuilding it, do not run any `dist`-reading verification command until that build exits successfully. Treat transient module-resolution errors during a concurrent clean/rebuild as an ordering failure first.
- When a touched source file contributes to exported contracts or schema surfaces, expect generator-backed artifact checks even if the ticket didn't name a generated file.
- When a compiler ticket introduces a new lowered ref kind or expression variant, assume `GameDef.schema.json` may drift even if the immediate code edits are outside `schemas-core.ts`.
- When a runtime schema shape changes, expect `Trace.schema.json` or other serialized runtime artifacts to drift even if the ticket only named TypeScript or Zod surfaces.
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
   - State explicitly: any ticket premise that remained unverified in this turn, especially claimed repro seeds, counts, traces, or production observations.
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
