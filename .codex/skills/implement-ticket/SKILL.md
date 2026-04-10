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
- Capture reassessment outcomes affecting correctness: discrepancy lists, evidence classification, authoritative boundary restatements, verification-owned scope corrections.
- Do not create scratch files solely to satisfy this requirement.

## Workflow

### Phase 1: Read and Understand

1. Read `docs/FOUNDATIONS.md` before planning or coding.
2. Read the ticket file(s) matching the provided path or glob.
3. Read referenced specs, docs, and `Deps`. Read `AGENTS.md` and respect worktree discipline (all reads, edits, greps, moves, and verification commands use the worktree root when the ticket lives under `.claude/worktrees/<name>/`).
   - If equivalent `AGENTS.md` instructions are already in session context, rely on that context but still prefer the file when repo-local details might differ or the ticket references on-disk policy.
4. Inspect repo state (e.g., `git status --short`) early. Call out unrelated dirty files, pre-existing failures, or concurrent work so your diff stays isolated.
5. Extract all concrete references: file paths, functions, types, classes, modules, tests, scripts, and artifacts the ticket expects.

#### Session and Series Context

- **Session continuity**: Reuse already-verified context from prior tickets in the same series. Prefer reusing or extracting helpers over duplicating logic. If a completed sibling already satisfied part of the current deliverable, anchor reassessment to the remaining gap.
- **Series slice discipline**: When a referenced spec is broader than the current ticket, treat the ticket as the implementation boundary unless verified evidence shows the slice is stale, internally inconsistent, or impossible without broader fallout. Confirm which broader spec work is deferred to siblings.

#### Draft Handling

When the active ticket or referenced artifacts are untracked drafts:

1. Confirm draft/untracked state explicitly, including siblings and referenced specs.
2. Treat the active draft ticket as the session contract once reassessment is complete.
3. Classify stale draft wording separately from true boundary errors in working notes and final closeout.
4. Prefer correcting the active draft ticket over broad sibling/spec cleanup unless the live boundary truly requires wider edits.
5. Prefer minimal sibling edits until live verification or authoritative evidence proves ownership drift. If live verification forces absorbed fallout, update the active ticket outcome first, then narrow or rewrite only the directly affected siblings.

### Phase 2: Reassess Assumptions

#### Artifact Verification

6. Verify every referenced artifact against the live codebase with targeted reads and `rg`:
   - File existence and path accuracy
   - Named exports, functions, types, and signatures
   - Module structure and required dependencies/scripts
   - Concrete callsites: check whether behavior is still owned there or has been centralized behind a shared helper; treat already-migrated sites as stale sub-claims.
   - Widened compilation/optimization for an existing AST/expression family: compare live interpreter/evaluator semantics directly before accepting the ticket's claimed subset.
7. Build a discrepancy list. Classify each item (see [Stale-vs-Blocking Triage](#stale-vs-blocking-triage)).

#### Stale-vs-Blocking Triage

Distinguish clearly between:

| Category | Examples | Action |
|----------|----------|--------|
| **Nonblocking drift** | Stale file paths, renamed test files, stale example commands, path-only movement where the intended artifact is clear | Correct in working notes & implementation; no stop required |
| **Blocking discrepancy** | Wrong owned boundary, wrong bug premise, impossible acceptance criteria, stale wording that changes what must be implemented | Stop and resolve before coding |

Additional triage rules:
- Stale paths that uniquely identify their intended artifact are nonblocking.
- Path-only drift is not a scope discrepancy (e.g., `src/kernel/foo.ts` moved to `src/contracts/foo.ts` with the same purpose).
- Stale test paths: prefer the live test surface that owns the behavior.
- Stale wording but valid boundary: keep the boundary, correct stale claims, resolve implementation direction via 1-3-1.
- Stale deliverable inside a valid boundary: implement the live owned subset, call out the stale sub-claim in working notes/final summary; no 1-3-1 unless it blocks correctness.
- Stale incidence but relevant mechanism/invariant: treat as a proof-boundary decision, not automatic invalidation.
- Active ticket mostly collapsed by earlier sibling work but a concrete owned invariant remains: rewrite around the residual live boundary.
- Boundary itself is wrong: stop and resolve whether to rewrite, narrow, or supersede.

#### Architectural Constraints

8. Check constraints the ticket may have underspecified:
   - Shared type or schema ripple effects
   - Cross-package fallout for shared exported unions, serialized trace kinds, and exhaustiveness-based consumers
   - Same-package fallout for widened shared unions: grep local `switch` statements, discriminated-union helpers, exhaustiveness guards
   - When changing a shared callable type contract, grep both runtime callsites and their tests
   - Foundation 14 atomic migrations for removals or renames
   - Required test, schema, or fixture updates
   - When the ticket disputes game-specific legality, consult local rulebook extracts or rules reports

#### Evidence Classification

9. When a ticket claims a live bug, measured runtime symptom, or concrete production evidence, classify before coding:
   - **Incidence verified**: reproduced the claimed symptom
   - **Mechanism verified**: proved the code still permits the failure
   - **Both verified**
   - **Neither verified**
   Record explicitly in working notes. See [Production-Proof & Regression Tickets](#production-proof--regression-tickets) for implementation guidance.

#### Migration & Rewrite Awareness

10. **Mid-migration**: Distinguish the ticket's intended end state from work already landed. Treat extra files needed for Foundation 14 atomicity as required scope. Call out partial-migration state before coding. Treat referenced dirty specs as read-only context when the current ticket does not own spec edits.
11. **Ticket rewrites**: If you materially correct ticket scope, re-extract files, acceptance criteria, invariants, and verification commands from the corrected ticket. Treat the rewritten ticket as authoritative. If later verification disproves the rewrite premise, restore the original boundary and note why. If typecheck/build evidence proves a rewritten acceptance case is impossible under the live surface, amend the ticket again. When the rewrite disproves an active spec's stated root cause or owned boundary, update that spec in the same turn unless another active ticket owns that correction.
    - If a rewritten verification-owned ticket exposes a concrete live failure while running its acceptance commands, treat it as in-scope when fixing is necessary to satisfy the rewritten boundary. Refresh working notes before patching.

#### Sibling Coherence

12. If correcting one ticket changes ownership within an active series:
    - Inspect remaining siblings for overlap, stale assumptions, or stale staged ownership.
    - Update or defer overlapping tickets; keep deps and status coherent.
    - Run `pnpm run check:ticket-deps` when available.
    - If a downstream sibling cleanly owns the remaining fallout, leave it unchanged and validate deps/status.
    - Note which earlier sibling outcomes remain authoritative, which were superseded, and which shared contracts/helpers are reused unchanged.
    - If a user-confirmed 1-3-1 resolution changes inter-ticket contracts, update the downstream sibling in the same turn.
    - Before creating a new ticket or materially extending an active one, read `tickets/README.md` and `tickets/_TEMPLATE.md` unless already loaded.

### Phase 3: Resolve Before Coding

Every stop condition below requires resolution before implementation proceeds.

13. **Factually wrong ticket**: Stop and present discrepancies. Do not stop for nonblocking drift (see [Stale-vs-Blocking Triage](#stale-vs-blocking-triage)).
14. **Unverifiable bug claim**: If a ticket's bug claim is not reproducible, or only mechanism is verified while incidence remains unproven, stop and resolve via **1-3-1** (proof-only, proof-plus-fix, or scope correction).
15. **Scope gaps or ambiguity**: Apply the **1-3-1 rule** (1 problem, 3 options, 1 recommendation).
16. Continue reassessment after each confirmation until no boundary-affecting discrepancies remain. Multiple 1-3-1 rounds are normal.
17. Restate the authoritative boundary in working notes and confirm no blocking discrepancies remain before coding.

#### Confirmation Semantics

- If the user explicitly authorizes reassessment and instructs you to proceed with the best `FOUNDATIONS.md`-compliant option after you have presented the discrepancy and choices, treat that as confirmation. Restate the boundary, then continue.
- If the user's response is only informational, remain stopped and ask for confirmation.

#### Post-Confirmation Architecture Reset

When a user-confirmed 1-3-1 decision broadens or reframes the solution:
1. Restate the new authoritative boundary in working notes.
2. If the confirmed resolution changes the active ticket's owned boundary, amend the ticket first.
3. Open every directly affected sibling ticket. Compare named files, deliverables, and deps against the rewritten boundary. Update in the same turn or record why no edit is needed.
4. Re-extract owned deliverables, affected files, proof obligations, acceptance criteria, test paths, and verification commands from the confirmed boundary.
5. Record which sibling scope was absorbed and what remains deferred.

#### 1-3-1 Edge Cases

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

18. If the ticket is accurate and no blocking decision remains, proceed.

## Implementation Rules

### General Principles

- Implement every explicit ticket deliverable. Do not silently skip items.
- Prefer minimal, architecture-consistent changes over local patches.
- If an existing authority/helper API is broader than the caller's verified contract, add the narrowest authority-level helper that preserves semantics rather than embedding a caller-local workaround.
- When consolidating logic into a shared authority module, inspect import direction first and prefer placement that preserves an acyclic dependency graph.
- When a ticket's named implementation file delegates through a deeper shared authority module, the minimum authority-module work required to make the named deliverable real is in-scope. Update any sibling that previously claimed that absorbed slice.
- Follow TDD for bug fixes: write the failing test first, then fix the code. Never adapt tests to preserve a bug.
- Treat `docs/FOUNDATIONS.md` as higher priority than ticket wording. Surface conflicts and propose Foundation-compliant resolutions.
- The ticket's `Files to Touch` is a strong hint, not a hard limit. Include adjacent files for contracts, consumers, schemas, fixtures, or tests when coherent completion requires them.
- When a ticket moves or re-exports an existing symbol, minimal consumer import fallout to keep the repository building is in-scope.
- "No code changes" means no production/runtime behavior changes. Ticket outcomes, archival moves, dependency rewrites, and sibling-ticket status updates are still required when owned.
- If reassessment reveals a generic architectural limitation broader than the ticket's boundary, prefer creating or extending a follow-up spec.

### Mechanical Refactors

For tickets whose primary deliverable is a mechanical extraction, rename, deduplication, or import cleanup with no intended behavior change:
- Prove the duplication or stale surface exists before editing.
- Record stale sub-claims (imports, helpers, touch points proved unnecessary during reassessment) in working notes before coding.
- Scan private helper functions as well as exported entry points for the same class of write/mutation/alias the ticket eliminates. Same-file helper fallout is usually in-scope.
- Extract or consolidate with the narrowest architecture-consistent module or helper.
- If the ticket's named shared helper covers only part of the live pattern, compose it with the smallest additional helper needed to eliminate the remaining caller-local transform.
- Scan touched files for dangling references to removed locals before running broader verification.
- Acceptance proof: old local surfaces are gone, consumers reference the shared surface, authoritative non-regression commands pass.
- Nearby dangling symbols, imports, or signature ripple necessary for refactor completion: in-scope fallout.

### Schema & Contract Migrations

When a change touches schemas or contracts, check updates across these layers:

#### Layer Checklist

- **Authored layer**: schema/doc types, source-shape/parser-facing doc types, validators, unknown-key allowlists
- **Compiled/runtime layer**: kernel/runtime types, Zod/JSON schemas, compiled DSL/AST shapes, generated schema artifacts
- **Consumer layer**: diagnostics/debug snapshots, exported provider interfaces and adapter wrappers, injected callback plumbing
- **Test layer**: fixtures, goldens, manually constructed runtime/test context objects (e.g., `GameDefRuntime`)

#### Migration Guidelines

**Additive changes**:
- New authored config key, surface family, or section field: update authored-shape doc types even if the ticket only names lowering or validator files.
- Preparatory tickets may add optional schema/trace/contract fields ahead of logic tickets, so long as verification proves artifact surfaces remain in sync.
- For additive compiled-field migrations, requiring the new field in compiler-owned artifacts while leaving handwritten TypeScript fixtures temporarily optional is valid when explicit, Foundation-compliant, and verified.
- If a new field mainly supports one feature path, consider keeping it optional on local test-helper contracts to avoid unnecessary fixture churn.

**Required-field migrations**:
- When an earlier ticket made a field required, add empty/default placeholders across constructors, defaults, fixtures, and goldens for atomicity.
- When the current ticket makes a shared field required, repo-owned constructors, helpers, fixtures, runtime schemas, and generated artifacts are in-scope immediately.
- Update shared helpers first, then use focused typecheck output for remaining inline fixtures.
- Do not preserve a ticket's original slice when doing so would leave the repository in a broken mid-migration state. `FOUNDATIONS.md` SS14 and SS15 override slicing.
- When a user-confirmed reassessment establishes a broader boundary, minimal repo-owned fallout may absorb sibling work if necessary for the confirmed boundary. Call out absorbed scope explicitly.
- When tightening authored `chooseN` minimums: check whether runtime `max` can drop below the new `min`; if so, update legality/cost-validation in the same change.
- When centralizing derived data into an earlier phase, compare old consumer evaluation point against new computation point and preserve timing-sensitive filtering, state reads, or post-effect semantics.

**Runtime & identity boundaries**:
- Prefer a runtime-only storage layer behind the existing outward contract when an optimization would otherwise change canonical state or serialized shape.
- If Foundations require artifact-facing identifiers to remain canonical strings, introduce a separate runtime-only branded type.

**Expression & state scoping**:
- Callback-driven recursive evaluation on derived state: verify that the inner pass resolves actor/seat identity and sources RNG from the derived state itself.
- Evaluating existing expressions against derived state: audit the full expression subtree for hidden reads of the original state and migrate caches/helpers to be state-scoped.

### Golden & Fixture Drift

When a change alters compiled output, scoring, move selection, observability, or preview readiness:
- Treat owned production goldens as expected update surfaces unless evidence shows unexpected drift outside the ticket boundary.
- Before editing an owned golden, capture fresh authoritative output from the current built runtime or test harness.
- When earlier groundwork introduced a required placeholder and the current ticket populates it, expect goldens to drift from stubs to populated values.
- When enriching diagnostics or trace output, prefer preserving the existing coarse summary field and adding an optional detail field unless the ticket owns a breaking schema redesign.
- Probe nearby goldens that look like expected drift explicitly.
- In this repo, compiled-agent contract changes often surface first in policy production goldens (`policy-production-golden.test.ts`, policy catalog fixtures, fixed-seed policy summaries); check those before assuming broader regression.

### Gate, Audit & Profiling Tickets

For tickets whose primary deliverable is a measured decision:
1. Identify the explicit threshold, decision gate, or downstream trigger.
2. Verify which siblings, specs, or reports depend on that gate.
3. A complete implementation may legitimately end in "no runtime code changes" when the result closes proposed follow-up as not actionable. Still complete every owned repository deliverable: update ticket outcome, archive/amend deciding spec/report, reconcile dependent ticket statuses.
4. When a completed gate proves downstream siblings are not actionable, update those siblings in the same turn.
5. Distinguish runtime/code changes from repository-owned deliverables (ticket outcomes, archived specs, dependency rewrites, status updates).
6. If a diagnostic report has no named output file, prefer `reports/` over ephemeral scratch files.

### Investigation Tickets

For tickets whose primary deliverable is a verdict rather than a production code change:
1. Capture the decisive evidence in the owned ticket or other explicitly owned artifact.
2. If the verdict warrants downstream implementation, create or extend the follow-up ticket in the same turn; keep deps/status consistent.
3. After verdict and any required follow-up artifact are in place, decide whether the investigation ticket is archive-ready.
4. If archival is the obvious next state, complete it when the user asked for full closeout, or hand off to `post-ticket-review`.
5. Distinguish ticket-owned deliverables (verdict text, follow-up ticket, dependency updates, archival readiness) from runtime/code changes.

### Series Consistency

When a ticket change affects other active tickets in the same series:
- Inspect siblings for overlap, stale staged ownership, or stale assumptions.
- Update statuses, deps, and scope text so the active series stays coherent.
- Run `pnpm run check:ticket-deps` when available.
- If a downstream sibling cleanly owns the remaining fallout, leave it unchanged and validate deps/status.
- If the active ticket's authoritative verification fails on generated artifacts, goldens, or other repo-owned fallout that a sibling draft planned to pick up later, absorb the minimum fallout required for the active ticket to be true in live runtime, then update the affected sibling(s).
- Note informative but non-blocking sibling drift in working notes without absorbing scope.
- If sibling/spec artifacts are already dirty or untracked drafts, prefer editing only the active ticket unless the user asked for broader cleanup or the stale sibling would directly invalidate the boundary.
- If a referenced spec mentions a deliverable split into a later sibling, keep implementation anchored to the current ticket boundary.
- When a new follow-up spec changes framing around an adjacent active spec, prefer a small cross-reference update over rewriting the adjacent spec's problem statement.

#### Series Rewrite Checklist

When a confirmed boundary rewrite absorbs or defers work across the series:
1. Open each directly affected sibling ticket before coding.
2. Compare sibling named files, deliverables, and deps against the rewritten boundary.
3. Update sibling scope/deps/status in the same turn or record why no edit was necessary.
4. Run `pnpm run check:ticket-deps` when available.
5. In working notes and final closeout, name absorbed and deferred scope.

### Groundwork Tickets

For preparatory tickets landing shared helpers, contracts, or APIs ahead of caller migration:
- Implement the owned groundwork fully even when no live caller adopts it yet.
- Keep broader behavioral adoption anchored to the sibling tickets that own it.
- In the final summary, separate what landed now from what remains deferred.
- Treat deferred adoption as residual risk only when callers still rely on older paths after groundwork lands.

### Production-Proof & Regression Tickets

- Prefer extending the live test module that already owns the contract under audit before creating new files solely to match stale ticket test paths.
- If cited production examples, cards, or seeds are stale, prefer a current deterministic reproducer or synthetic proof fixture.
- Run a bounded seed/turn/trace scan to discover a current reproducer, then encode it into owned integration tests.
- Distinguish clearly between **incidence proof** (the cited repro still happens) and **mechanism proof** (the code still permits the failure). If incidence remains unverified, resolve via 1-3-1 first.
- For lifecycle/state-source migrations where a field becomes the single source of truth, audit both read and write paths: grant construction, issue-time probes, post-consumption advancement, post-skip/expire behavior, derived-state authorization, probe-time synthesized pending state.
- Record exact pre-fix evidence in a durable surface before the implementation overwrites that state.
- When a proof needs live authored behavior plus a small test-only policy or hook, compile the production spec with a narrow in-memory overlay rather than editing production data.
- If the ticket names files to inspect rather than modify, read and assess them; leave unchanged when evidence shows no edit is needed; state the no-change decision explicitly.
- If a ticket names an authored data file as an optional surface tweak, verify whether compiled defaults already satisfy the contract before editing.

## Verification

### Execution Order

1. Run the most relevant tests for the touched area.
   - If a focused check reads built `dist/` artifacts while a rebuild is still in progress, treat the failure as inconclusive; wait for the build and rerun.
2. Run required typecheck, lint, or artifact-generation commands. If a full repo-wide command is too expensive, explain what was run and what remains unverified.
3. Report unrelated pre-existing failures separately from failures caused by your changes.
4. Prefer the narrowest commands that validate the actual changed code path. For documentation-only tickets, artifact inspection plus dependency-integrity checks may suffice.
5. **Ticket-named commands are authoritative**: Run them before declaring completion unless reassessment proves them stale. Narrower checks provide fast feedback but do not replace ticket-explicit commands.
   - Focused proof commands may run first for fast feedback but do not satisfy the ticket on their own.
6. **Command substitution**: If a ticket's example command conflicts with live repo tooling (e.g., Jest flags in a Node test-runner package), use the repo-approved equivalent. State substitutions explicitly.
   - In this repo, engine tests use `node --test`; replace Jest-style name filtering with `pnpm -F @ludoforge/engine build` followed by `pnpm -F @ludoforge/engine exec node --test dist/test/unit/<file>.test.js`.
7. **Long-running commands**: Some ticket-required commands may run for minutes with sparse output. Treat that as normal when consistent with repo history; keep running and provide periodic progress updates.
8. **Post-clean reruns**: If a later authoritative command cleans shared build output (e.g., `dist`), rerun earlier test lanes after rebuilding. Treat the first post-clean module-resolution failure as an ordering issue.

### Build Ordering & Output Contention

Tests depending on `dist` require typecheck/rebuild first. Module-resolution errors during concurrent clean/rebuild are ordering failures — rerun after the serialized build.

Before running broader commands, check whether they share generated output trees, caches, or clean steps. Commands that clean, write `dist`, regenerate schemas, or depend on built test files must finish before another command touching the same tree starts.

Do not launch contending commands in the same parallel tool batch.

**In this repo**: `pnpm -F @ludoforge/engine build`, `pnpm -F @ludoforge/engine test`, `pnpm turbo build`, and `pnpm turbo typecheck` all contend on `packages/engine/dist` — run serially.

### Escalation Ladder

1. Focused test or reproducer for touched behavior
2. Touched-package typecheck/build/lint
3. Required artifact regeneration for schema/contract changes
4. Ticket-explicit broader package or root commands

Escalate sooner for shared exported contracts or cross-package consumers.

### Failure Isolation

**Boundary determination**: Determine whether broader failures are inside the corrected ticket boundary or owned by another active ticket. Do not silently absorb out-of-boundary scope. Minimal downstream fixes for shared exported contract fallout are required scope. Document as residual risk if covered by another ticket; stop and resolve with the user if not.

**Mechanical-refactor fallout**: After removing local aliases or helpers, scan touched files for remaining references in type annotations, return types, overloads, test seams, and import lists before assuming a `typecheck` failure is broader fallout.

**Test helper staleness**: Inspect shared test helpers, fixtures, and goldens for stale assumptions. Check seed-specific helper states or turn-position fixtures. Retarget to a current seed/turn exercising the same invariant. Test malformed and unsupported shapes for clean fallback on new fast paths. Check callers constructing minimal contexts when a new fast path depends on enriched context objects. With `exactOptionalPropertyTypes`, model "field absent" by omitting the optional field rather than assigning `undefined`.

**Compiled-IR fixture drift**: For positive schema or contract tests covering compiled nodes, copy the shape from nearby live compiled examples, existing goldens, or current compiled fixtures rather than reconstructing from authored syntax or spec pseudocode.

**Identity-sensitive cache proofs**: When proving WeakMap or reference-keyed cache behavior, verify that helper fixtures preserve AST object identity. Avoid helpers that clone, retag, or normalize nodes when the assertion depends on repeated evaluation of the same object reference.

**Isolating `node --test` failures**: If only a top-level file failure appears, rerun narrowly with test-name filtering or direct helper reproduction. Run built test modules directly for nested subtest output. For compiler/schema tests, reproduce minimal compile input against the built module.

**Built-test reporter fallback**: When a focused built-file `node --test` invocation reports only a top-level failure without nested assertion details, rerun the built module directly or with a repo-approved verbose reporter so the failing subtest becomes visible before patching.

**Raw-vs-classified debugging**: Compare raw `legalMoves(...)`, classified `enumerateLegalMoves(...)`, and downstream agent preparation surfaces separately. For agent-driven regressions, inspect the preparation layer (e.g., `preparePlayableMoves(...)`) before assuming the bug belongs to legality or move enumeration.

**Fallback paths**: When a ticket changes a fallback compilation or runtime path, verify that path directly AND check the primary production path for non-regression.

### Export & Regression Guards

- If implementation adds a helper or type primarily for tests, check whether the module has export-surface guards. Prefer structural local typing or test-local seams over widening a curated public API.
- If a ticket includes a vague "no performance regression" clause without naming a benchmark, resolve with 1-3-1 or satisfy through the nearest existing regression suite.

### Schema & Artifact Regeneration

- If you changed runtime Zod/object schemas or shared contract shapes, regenerate schema artifacts before interpreting schema-test failures.
- Confirm producing commands have exited before diagnosing artifact contents. Confirm artifact paths match command write targets.
- Check freshness (timestamp or file size) before treating missing fields as real discrepancies.
- When touched source contributes to exported contracts or schema surfaces, expect generator-backed artifact checks even if the ticket didn't name a generated file.
- New lowered ref kinds or expression variants: assume `GameDef.schema.json` may drift even if edits are outside `schemas-core.ts`.
- Runtime schema shape changes: expect `Trace.schema.json` or other serialized artifacts to drift even if the ticket only named TypeScript or Zod surfaces.
- When a shared generator rewrites multiple artifacts, identify which encode the changed contract and summarize specifically.
- If regeneration leaves no persisted diff, state explicitly that the surface was checked and remained in sync.
- If an authoritative verification lane fails on schema sync or golden fallout, treat that failure as stronger evidence than a draft sibling's deferred ownership text. Absorb the minimum required artifact update, then rewrite sibling ownership to match.

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

1. If implementation completed and no blocking discrepancy remains, update the active ticket:
   - Set ticket status to its completed state when appropriate.
   - Add or amend the ticket outcome with what landed, boundary corrections, and verification that ran.
   - If the final diff intentionally omitted or expanded beyond original `Files to Touch`, record that explicitly in the ticket outcome.
2. Summarize what changed, what was verified, and any residual risk. Include:
   - Audited schema/artifact ripple effects (even if none needed)
   - Deferred verification owned by another ticket
   - Resolved 1-3-1 decisions (especially Foundation type discipline)
   - Rules-evidence notes for game-specific legality corrections
   - Any unverified ticket premise (claimed repro seeds, counts, traces, production observations)
3. **Closeout checklist**:
   - What landed in this ticket
   - Which verification commands ran
   - Whether schema/artifact surfaces were checked and whether they changed
   - Scope deferred to sibling tickets, if any
   - Unverified ticket premises or residual risk
4. If the ticket appears complete, offer to archive per `docs/archival-workflow.md`.
5. If the user wants archival or follow-up review, hand off to `post-ticket-review`. When the main remaining work is archival hygiene, dependency integrity, or adjacent-ticket review, suggest it as the default next step. If this implementation superseded semantics in a recently archived sibling, call that out in the handoff.

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
