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

1. **The spec file** (from argument 1) — read the entire file
2. **`tickets/_TEMPLATE.md`** — the canonical ticket structure; every ticket you produce must follow this template exactly
3. **`tickets/README.md`** — the ticket authoring contract; understand the required sections and checks
4. **`docs/FOUNDATIONS.md`** — architectural commandments; every ticket must align with these principles

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

Analyze the spec and identify discrete work units. If the spec includes a Ticket Decomposition Guidance section (or equivalent), use it as the starting point for decomposition. Validate that the spec's suggested breakdown produces reviewable diffs and has correct dependency ordering, but do not ignore it in favor of a from-scratch decomposition.

- Each ticket must represent a **reviewable diff** — small enough for comfortable manual review
- **Foundation 14 exception**: For type replacement or interface change tickets required to be atomic by Foundation 14 (No Backwards Compatibility), a Large effort rating is acceptable even when the diff exceeds normal review size, provided the change is mechanically uniform (e.g., replacing a branded type across all consumers). Note the mechanical uniformity in the ticket's Architecture Check to explain why the large diff is still reviewable.
- Map **dependencies** between tickets (which must be done before which). Distinguish hard dependencies (ticket B cannot be implemented without ticket A's code) from value dependencies (ticket A increases the benefit of ticket B but B is independently implementable). Only hard dependencies go in the `Deps` field. Note value dependencies in the Step 4 parallelism notes if relevant.
- Determine **priority ordering** (what to implement first)
- Ensure **every spec deliverable is covered** — no silent skipping. If a deliverable seems wrong or unnecessary, flag it to the user using the 1-3-1 rule instead of omitting it
- Consider natural boundaries: type changes, new modules, test suites, integration points. For non-engine work (campaign scripts, tooling, data files), natural boundaries include: per-file, per-feature-within-file, or per-target-system (e.g., one runner at a time)
- **Port-ticket pattern**: If the spec targets N structurally-similar files with identical changes (e.g., ARVN + VC tournament runners), consider an "implement + port" pattern: one full-detail ticket for the first implementation, then lightweight "port" tickets for siblings that reference the source ticket and list only the target file paths and any differences (seat names, config values, etc.)
- **Grouping pattern**: When multiple spec deliverables share significant consumer overlap (same files affected) and follow the same implementation pattern, consider grouping them into a single ticket. Note the grouping rationale in the ticket's Problem section. This avoids artificial ticket boundaries that split naturally cohesive changes.
- **Cross-cutting refactoring pattern**: For specs that modify function signatures or types across a call chain (e.g., threading a new parameter through 10+ files), separate signature plumbing (changing parameter types and call sites) into a dedicated ticket that all conversion tickets depend on. This enables parallel conversion of function bodies once the call-chain contract is established. Without this separation, conversion tickets have hidden dependencies on each other through shared call chains.
- **Spec-level dependencies**: Dependencies from the spec's Dependencies field go in the Deps field of the earliest ticket(s) that directly implement the dependency's deliverables. Downstream tickets depend transitively through the ticket chain — do not duplicate spec dependencies in every ticket
- **Gate tickets**: For specs with profiling gates or conditional phases, create explicit gate tickets. Downstream tickets that depend on the gate's outcome use a plain backtick-quoted path in their Deps field (e.g., `` `tickets/FOO-003.md` ``) — do NOT append annotations like `(gate — close if profiling fails)` inside Deps, as `check:ticket-deps` only accepts pure file paths. Instead, note the gate condition in the downstream ticket's Problem or What to Change section: "**Gate condition**: Close this ticket if `tickets/FOO-003.md` profiling shows no measurable improvement." In the Step 7 dependency graph, annotate gate edges to distinguish them from hard dependencies (e.g., `003 (gate) → 004`)

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

**Wait for user approval or adjustments.** Do not write files until the user confirms.

### Step 5: Write Ticket Files

For each approved ticket, write a file to `tickets/<NAMESPACE>-<NNN>.md` using the **exact structure** from `tickets/_TEMPLATE.md`. Write all ticket files in parallel when possible — they are independent file creates.

Every ticket MUST include:

- **Status**: PENDING
- **Priority**: HIGH / MEDIUM / LOW (based on dependency order and criticality)
- **Effort**: Small / Medium / Large
- **Engine Changes**: None or list of affected areas
- **Deps**: Backtick-quoted relative file paths to other tickets or specs (e.g., `` `tickets/FOO-001.md` ``, `` `specs/42-foo.md` ``, `` `archive/specs/40-bar.md` ``). The `check:ticket-deps` script validates these paths exist. Prose descriptions will fail validation.
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

Do NOT commit. Leave files for user review.

### Step 8: Spec Back-Link

If the spec does not already have a section listing the actual generated ticket IDs (as distinct from a decomposition *guidance* section with suggested prefixes), offer to append or update one with the generated ticket IDs and their titles. This aids traceability when multiple specs are active. If the user declines, skip. This may be combined with the Step 7 message for efficiency.

## Constraints

- **FOUNDATIONS alignment**: Every ticket must respect the principles in `docs/FOUNDATIONS.md` (engine agnosticism, evolution-first, visual separation, etc.)
- **Template fidelity**: Every ticket must use the `tickets/_TEMPLATE.md` structure exactly — no ad-hoc sections or missing required fields
- **Ticket fidelity**: Never silently skip a spec deliverable. If something seems wrong, use the 1-3-1 rule (1 problem, 3 options, 1 recommendation) and ask the user
- **Codebase truth**: File paths and type references in tickets must be validated against the actual codebase, not assumed from the spec
- **Reviewable size**: Each ticket should be small enough to review as a single diff. When in doubt, split further
- **Explicit dependencies**: Use the `Deps` field to declare inter-ticket dependencies; never leave implicit ordering
- **Downstream workflow**: Tickets produced by this skill are designed to be implemented via `/implement-ticket tickets/<NAMESPACE>-<NNN>.md`. Ensure ticket structure and detail level support that workflow
