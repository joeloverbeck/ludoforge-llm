---
name: implement-ticket
description: "Ticket reassessment and implementation. Use when asked to implement a ticket (e.g., /implement-ticket tickets/LEGACTTOO-009*). Reads the ticket, reassesses assumptions against the codebase, corrects the ticket first if needed, then implements."
user-invocable: true
arguments:
  - name: ticket_path
    description: "Glob path to the ticket file(s) (e.g., tickets/LEGACTTOO-009*)"
    required: true
  - name: context
    description: "Additional instructions, spec references, or constraints for this implementation (e.g., 'Rely on specs/102-shared* for ref.')"
    required: false
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
3. Read referenced specs, docs, and `Deps`. Respect worktree discipline (all reads, edits, greps, moves, and verification commands use the worktree root when the ticket lives under `.claude/worktrees/<name>/`; isolate your diff from unrelated edits).
4. Before editing, inspect repo state (for example `git status --short`) and call out unrelated dirty files, pre-existing failures, or evidence of concurrent work. Do this early enough that your diff can be isolated from repo-preexisting state.
5. Extract all concrete references: file paths, functions, types, classes, modules, tests, scripts, and artifacts the ticket expects.

**Session continuity**: If a prior ticket in the same series was implemented earlier in this session, reuse already-verified context. Prefer reusing or extracting helpers from that earlier ticket over duplicating logic. If the completed sibling already satisfied part of the current ticket's deliverable, anchor reassessment to the remaining owned gap rather than treating broader stale wording as a new discrepancy.

**Series slice discipline**: When a referenced spec is broader than the current ticket, treat the ticket as the implementation boundary unless verified evidence shows that slice is stale, internally inconsistent, or impossible to satisfy without broader owned fallout. Confirm which broader spec work is deferred to siblings before coding.

### Phase 2: Reassess Assumptions

**Artifact verification**

If the ticket was produced by `/spec-to-tickets` in this same session (with or without a preceding `/reassess-spec` that validated artifacts), abbreviate artifact verification to: confirm target files still exist, check for new dirty state from concurrent work, and verify no codebase changes occurred since the spec-to-tickets run. Skip re-grepping for types and functions already confirmed.

5. Verify every referenced artifact against the live codebase with targeted reads and Grep:
   - File existence and path accuracy
   - Named exports, functions, types, and signatures
   - Module structure and required dependencies/scripts
   - Stale paths that uniquely identify their intended artifact are non-blocking — note the corrected path.
   - Path-only drift is not a scope discrepancy. Example: ticket names `src/kernel/foo.ts` but the artifact moved to `src/contracts/foo.ts` with the same purpose.
   - Stale test paths: prefer the live test surface that owns the behavior.
6. Build a discrepancy list for anything the ticket states that does not match reality.

**Architectural constraints**

7. Check constraints the ticket may have underspecified:
   - Shared type or schema ripple effects
   - Cross-package fallout for shared exported unions, serialized trace kinds, and exhaustiveness-based consumers (translators, adapters, viewers, switch statements)
   - Foundation 14 atomic migrations for removals or renames
   - Return type changes on shared exported functions: all callers must be migrated atomically (Foundation 14). If a sibling ticket owns caller migration but the current ticket changes the return type, flag the scope overlap before coding — the sibling's work must be absorbed.
   - **Primitive-to-object return type migrations**: When a function's return type changes from a primitive (`boolean`, `number`, `string`) to a result object, TypeScript will NOT catch same-file callers that use the return value in boolean/truthy contexts (if-conditions, filter callbacks, logical operators) — the result object is always truthy. After migration, grep the modified file for all remaining call sites of the changed function and verify each one handles the new return type correctly. Do not rely solely on the type checker.
   - Required test, schema, or fixture updates
   - When the ticket disputes game-specific legality, consult local rulebook extracts or rules reports before deciding whether the fix is policy-only or a legality correction.

**Evidence classification**

8. When a ticket claims a live bug, measured runtime symptom, or concrete production evidence (counts, seeds, traces, campaign observations), classify what you verified before coding:
   - **Incidence verified**: reproduced the claimed symptom in the live codebase
   - **Mechanism verified**: proved the code still permits the claimed failure mode
   - **Both verified**
   - **Neither verified**
   Record this explicitly in working notes. See also [Production-Proof & Regression Tickets](#production-proof--regression-tickets) for implementation guidance.

**Migration & rewrite awareness**

9. **Mid-migration**: If the codebase is already mid-migration, distinguish the ticket's intended end state from work already landed. Treat extra files needed for Foundation 14 atomicity as required scope. Call out partial-migration state before coding. When a referenced spec is already dirty but the current ticket does not own spec edits, treat it as read-only context.
10. **Ticket rewrites**: If you materially correct the ticket scope, re-extract files, acceptance criteria, invariants, and verification commands from the corrected ticket. Treat the rewritten ticket as authoritative. If later verification disproves the rewrite premise, restore the original boundary and note why. When the rewrite disproves an active spec's stated root cause, fix point, or owned boundary, update that spec in the same turn unless another active ticket explicitly owns that correction.
    - If a rewritten verification-owned ticket later exposes a concrete live failure while running its authoritative acceptance commands, treat that failure as in-scope immediately when fixing it is necessary to satisfy the rewritten boundary. Refresh working notes to record the newly discovered failure surface before patching.

**Sibling coherence**

11. If correcting one ticket changes ownership within an active series, inspect remaining siblings, update or defer overlapping tickets, keep deps and status coherent, and run the ticket dependency checker. If a user-confirmed 1-3-1 resolution changes inter-ticket contracts, update the downstream sibling in the same turn. Note which earlier sibling outcomes remain authoritative, which were superseded, and which shared contracts or helpers are reused unchanged. See also [Series Consistency](#series-consistency) for implementation-phase rules.

### Phase 3: Resolve Before Coding

Every stop condition below requires resolution before implementation proceeds.

12. **Factually wrong ticket**: Stop and present discrepancies before editing code.
13. **Unverifiable bug claim**: If a ticket's bug claim or measured symptom is not currently reproducible, or only the mechanism is verified while claimed incidence remains unproven, stop and resolve the boundary. Apply the **1-3-1 rule** to choose between proof-only, proof-plus-fix, or ticket-scope correction.
14. **Scope gaps or ambiguity**: For scope gaps, implementation choices, dependency conflicts, or ambiguous boundaries, apply the **1-3-1 rule** (1 problem, 3 options, 1 recommendation).
15. Continue reassessment after each confirmation until no boundary-affecting discrepancies remain — multiple sequential 1-3-1 rounds are normal.
16. Before coding, restate the authoritative boundary in the conversation (one sentence summarizing the corrected scope if any corrections were made) and confirm explicitly that there are no blocking discrepancies remaining. Skip the restatement if no corrections were made — the original ticket boundary is implicitly authoritative.

**Confirmation semantics**:
- If the user explicitly authorizes reassessment and instructs you to proceed with the best `FOUNDATIONS.md`-compliant option after you have already presented the discrepancy and choices, treat that as confirmation for the recommended option. Restate the authoritative boundary, then continue without forcing an extra round.
- If the user's response is only informational or does not clearly authorize a direction, remain stopped and ask for confirmation.

**Stale ticket boundary triage**:
- Stale wording but valid boundary → keep the boundary, correct stale claims, resolve implementation direction via 1-3-1.
- Stale deliverable inside a valid boundary → implement the live owned subset, call out the stale sub-claim explicitly in working notes/final summary, and do not trigger 1-3-1 unless the stale deliverable blocks correctness or forces a real scope decision.
- Stale incidence but relevant mechanism/invariant → treat as a proof-boundary decision, not automatic invalidation.
- Boundary itself is wrong → stop and resolve whether to rewrite, narrow, or supersede before coding.
- Already-satisfied deliverable → if investigation shows the ticket's core deliverable is already implemented by existing code, present a 1-3-1 with options: (a) close as already-satisfied with no code changes, (b) cosmetic refinement only, (c) rewrite ticket to target the remaining gap. Document the evidence of satisfaction in the Outcome section.

**Post-confirmation architecture reset**:
- When a user-confirmed 1-3-1 decision broadens or reframes the solution, restate the new authoritative boundary in working notes before coding.
- Re-extract owned deliverables, affected files, and proof obligations from the confirmed boundary rather than continuing from stale phrasing.

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

17. If the ticket is accurate and no blocking decision remains, proceed.

### Phase 4: Implement

18. Implement the corrected ticket directly, following all project conventions:
    - Worktree discipline: if working in a worktree, ALL file operations use the worktree root path
    - Immutability: always create new objects, never mutate
    - TDD for bug fixes: write the failing test first, then fix the code
    - Never adapt tests to preserve a bug
    - Run lint, typecheck, and tests before claiming completion (per Pre-Completion Verification rule)

## Implementation Rules

### General Principles

- Implement every explicit ticket deliverable. Do not silently skip items.
- Prefer minimal, architecture-consistent changes over local patches.
- Follow TDD for bug fixes: write the failing test first, then fix the code. Never adapt tests to preserve a bug.
- Treat `docs/FOUNDATIONS.md` as higher priority than ticket wording. Surface conflicts and propose Foundation-compliant resolutions before continuing.
- The ticket's `Files to Touch` list is a strong hint, not a hard limit. Include adjacent files for contracts, runtime consumers, schemas, fixtures, or tests when coherent completion requires them.
- "No code changes" means no production/runtime behavior changes. Ticket outcomes, archival moves, dependency rewrites, and sibling-ticket status updates are still required when they are the owned deliverable.
- If reassessment reveals a generic architectural limitation broader than the ticket's boundary, prefer creating or extending a follow-up spec over burying the gap in ticket-only notes.
- When a ticket names a test deliverable that would require disproportionate mocking or fixture setup relative to the code change, and the behavior is already exercised by existing integration/e2e tests, document the rationale for deferring the dedicated test and note it in the summary. The existing test coverage satisfies the behavioral invariant even without a dedicated unit test.

### Schema & Contract Migrations

When a change touches schemas or contracts, check updates across these layers:

#### Layer Checklist

- **Authored layer**: schema/doc types, source-shape/parser-facing doc types, validators, unknown-key allowlists
- **Compiled/runtime layer**: kernel/runtime types, Zod/JSON schemas, compiled DSL/AST shapes, generated schema artifacts
- **Consumer layer**: diagnostics/debug snapshots, exported provider interfaces and adapter wrappers, injected callback plumbing from orchestration down to provider/factory layers
- **Test layer**: fixtures, goldens, manually constructed runtime/test context objects (e.g., `GameDefRuntime`)

#### Migration Guidelines

**Additive changes**:
- When a ticket adds a new authored config key, surface family, or section field, update authored-shape doc types even if the ticket only names lowering or validator files.
- Preparatory tickets may add optional schema, trace, or contract fields ahead of later logic tickets, so long as verification proves artifact surfaces remain in sync.
- For additive compiled-field migrations, requiring the new field in compiler-owned artifacts while temporarily leaving handwritten TypeScript fixtures optional is valid when explicit, Foundation-compliant, and verified.
- If a new UI/store/model field mainly supports one feature path, consider keeping it optional on local test-helper contracts to avoid unnecessary fixture churn.

**Required-field migrations**:
- When an earlier ticket made a field required, add empty/default placeholders across constructors, defaults, fixtures, and goldens for atomicity.
- When the current ticket makes a shared field required, treat repo-owned constructors, helpers, fixtures, runtime schemas, and generated artifacts as in-scope immediately, even if sibling tickets or stale wording tried to defer them.
- Prefer updating shared helpers first, then use focused typecheck output to mop up remaining direct inline fixtures.
- Do not preserve a ticket's original slice when doing so would leave the repository in a knowingly broken mid-migration state. `FOUNDATIONS.md` §14 and §15 override that slicing.
- When a user-confirmed reassessment establishes a broader boundary, minimal repo-owned fallout may absorb work a later sibling originally claimed if necessary to make the confirmed boundary true in live runtime. Call out the absorbed sibling boundary explicitly.
- When tightening authored `chooseN` minimums: check whether runtime `max` can drop below the new `min`; if so, update legality/cost-validation in the same change.

**Union-variant migrations**:
- When refactoring a flat interface to a discriminated union and removing optional fields from specific variants would break consumer compilation, add `readonly field?: never` to non-owning variants as a migration bridge. This preserves compilation (existing `result.field!` patterns still type-check because `never` is assignable to any type) while enabling DU narrowing in the owning variant. Consumer tickets then replace `!` assertions with proper narrowing and the `never` field is removed.
- When a flat interface had an optional field used across multiple outcome branches (e.g., `reason?` on both `illegal` and `inconclusive`), keep the field on all variants that construct it — grep for construction sites before deciding which variants own the field.

**Runtime & identity boundaries**:
- Prefer a runtime-only storage layer behind the existing outward contract when an optimization would otherwise change canonical outward state or serialized shape.
- If Foundations require artifact-facing identifiers to remain canonical strings, introduce a separate runtime-only branded type rather than redefining the artifact-facing domain ID.

**Expression & state scoping**:
- When a ticket introduces callback-driven recursive evaluation on a derived state, verify that the inner pass resolves actor/seat identity and sources RNG from the derived state itself.
- When evaluating existing authored expressions against a derived state, audit the full expression subtree for hidden reads of the original state and migrate caches/helpers to be state-scoped.

### Golden & Fixture Drift

When a change alters compiled output, scoring, move selection, observability, or preview readiness:
- Treat owned production goldens (catalogs, summaries, traces, fixed-seed outputs) as expected update surfaces unless evidence shows unexpected drift outside the ticket boundary.
- When earlier groundwork introduced a required placeholder and the current ticket populates it, expect goldens to drift from stubs to populated values — normal ticket-owned fallout.
- When enriching diagnostics or trace output, prefer preserving the existing coarse summary field and adding an optional detail field unless the ticket explicitly owns a breaking schema redesign.
- When a nearby golden looks like expected drift, probe it explicitly — "no ticket-owned diff" is a valid conclusion.

### Gate, Audit & Profiling Tickets

For tickets whose primary deliverable is a measured decision:
1. Identify the explicit threshold, decision gate, or downstream trigger.
2. Verify which sibling tickets, specs, or reports depend on that gate.
3. A complete implementation may legitimately end in "do not change runtime code" when the result closes proposed follow-up as not actionable. Still complete every owned repository deliverable: update ticket outcome, archive/amend deciding spec/report, reconcile dependent ticket statuses.
4. When a completed gate proves downstream siblings are not actionable, update those siblings in the same turn.
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
- Run a bounded seed/turn/trace scan to discover a current reproducer, then encode it into owned integration tests.
- Distinguish clearly between **incidence proof** (the cited repro still happens now) and **mechanism proof** (the code still permits the failure). If incidence remains unverified, resolve via 1-3-1 first — do not silently treat mechanism proof as equivalent.
- For lifecycle/state-source migrations where a field becomes the single source of truth, audit both read paths and all write paths that can advance, consume, skip, expire, or probe that field. Check grant construction, issue-time probes, post-consumption advancement, post-skip/expire behavior, and any derived-state authorization or probe-time synthesized pending state.
- When you reproduce a live measured symptom before fixing it, record exact pre-fix evidence in a durable owned surface before the implementation overwrites that state. Prefer the rewritten ticket, active spec, or implementation notes.
- When a proof needs live authored behavior plus a small test-only policy or authoring hook, compile the production spec with a narrow in-memory overlay rather than editing production data solely to make the invariant testable.
- If the ticket names files to inspect rather than modify, read and assess them; leave unchanged when evidence shows no edit is needed; state the no-change decision explicitly.
- If a ticket names an authored data file as an optional surface tweak, verify whether compiled defaults already satisfy the contract before editing.

## Verification

### Execution Order

1. Run the most relevant tests for the touched area.
2. Run required typecheck, lint, or artifact-generation commands. If a full repo-wide command is too expensive, explain what was run and what remains unverified.
3. Report unrelated pre-existing failures separately from failures caused by your changes.
4. Prefer the narrowest commands that validate the real changed code path. For documentation-only tickets whose examples depend on already-verified behavior, artifact inspection plus dependency-integrity checks may suffice.
5. **Ticket-named commands are authoritative**: Run them before declaring completion unless reassessment proves them stale or superseded. Narrower checks provide fast feedback but do not replace ticket-explicit commands.
6. **Command substitution**: If a ticket's example command conflicts with live repo tooling (e.g., Jest flags in a Node test-runner package), use the repo-approved equivalent. State substitutions explicitly.
7. **Long-running authoritative commands**: Some ticket-required verification commands may run for minutes with sparse or bursty output (for example determinism lanes or large property suites). Treat that as normal when consistent with repo history, keep the command running, and provide periodic progress updates rather than substituting a narrower check.

### Build Ordering & Output Contention

Tests depending on `dist` require typecheck/rebuild first. Module-resolution errors during concurrent clean/rebuild are ordering failures — rerun after the serialized build finishes.

Before running broader commands, check whether they share generated output trees, caches, or clean steps. Commands that run `clean`, write `dist`, regenerate schemas, or depend on built test files must finish before another command touching the same tree starts.

**In this repo**: `pnpm -F @ludoforge/engine build`, `pnpm -F @ludoforge/engine test`, `pnpm turbo build`, and `pnpm turbo typecheck` all contend on `packages/engine/dist` — run them serially even when they all appear in the ticket's acceptance list.

### Escalation Ladder

Default verification order:
1. Focused test or reproducer for touched behavior
2. Touched-package typecheck/build/lint
3. Required artifact regeneration for schema/contract changes
4. Ticket-explicit broader package or root commands

Escalate sooner for shared exported contracts or cross-package consumers.

### Failure Isolation

- **Broader failures**: Determine whether they are inside the corrected ticket boundary or owned by another active ticket. Do not silently absorb out-of-boundary scope. Minimal downstream fixes for shared exported contract fallout are required scope. Document as residual risk if covered by another ticket; stop and resolve with the user if not.
- **Test helper staleness**: Inspect shared test helpers, fixtures, and goldens for stale assumptions. Check seed-specific helper states or turn-position fixtures. Retarget to a current seed/turn exercising the same invariant. Test malformed and unsupported shapes for clean fallback on new fast paths. Check callers constructing minimal contexts when a new fast path depends on enriched context objects.
- **Isolating `node --test` failures**: If only a top-level file failure appears, rerun narrowly with test-name filtering or direct helper reproduction. Run built test modules directly for nested subtest output. For compiler/schema tests, reproduce minimal compile input against the built module.
- **Raw-vs-classified debugging**: Compare raw `legalMoves(...)`, classified `enumerateLegalMoves(...)`, and downstream agent preparation surfaces separately. For agent-driven regressions, inspect the preparation layer (e.g., `preparePlayableMoves(...)`) before assuming the bug belongs to legality or move enumeration.
- **Fallback paths**: When a ticket changes a fallback compilation or runtime path, verify that path directly AND check the primary production path for non-regression.

### Export & Regression Guards

- If implementation adds a helper or type primarily for tests, check whether the module has export-surface guards. Prefer structural local typing or test-local seams over widening a curated public API.
- If a ticket includes a vague "no performance regression" clause without naming a benchmark, resolve with 1-3-1 or satisfy through the nearest existing regression suite.

### Schema & Artifact Regeneration

- If you changed runtime Zod/object schemas or shared serialized contract shapes, regenerate schema artifacts before interpreting schema-test failures.
- Confirm producing commands have exited before diagnosing artifact contents. Confirm artifact paths match command write targets.
- Check freshness (timestamp or file size) before treating missing fields as real discrepancies.
- When touched source contributes to exported contracts or schema surfaces, expect generator-backed artifact checks even if the ticket didn't name a generated file.
- New lowered ref kinds or expression variants: assume `GameDef.schema.json` may drift even if edits are outside `schemas-core.ts`.
- Runtime schema shape changes: expect `Trace.schema.json` or other serialized artifacts to drift even if the ticket only named TypeScript or Zod surfaces.
- When a shared generator rewrites multiple artifacts, identify which encode the changed contract and summarize specifically.
- If regeneration leaves no persisted diff, state explicitly that the surface was checked and remained in sync.

### Measured-Gate Outcome

For profiling/audit tickets, capture: measured surface, command(s), decisive result, threshold comparison, downstream action (archived/amended/deferred/not-actionable).

### Standard Commands

```
pnpm turbo build
pnpm turbo test
pnpm turbo lint
pnpm turbo typecheck
pnpm turbo schema:artifacts
```

## Follow-Up

1. Summarize what changed, what was verified, and any residual risk.
   - State explicitly: audited schema/artifact ripple effects (even if none needed), deferred verification owned by another ticket, resolved 1-3-1 decisions (especially Foundation type discipline), rules-evidence notes for game-specific legality corrections.
   - State explicitly: any ticket premise that remained unverified, especially claimed repro seeds, counts, traces, or production observations.
2. If the ticket appears complete, offer to archive per `docs/archival-workflow.md`.
   - Archive command: `node scripts/archive-ticket.mjs tickets/<ID>.md archive/tickets/`
3. If the user wants archival or follow-up review, hand off to `post-ticket-review`. If this implementation superseded semantics in a recently archived sibling, call that out in the handoff.

## Example Usage

```
/implement-ticket tickets/LEGACTTOO-009*
/implement-ticket tickets/FITLSEC7RULGAP-001*
/implement-ticket .claude/worktrees/my-feature/tickets/FOO-003*
/implement-ticket tickets/FITLSEC7RULGAP-001* context:"Read dependent specs first and stop if the ticket is stale."
```
