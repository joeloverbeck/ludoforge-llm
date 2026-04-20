---
name: spec-to-tickets
description: Break a spec into actionable, detailed tickets aligned with FOUNDATIONS.md. Use when asked to decompose a spec into tickets.
---

# Spec to Tickets

Break a numbered spec into a series of small, actionable implementation tickets.

## Invocation

```
/spec-to-tickets <spec-path> <NAMESPACE>
```

**Arguments** (both required, positional):
- `<spec-path>` — path to the spec file (e.g., `specs/99-event-card-policy-surface.md`)
- `<NAMESPACE>` — ticket namespace prefix (e.g., `99EVECARPOLSUR`)

If either argument is missing, ask the user to provide it before proceeding.

## Worktree Awareness

If working inside a worktree (e.g., `.claude/worktrees/<name>/`), **all file paths in this skill** — reads, writes, globs, greps — must be prefixed with the worktree root. The default working directory is the main repo root; paths without an explicit worktree prefix will silently operate on main, not the worktree. This applies to every path reference below — `tickets/`, `docs/`, spec paths, and output files.

## Process

Follow these steps in order. Do not skip any step.

### Step 1: Mandatory Reads

Read ALL of these files before any analysis:

1. **The spec file** (from argument 1) — read the entire file. For XL specs exceeding Read's token limit (~25000 tokens, commonly >~900 lines), consume the full content via paginated reads (`offset`/`limit`) — do not substitute a summary. If the spec was just consumed by `/reassess-spec` in the current session, the Session context reuse note below covers this — no re-read needed.
2. **`tickets/_TEMPLATE.md`** — the canonical ticket structure; every ticket you produce must follow this template exactly
3. **`tickets/README.md`** — the ticket authoring contract; understand the required sections and checks
4. **`docs/FOUNDATIONS.md`** — architectural commandments; every ticket must align with these principles

**Session context reuse**: If a file is already in conversation context from earlier in the same session (e.g., FOUNDATIONS.md loaded by a prior skill, the spec file just written by `/reassess-spec`), skip the redundant read — context freshness, not tool re-invocation, is the requirement.

### Step 2: Codebase Validation

Before decomposing, validate the spec's assumptions against the actual codebase:

If the spec was reassessed in this same session (e.g., via `/reassess-spec`), the full codebase validation from that skill satisfies this step. Perform only the namespace collision check and dependency path resolution below. Skip re-validating file paths, types, and functions that were already confirmed.

- **Validate** that file paths mentioned in the spec exist in the codebase (use Grep, Glob, or bash equivalents as available).
- **Grep** for types, functions, and modules the spec references — confirm they are real and current
- **Glob** for `tickets/<NAMESPACE>-*.md` — if any files with this namespace already exist, warn the user and ask whether to overwrite, continue numbering from the next available number, or abort
- **Dependency path resolution** (this sub-step only): For each spec dependency listed in the target spec's **Dependencies** field, verify whether it lives in `specs/` or `archive/specs/` and record the correct path for use in ticket Deps fields. If the Dependencies field indicates no dependencies (e.g., `None`, `None (...)`, or equivalent), skip this sub-step — the other validation sub-steps (file paths, types, namespace collision) still apply
- **Flag** any stale assumptions, missing files, or renamed entities
- If you find discrepancies, present them to the user before proceeding

### Step 3: Decompose the Spec

Analyze the spec and identify discrete work units. If the spec includes a Ticket Decomposition Guidance section (or equivalent), use it as the starting point for decomposition. Validate that the spec's suggested breakdown produces reviewable diffs and has correct dependency ordering, but do not ignore it in favor of a from-scratch decomposition. If the spec has no Decomposition Guidance section (common for scope-collapsed specs from `/reassess-spec`, where the reframe typically replaces earlier decomposition hints), use the Design (D*) and Testing Strategy (T*) sections as the primary decomposition anchors — each design section typically maps to one ticket, and each test attaches to the ticket introducing its subject.

- Each ticket must represent a **reviewable diff** — small enough for comfortable manual review
- **Foundation 14 exception**: For type replacement or interface change tickets required to be atomic by Foundation 14 (No Backwards Compatibility), a Large effort rating is acceptable even when the diff exceeds normal review size, provided the change is mechanically uniform (e.g., replacing a branded type across all consumers). Note the mechanical uniformity in the ticket's Architecture Check to explain why the large diff is still reviewable.
- **Multi-ticket atomic cuts**: When a Foundation 14 atomic cut spans behavioral changes that live in different tickets (e.g., classifier API change in ticket A, intermediate admission-contract infrastructure in ticket B, dependent agent fallback + throw deletion in ticket C), the FULL deletion — all source *and* test references to the deprecated symbols across every consumer — lands in the EARLIEST ticket where the deprecated API surface is removed. Downstream tickets handle dependent behavioral changes (new fallback paths, test additions that assert the new contract) without re-citing the deleted symbols. Splitting the deletion across the chain creates a transitional period where source and tests disagree, breaking the build. The earliest ticket's effort rating may exceed Large and should be labeled accordingly; the mechanical-uniformity rationale in the Architecture Check doubles as the decomposition justification. Flag the resulting transitional state in the PR/commit description: downstream tickets' new invariants (e.g., global no-throw properties, performance gates, conformance tests) won't pass until the full chain lands, and pre-existing corpus failures may persist until the final ticket — this is expected under an atomic-cut sequence, not a regression.
- Map **dependencies** between tickets (which must be done before which). Distinguish hard dependencies (ticket B cannot be implemented without ticket A's code) from value dependencies (ticket A increases the benefit of ticket B but B is independently implementable). Only hard dependencies go in the `Deps` field. Note value dependencies in the Step 4 parallelism notes if relevant.
- Determine **priority ordering** (what to implement first)
- Ensure **every spec deliverable is covered** — no silent skipping. If a deliverable seems wrong or unnecessary, flag it to the user using the 1-3-1 rule instead of omitting it
- Consider natural boundaries: type changes, new modules, test suites, integration points. For non-engine work (campaign scripts, tooling, data files), natural boundaries include: per-file, per-feature-within-file, or per-target-system (e.g., one runner at a time)
- **Port-ticket pattern**: If the spec targets N structurally-similar files with identical changes (e.g., ARVN + VC tournament runners), consider an "implement + port" pattern: one full-detail ticket for the first implementation, then lightweight "port" tickets for siblings that reference the source ticket and list only the target file paths and any differences (seat names, config values, etc.)
- **Grouping pattern**: When multiple spec deliverables share significant consumer overlap (same files affected) and follow the same implementation pattern, consider grouping them into a single ticket. Note the grouping rationale in the ticket's Problem section. This avoids artificial ticket boundaries that split naturally cohesive changes.
- **Lane-sharding pattern**: For corpus-wide migrations touching hundreds of files across distinct subdirectories or test lanes (e.g., classifying every test under `packages/engine/test/**`, applying a marker pattern across every campaign runner), shard tickets by lane boundary — one ticket per lane or lane-group. Each shard is a reviewable diff even when the aggregate is huge, because the scope per ticket is bounded by the lane's own file set. Pair with Foundation 14's mechanical-uniformity exception when the per-file change is a repeated pattern (e.g., single-line header addition). Distinct from Grouping (which merges related deliverables) and from Port-ticket (which uses an implement+port reference model) — lane-sharding decomposes one deliverable across disjoint corpus slices.
- **Cross-cutting refactoring pattern**: For specs that modify function signatures or types across a call chain (e.g., threading a new parameter through 10+ files), separate signature plumbing (changing parameter types and call sites) into a dedicated ticket that all conversion tickets depend on. This enables parallel conversion of function bodies once the call-chain contract is established. Without this separation, conversion tickets have hidden dependencies on each other through shared call chains.
- **Spec-level dependencies**: Dependencies from the spec's Dependencies field go in the Deps field of the earliest ticket(s) that directly implement the dependency's deliverables. Downstream tickets depend transitively through the ticket chain — do not duplicate spec dependencies in every ticket. **Archived-and-completed dependencies**: If a spec-level dependency is archived AND its Status field reads as completed (confirmed via reassessment), treat it as a contract reference rather than an implementation prerequisite — do not cite it in ticket Deps. Root tickets in this case cite the current spec file instead, per the Root tickets guidance in Step 5.
- **Gate tickets**: For specs with profiling gates or conditional phases, create explicit gate tickets. Downstream tickets that depend on the gate's outcome use a plain backtick-quoted path in their Deps field (e.g., `` `tickets/FOO-003.md` ``) — do NOT append annotations like `(gate — close if profiling fails)` inside Deps, as `check:ticket-deps` only accepts pure file paths. Instead, note the gate condition in the downstream ticket's Problem or What to Change section: "**Gate condition**: Close this ticket if `tickets/FOO-003.md` profiling shows no measurable improvement." In the Step 7 dependency graph, annotate gate edges to distinguish them from hard dependencies (e.g., `003 (gate) → 004`)
- **Ticket count vs. Complexity rating**: Ticket count is a function of natural boundaries (subsystems touched, reviewable diff size), not the spec's `Complexity` metadata field. A Small-complexity spec can still produce 5+ tickets when it spans multiple subsystems (e.g., test infrastructure + CI workflow + docs + annotation scripting); a Large-complexity spec can produce 2–3 when the changes are deep within one module. Use `Complexity` as a rough sanity check ("Large spec producing 2 tickets may be under-decomposed; Small spec producing 10 tickets may be over-decomposed"), not a hard count target. If you would over-split on a naive Complexity-proportional rule, defer to natural boundaries.
- **Explicitly-optional spec deliverables**: When the spec itself marks a deliverable "Optional" or equivalent (e.g., "(Optional) Rename …"), still ticket it — but at LOW priority with an explicit "descope path" note in the Out of Scope section describing the close condition (e.g., "close this ticket with 'Declined — <rationale>' in Outcome if the user decides the change is not worth the diff during review"). This honors the ticket-fidelity constraint (never silently skip a spec deliverable) while preserving the spec's optional signal for downstream `/implement-ticket` or reviewer decisions. Only downstream tickets that have no dependency on the optional deliverable can remain unaffected if it is descoped; note that separation in the descope path.
- **Mapping spec investigations (I*) and tests (T*)**: Investigations that produce a checked-in fixture or measurement go in the earliest ticket that consumes the fixture or whose implementation the measurement gates. Investigations that *verify* an invariant (e.g., consumer inventory, blast-radius sanity check) go in the ticket introducing the behavior being verified. Tests (T*) attach to the ticket that introduces the code under test — if a test exercises behavior spanning two tickets, it attaches to the latter (the ticket that completes the behavior). Replay-identity tests that compare pre-spec vs. post-spec behavior attach to the ticket introducing the new behavior plus a test-only flag that preserves the pre-spec path, not to the ticket that later deletes the pre-spec path (otherwise the replay-identity test has no counterpart to compare against). **Spec-bundled test suite exception**: When the spec's own decomposition explicitly bundles all T-series tests into a single test-migration ticket (e.g., "Ticket N — Test suite regeneration (T0 migration + T1–T15 new tests)"), defer to that bundling — the "do not ignore the spec's suggested breakdown" rule takes precedence over the default T-attachment rule above. In each implementation ticket's Out of Scope section, note the attachment rationale (e.g., "T1/T3 authored in ticket NNN per spec's explicit test-bundling") so the reviewer does not expect tests inline.
- **Codebase-read depth during decomposition and writing**: Step 2's skip-list ("skip re-validating file paths, types, and functions already confirmed by a prior reassessment") applies to re-validating *already-confirmed claims*, not to *gathering implementation detail*. Reading source files during Step 3 (to confirm natural boundaries and dependency ordering) and during Step 5 (to populate accurate "What to Change" references — exact function shapes, config layouts, line-level anchors, workflow trigger paths) remains allowed and often necessary. Vague "What to Change" sections force `/implement-ticket` to rediscover structure already visible at decomposition time; depth-of-read at ticket-authoring time pays forward into cleaner implementation sessions.

### Step 4: Present Summary for Approval

**Before writing any ticket files**, present a numbered summary table:

```
| # | Ticket ID | Title | Effort | Deps |
|---|-----------|-------|--------|------|
| 1 | <NS>-001  | ...   | Small  | None |
| 2 | <NS>-002  | ...   | Medium | 001  |
| ...
```

Include a 1-line scope description for each ticket as bullet text below the table. Deps in the summary table are abbreviated for readability (e.g., `001`, `None`). Ticket files use full backtick-quoted paths.

If multiple tickets can be implemented in parallel, list parallelism groups as numbered waves below the summary table: `**Wave N**: tickets X, Y, Z (after <deps>)`. This helps the user plan implementation sessions. Example: "**Wave 1**: 001, 002, 005 (all independent). **Wave 2**: 003, 004 (after 001); 006 (after 005). **Wave 3**: 007 (after all)."

**Wait for user approval or adjustments.** Do not write files until the user confirms. **In auto mode**: present the summary and proceed to Step 5 in the same response without waiting — ticket writes are reversible, and auto mode explicitly prefers action over interruption. The user can redirect in a later turn if the decomposition needs adjusting. Retain the wait-gate when auto mode is inactive.

### Step 5: Write Ticket Files

For each approved ticket, write a file to `tickets/<NAMESPACE>-<NNN>.md` using the **exact structure** from `tickets/_TEMPLATE.md`. Write all ticket files in parallel — each is an independent file create on a disjoint path with no shared state. Use multiple Write tool calls in a single message rather than sequential messages. Sequential writes cost noticeable wall-clock time on decompositions of 5+ tickets.

Every ticket MUST include:

- **Status**: PENDING
- **Priority**: HIGH / MEDIUM / LOW (based on dependency order and criticality)
- **Effort**: Small / Medium / Large, with the following rough calibration (heuristics, not hard thresholds):
  - **Small**: <3 files modified, <80 LoC net, no new test-file creation OR a single mechanical refactor.
  - **Medium**: 3–8 files modified OR introduces 1–2 new test files, <250 LoC net.
  - **Large**: >8 files modified OR >250 LoC net OR a Foundation 14 atomic cut spanning the full deletion blast radius. Foundation 14 atomic cuts that are mechanically uniform remain acceptable as Large regardless of LoC count (per the existing Foundation 14 exception bullet in Step 3). **Spec-bundled coherent work unit exception**: Large is also acceptable when the spec explicitly bundles a coherent body of work into a single ticket (e.g., a test suite authored as one reviewable unit, or a documentation sweep touching many files) even when the per-file changes are *not* mechanically uniform. The spec author's bundling decision is itself the architectural signal — cite the spec section that justified the bundling in the ticket's Architecture Check.
- **Engine Changes**: None or list of affected areas
- **Deps**: Backtick-quoted relative file paths to other tickets or specs. Single dep: `` `tickets/FOO-001.md` ``. Multiple deps: comma-separated on one line, each path backtick-quoted — e.g., `` `tickets/FOO-001.md`, `tickets/FOO-002.md`, `specs/42-foo.md` ``. Valid path roots are `tickets/`, `archive/tickets/`, `specs/`, and `archive/specs/`. The `check:ticket-deps` script validates these paths exist; prose descriptions fail validation. **Root tickets** (no upstream ticket dependency): prefer citing the spec file path (e.g., `` `specs/133-foo.md` ``) over literal `None` — this gives `check:ticket-deps` a validated traceability link. `None` is accepted but weaker; use it only when no spec or upstream ticket applies.
- **Problem**: What user-facing or architecture problem this solves
- **Assumption Reassessment**: Assumptions validated against current code (use today's date)
- **Architecture Check**: Why this approach is clean, how it preserves agnostic boundaries
- **What to Change**: Numbered sections with specific implementation details
- **Files to Touch**: Exact paths validated against the codebase (new or modify)
- **Out of Scope**: Explicit non-goals — what this ticket must NOT change
- **Acceptance Criteria**:
  - **Tests That Must Pass**: Specific behavior tests
  - **Invariants**: Must-always-hold architectural and data contract invariants
  - For refactoring specs, it is expected that multiple tickets share the same core acceptance criteria (existing tests pass, determinism preserved). This is not a sign of duplicate work — it reflects the refactoring invariant that behavior must be unchanged after each ticket.
- **Test Plan**:
  - **New/Modified Tests**: Paths with rationale. For campaign scripts or tooling without a formal test harness, manual verification commands with expected output are acceptable
  - **Commands**: Targeted test commands and full suite verification

### Step 6: Validate Ticket Dependencies

Run `pnpm run check:ticket-deps` to validate all ticket `Deps` paths. If validation fails, fix the offending `Deps` fields before proceeding.

### Step 7: Final Summary

After writing all files, list:
- All ticket files created
- The dependency graph (which tickets block which)
- Suggested implementation order
- Reminder: use `/implement-ticket tickets/<NAMESPACE>-<NNN>.md` to implement each ticket
- **Post-write diagnostic handling**: If editor diagnostics surface in files *outside* your written tickets' `Files to Touch` lists (common after the parallel Write phase in Step 5 — typecheckers re-index the workspace and flag orphan artifacts from prior work), treat them as pre-existing branch state. Call them out in the final summary with a one-liner (e.g., "Pre-existing diagnostics in X, Y, Z — orphan artifacts from prior work, not introduced by this decomposition"). Do NOT modify those files — they are out of scope for ticket authoring, and silent cleanup would violate the "Leave files for user review" guardrail below. If the user wants them addressed, they can request a follow-up cleanup ticket or resolve them during `/implement-ticket` sessions for the tickets that naturally absorb them (e.g., a ticket whose `Files to Touch` intersects the orphan set).

Do NOT commit. Leave files for user review.

### Step 8: Spec Back-Link

If the spec does not already have a section listing the actual generated ticket IDs (as distinct from a decomposition *guidance* section with suggested prefixes), offer to append or update one with the generated ticket IDs and their titles. This aids traceability when multiple specs are active. If the user declines, skip. This may be combined with the Step 7 message for efficiency. **In auto mode**: append the back-link proactively in the same response rather than waiting for confirmation — an additive `## Tickets` section is reversible, and auto mode explicitly prefers action over interruption.

## Constraints

- **FOUNDATIONS alignment**: Every ticket must respect the principles in `docs/FOUNDATIONS.md` (engine agnosticism, evolution-first, visual separation, etc.)
- **Template fidelity**: Every ticket must use the `tickets/_TEMPLATE.md` structure exactly — no ad-hoc sections or missing required fields
- **Ticket fidelity**: Never silently skip a spec deliverable. If something seems wrong, use the 1-3-1 rule (1 problem, 3 options, 1 recommendation) and ask the user
- **Codebase truth**: File paths and type references in tickets must be validated against the actual codebase, not assumed from the spec
- **Reviewable size**: Each ticket should be small enough to review as a single diff. When in doubt, split further
- **Explicit dependencies**: Use the `Deps` field to declare inter-ticket dependencies; never leave implicit ordering
- **Downstream workflow**: Tickets produced by this skill are designed to be implemented via `/implement-ticket tickets/<NAMESPACE>-<NNN>.md`. Ensure ticket structure and detail level support that workflow
