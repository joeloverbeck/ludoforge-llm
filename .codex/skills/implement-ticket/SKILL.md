---
name: implement-ticket
description: Read, reassess, and implement a repository ticket when the user asks to implement a ticket or provides a ticket path. Use for ticket-driven work that must validate the ticket against the current codebase, surface discrepancies before coding, then implement and verify the full deliverable set.
---

# Implement Ticket

Use this skill when the user asks to implement a ticket, gives a ticket file path, or clearly wants ticket-driven execution.

This skill covers both code-changing tickets and ticket-owned execution work whose primary deliverable is a measured decision, archival update, or series-status correction rather than runtime source edits.

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
If that earlier ticket introduced production-corpus traversal, fixture readers, or verification scaffolding for the same feature area, prefer reusing or extracting those helpers over duplicating the logic in the follow-on ticket.

### Phase 2: Reassess Assumptions

6. Verify every referenced artifact against the live codebase with targeted reads and `rg`:
   - Does each file exist at the stated path?
   - Do named exports, functions, types, and signatures exist as described?
   - Does the module structure match the ticket?
   - Are required dependencies and scripts present?
   - If a referenced file path is stale but the intended owned artifact is uniquely discoverable and the ticket boundary stays the same, treat the path as non-blocking and note the corrected live path in your working notes.
   - If a referenced test file path is stale, prefer the live test surface that actually owns the behavior rather than forcing edits into the obsolete path, unless the ticket explicitly requires a new dedicated test file.
7. Build a discrepancy list for anything the ticket states that does not match reality.
8. Check for architectural constraints the ticket may have underspecified:
   - shared type or schema ripple effects
   - Foundation 14 atomic migrations for removals or renames
   - required test, schema, or fixture updates
   - when the ticket disputes whether a game-specific move, phase, or action should be legal, consult any local rulebook extracts or rules reports referenced by the repo before deciding whether the fix is policy-only or a legality correction
9. If the codebase is already mid-migration:
   - distinguish between the ticket's intended end state and migration work that has already landed
   - decide whether the remaining deliverable boundary is still clear and implementable without a new product decision
   - treat extra adjacent files needed for Foundation 14 atomicity as required scope, not optional cleanup
   - call out the partial-migration state explicitly before coding
   - when a referenced spec is already dirty but the current ticket does not own spec edits, treat that spec as read-only context and call out the unrelated worktree state explicitly rather than trying to sync it in the same turn
10. If you rewrite or materially correct the ticket scope before implementation:
   - re-extract the concrete files, acceptance criteria, invariants, and verification commands from the corrected ticket
   - do not keep using the stale ticket's original verification surface by inertia
   - treat the rewritten ticket as the authoritative implementation boundary for the rest of the task
   - if later verification disproves the premise for that rewrite, promptly restore the original ticket boundary and note why the rewrite was rolled back
11. If correcting one active ticket materially changes ownership within an active ticket series:
   - inspect the remaining active sibling tickets in that series before coding
   - update or defer overlapping sibling tickets so they do not still claim invalid staged ownership
   - keep dependency references and status values coherent across the series
   - run the repo's ticket dependency checker after the series rewrite when available
   - if the referenced spec still mentions a deliverable that is already split into a later active sibling ticket, keep implementation anchored to the current active ticket boundary and verify that sibling ownership instead of re-absorbing the broader spec scope
   - if a user-confirmed `1-3-1` resolution changes the contract between consecutive active tickets, update the downstream sibling ticket in the same turn so staged ownership and interface assumptions remain coherent
12. If the ticket is a profiling, audit, benchmark, investigation, or other gate-setting ticket:
   - identify the explicit threshold, decision gate, or downstream trigger owned by the ticket
   - verify which sibling tickets, specs, or reports depend on that gate
   - treat closure of downstream work as part of the implementation boundary when the measured result invalidates that work
   - distinguish runtime/code changes from repository-owned deliverables such as ticket outcomes, archived specs, dependency rewrites, and status updates
   - when the diagnostic result materially disproves the stated premise of active sibling tickets, update those sibling tickets in the same turn so the active series no longer advertises invalid work

### Phase 3: Resolve Before Coding

13. If the ticket is factually wrong, stop and present the discrepancies before editing code.
14. If the issue is not a factual error but a scope gap, implementation choice, dependency conflict, or ambiguous partial-migration boundary, apply the repository's `1-3-1` rule:
    - 1 clearly defined problem
    - 3 concrete options
    - 1 recommendation
15. Do not proceed with implementation until the user confirms when a discrepancy or `1-3-1` decision is outstanding.
16. If the ticket boundary remains valid but one concrete implementation detail is ambiguous, under-specified, or conflicts with Foundations:
    - resolve that detail with `1-3-1`
    - after user confirmation, treat the confirmed interpretation as authoritative for the rest of the task
    - continue reassessment after that confirmation until no further boundary-affecting discrepancies remain, even if the same ticket requires multiple sequential `1-3-1` rounds
    - do not force a ticket rewrite unless the implementation boundary itself changed
    - if the conflict is that a ticket or spec uses raw strings for an identifier that already has a branded domain type in the repo, preserve the ticket boundary, raise the Foundation conflict explicitly, and prefer the existing branded type once confirmed
    - if a ticket proposes a new field whose meaning is already covered by an existing live contract field, treat it as a bounded discrepancy plus `1-3-1` and prefer reusing the existing field rather than introducing parallel names for the same concept
    - if the mismatch is a narrow factual detail inside an otherwise valid ticket boundary, treat it as a bounded discrepancy plus `1-3-1`, not an automatic ticket rewrite
    - if the original bug claim is no longer reproducible but the intended invariant is still worth proving, it is valid to convert the ticket into a proof/regression-only implementation after user confirmation rather than forcing speculative runtime code changes or closing it as not actionable
    - if a ticket names a suspected buggy module but the live audit shows that surface already satisfies the intended invariant, it is valid to complete the ticket as an audit-plus-proof implementation with tests only and an explicit no-runtime-change outcome after user confirmation
    - if the implementation is valid but one specific acceptance claim no longer has a verified reproducer, it is valid to preserve the working feature and correct the ticket to the strongest evidenced acceptance boundary after `1-3-1` rather than treating the whole ticket as failed
17. If the ticket is accurate and no blocking decision remains, proceed.

## Implementation Rules

- Implement every explicit ticket deliverable. Do not silently skip items.
- Prefer minimal, architecture-consistent changes over local patches.
- For profiling, audit, benchmark, or investigation tickets, a complete implementation may legitimately end in "do not change runtime code" when the measured result closes the proposed follow-up as not actionable. In those cases, still complete every owned repository deliverable: update the ticket outcome, archive or amend the deciding spec/report when required, and reconcile dependent ticket statuses.
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
- If a ticket proposes an internal storage optimization that would otherwise change canonical outward state or serialized shape, prefer a runtime-only storage layer behind the existing outward contract unless the ticket explicitly owns that state-boundary migration too.
- If Foundations require serialized/artifact-facing identifiers to remain canonical strings, but the ticket still needs numeric or otherwise changed identifier semantics in implementation code, introduce a separate runtime-only branded identifier type rather than redefining the artifact-facing domain id in place.
- For additive compiled-field migrations, it can be valid to require the new field in compiler-owned artifacts and schemas while temporarily leaving handwritten in-memory TypeScript fixtures optional, so long as that distinction is explicit, Foundation-compliant, and verified.
- The ticket's `Files to Touch` list is a strong hint, not a hard limit. If coherent completion requires adjacent files for contracts, runtime consumers, schemas, fixtures, or tests, include them and explain why.
- If sibling tickets in the same active series contain stale assumptions that are informative but non-blocking for the current ticket, note the drift in your working notes and final summary without absorbing that sibling's scope unless ownership or correctness actually conflicts.
- For schema or contract migrations, explicitly check whether the change needs updates across:
  - authored schema/doc types
  - authored source-shape or parser-facing doc types when the ticket adds a new authored config key, section field, or surface family, even if the ticket only names the lowering or validator files
  - authored-shape validators and unknown-key allowlists
  - compiled/kernel/runtime types
  - Zod or JSON schemas
  - when a compiled DSL or AST field widens, both the schema-definition source file and any generated schema artifacts that encode that shape
  - when an earlier ticket has already made a field required, any empty or default placeholders needed across constructors, defaults, fixtures, or goldens for atomicity, without assuming that semantic ownership of later population work moved into the current ticket
  - diagnostics or debug snapshots
  - exported provider interfaces and adapter wrappers that mirror shared runtime helpers or services
  - when a ticket adds an injected callback or service at a top-level orchestration file, the lower provider/runtime factory layers where that dependency is actually constructed and threaded
  - fixtures, goldens, and tests
  - manually constructed shared runtime/test fixtures such as `GameDefRuntime` or other kernel context objects
  - if a new UI/store/model context field exists mainly to support one feature path, consider whether it should stay optional on local test-helper contracts to avoid unnecessary fixture churn, so long as production code still supplies it explicitly and the distinction is verified
- When one ticket stage selects or returns a plain domain object but the next stage can only execute a wrapped, trusted, or otherwise validated form of that object, treat that conversion boundary as an explicit contract check and resolve ownership with `1-3-1` before coding rather than silently shifting the contract.
- When a ticket introduces callback-driven recursive evaluation on a derived state, explicitly verify that the inner pass resolves actor or seat identity and sources RNG from the derived state itself rather than reusing outer-evaluation assumptions.
- When tightening authored `chooseN` minimums or other decision cardinality constraints:
  - check whether runtime `max` can drop below the new minimum because of resources, grants, action class, or other state-dependent caps
  - if `max < min` can occur, update legality or cost-validation in the same change so the move becomes cleanly illegal instead of failing at runtime
- If the ticket names files to verify or inspect rather than definitely modify:
  - read and assess them as part of the implementation boundary
  - leave them unchanged when evidence shows no edit is required
  - state that explicit no-change decision in the final summary
- If a ticket names an authored data or config file as an optional explicit-surface tweak, verify whether existing compiled defaults already satisfy the contract before editing that file; when they do, skip the data edit and call out the no-change decision explicitly in the final summary.
- For proof/regression tickets, prefer extending the live test module that already owns the contract under audit before creating new files solely to match stale ticket test paths.
- If a ticket's cited production examples, cards, scenarios, or seeds are stale but the contract under audit is still valid, prefer a current deterministic reproducer or a synthetic proof fixture over forcing the obsolete example back into service.
- For production-proof tickets that must validate behavior on live authored data, it is valid to run a bounded seed, turn, or trace scan to discover a current deterministic reproducer, then encode that discovered reproduction directly into the owned integration tests.
- If the ticket says "no code changes", interpret that as "no production/runtime behavior changes" unless the ticket explicitly forbids repo artifact edits. Ticket/spec outcome sections, archival moves, dependency rewrites, and sibling-ticket status updates are still required when they are the owned deliverable.
- If a diagnostic or audit ticket requires written findings but does not name a specific file, prefer an existing repo-owned report surface such as `reports/` over ephemeral local notes or ad hoc scratch files, and reference that report in the final summary.
- If reassessment reveals a generic architectural limitation broader than the current ticket's owned boundary, prefer creating or extending a follow-up spec in the same turn instead of burying the design gap in ticket-only notes.
- When a migration adds or removes a required compiled field, treat owned production goldens that snapshot compiled catalogs, summaries, or traces as expected update surfaces unless evidence shows unexpected behavioral drift.
- When earlier groundwork introduced a required placeholder field and the current ticket begins populating it with real compiled data, expect owned production goldens to drift from empty maps or stubs to populated values, and treat that as normal ticket-owned fallout unless evidence shows unrelated behavioral change.
- When a change alters observability, preview readiness, scoring inputs, or other behavior that can legitimately change deterministic move choice, treat owned production goldens and fixed-seed summaries as expected update surfaces unless evidence shows unexpected drift outside the ticket boundary.
- When a nearby golden or artifact looks like an expected drift surface because of prior groundwork, it is still valid to probe it explicitly and conclude "no ticket-owned diff" if the live compilation path already sources the populated data elsewhere.
- When enriching diagnostics or trace output, prefer preserving the existing coarse summary field and adding an optional detail field unless the ticket explicitly owns a breaking schema redesign.
- Preparatory tickets may legitimately add optional schema, trace, or contract fields ahead of the later logic tickets that will populate them, so long as the ticket explicitly owns that groundwork boundary and verification proves the artifact surfaces remain in sync.
- When a completed gate ticket proves downstream active tickets are not actionable, update those sibling tickets in the same turn so their status, deps, and scope text no longer advertise invalid work. Do not leave the series in a partially-invalid staged state.
- When a new follow-up spec changes the framing around an adjacent active spec without invalidating that spec's core scope, prefer a small relationship or cross-reference update over rewriting the adjacent spec's problem statement.

## Verification

Before claiming completion:

1. Run the most relevant tests for the touched area.
2. Run any required typecheck, lint, or artifact-generation command needed to validate the deliverable.
3. If a full repo-wide command is too expensive, explain what was run and what remains unverified.
4. Report unrelated pre-existing failures separately from failures caused by your changes.
5. Confirm whether the package's test commands execute source files directly or built `dist` output:
   - if tests depend on `dist`, run `typecheck` first and rebuild before trusting targeted test results
   - if a focused `dist` check fails with module-resolution, missing-file, or obviously stale-artifact symptoms before the owning build has fully completed, treat that as a likely ordering or freshness problem first and rerun after the serialized build finishes
   - if the change affects generated artifacts or schemas, regenerate or validate them explicitly
   - do not run verification commands in parallel when they read from or rewrite the same generated output tree such as `dist/`
6. Prefer the narrowest commands that validate the real changed code path, not stale build output.
   - for documentation-only follow-up tickets whose examples depend on behavior already verified by an archived or completed prerequisite ticket, direct artifact inspection plus dependency-integrity checks may be sufficient unless the doc change itself introduces a new executable artifact
   - when a ticket changes a fallback compilation or runtime path, verify that fallback-owned path directly and also check the primary production path for non-regression, because the main path may bypass the changed code entirely
7. If broader failing checks remain:
   - determine whether they are inside the corrected ticket boundary or are owned by another active ticket
   - if they are outside the corrected boundary and already covered by an active ticket, do not silently absorb that scope
   - document the failure as residual risk or deferred verification and name the owning active ticket(s)
   - if no active ticket owns the remaining failure, stop and resolve the boundary with the user
8. If focused checks pass but a broader suite fails:
   - inspect shared test helpers, fixtures, and goldens for assumptions that the focused tests did not exercise
   - do not assume the failure is a product regression until helper-level assumptions are ruled out
   - if the change affects observability, scoring, or move selection, explicitly check whether seed-specific helper states or turn-position fixtures have gone stale
   - when a seeded helper no longer reaches the intended semantic state, retarget it to a current deterministic seed or turn that still exercises the same invariant rather than weakening the assertion
   - when a compiled fast path is added in front of an interpreter, explicitly test malformed and unsupported shapes to confirm the compiler falls back cleanly instead of swallowing existing validator or runtime-boundary behavior
   - when a new runtime fast path depends on enriched context objects, caches, or prebuilt runtime indexes, explicitly check callers that still construct minimal or partial runtime contexts so the fast path falls back cleanly instead of breaking helper-built tests
   - if a primarily test-only ticket includes a vague non-functional regression clause such as "no performance regression" but does not name an owned benchmark surface, baseline artifact, threshold, or command, do not invent an ad hoc harness by default; either resolve the clause with `1-3-1` or satisfy it through the nearest existing regression suite the repo already treats as authoritative
9. If `node --test` or another runner reports only a top-level file failure:
   - rerun the failing file as narrowly as possible
   - use test-name filtering or direct helper reproduction when needed to isolate the failing assertion before editing code
   - if Node still collapses nested suite failures, run the built test module directly to expose nested subtest output before changing code
10. If acceptance depends on a generated artifact such as a trace, golden, schema, or report:
   - confirm the command that produces it has actually exited before diagnosing the artifact contents
   - confirm the artifact path matches the command's real write target
   - check a freshness signal such as timestamp or file size before treating missing fields or stale output as a real discrepancy
   - when a touched source file contributes to exported engine contracts or introspected schema surfaces, expect that a generator-backed artifact check may still be required even if the ticket did not name a generated file explicitly
   - when a shared generator rewrites multiple artifacts, identify which generated files actually encode the changed contract and summarize those ticket-owned artifacts specifically in the final response
   - if regeneration was required but leaves no persisted diff, still state explicitly in the final summary that the generator-backed contract surface was checked and remained in sync
   - only then compare the artifact against the ticket's acceptance criteria
11. For profiling, benchmark, or audit tickets that set a decision gate:
   - capture the exact command, measured surface, and threshold comparison used to make the decision
   - confirm whether the result crossed the ticket's action threshold
   - if it did not, treat closure of the proposed follow-up work as part of verification
   - if the ticket owns an attribution table or measurement summary, record it in the ticket outcome rather than only in the final chat response

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

Optional generated-artifact freshness check:
- producing command has exited
- artifact path matches the producing command's write target
- artifact timestamp or size changed as expected
- inspect contents only after freshness is confirmed

Optional measured-gate outcome template:
- measured surface: what was profiled, benchmarked, or audited
- command(s): exact producing command(s)
- decisive result: the metric or attribution table that matters
- threshold comparison: why the result did or did not cross the ticket gate
- downstream action: which spec, ticket, or report was archived, amended, deferred, or marked not actionable

Optional seed-state discovery for behavior-driven game tests:
- confirm the old seeded scenario no longer reaches the intended semantic state
- search a bounded seed and turn window for a current deterministic reproduction
- preserve the original invariant and update only the helper state or seed
- rename helper functions or comments so they describe the new reproduction accurately

## Follow-Up

After implementation and verification:

1. Summarize what changed, what was verified, and any residual risk.
   - if you audited schema, artifact, or generated-surface ripple effects and concluded none were needed, state that explicitly for runtime-only tickets
   - if any verification was intentionally deferred because an adjacent active ticket owns that scope, state that explicitly
   - if a user-confirmed `1-3-1` design resolution materially affected the implementation, include a short resolved-decision note
   - if the main resolved decision was preserving Foundation type discipline over a raw ticket or spec example, say so explicitly
   - if local rulebook extracts or rules reports were necessary to justify a game-specific legality correction, include a short rules-evidence note
2. If the ticket appears complete, offer to archive it per `docs/archival-workflow.md`.
3. If the user wants archival or a concrete follow-up review, hand off to `post-ticket-review`.
4. If this implementation materially superseded semantics recorded in a recently archived sibling ticket, call that out in the handoff so archival review can amend or clarify the archive trail.

Optional series consistency pass after a ticket rewrite:
- inspect sibling active tickets in the same series for overlap or stale staged ownership
- update statuses, deps, and scope text so the active series remains internally coherent
- run `pnpm run check:ticket-deps` when the repo provides it

Optional series consistency pass after a completed gate ticket:
- inspect downstream sibling tickets whose premise depended on the measured result
- mark them completed, deferred, or not implemented when the gate outcome settles their status
- update deps if the deciding spec/report was archived
- run `pnpm run check:ticket-deps` when the repo provides it

## Codex Adaptation Notes

- This skill replaces Claude-specific invocation arguments with normal Codex conversation context.
- Do not rely on Claude-only skills or slash-command behavior.
- Execute the implementation directly once the ticket is verified and no blocking discrepancy remains.
- When inspecting markdown from the shell, avoid unescaped backticks in search patterns; prefer plain-string anchors or direct file reads for markdown sections that include inline code.
- When checking touched-file scope or summarizing the final diff, remember that untracked new files may not appear in `git diff --name-only`; include them explicitly instead of relying only on tracked-file diffs.

## Example Prompts

- `Implement tickets/LEGACTTOO-009.md`
- `Implement the ticket at .claude/worktrees/feature-a/tickets/FOO-003.md`
- `Implement tickets/FITLSEC7RULGAP-001*. Read dependent specs first and stop if the ticket is stale.`
