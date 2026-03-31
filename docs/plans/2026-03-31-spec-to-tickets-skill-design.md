# Design: `spec-to-tickets` Skill

**Date**: 2026-03-31
**Status**: Approved

## Context

When breaking a spec into tickets, we always follow the same process: read the spec, read FOUNDATIONS.md, read the ticket template and authoring contract, then produce a series of small, actionable tickets in `tickets/`. This is currently done by copy-pasting a long prompt. Formalizing it as a skill eliminates the copy-paste and ensures consistency.

## Skill Definition

- **Path**: `.claude/skills/spec-to-tickets/SKILL.md`
- **Invocation**: `/spec-to-tickets <spec-path> <NAMESPACE>`
- **Arguments**: Both positional, both required
  - `<spec-path>`: Path to the spec file (e.g., `specs/99-event-card-policy-surface.md`)
  - `<NAMESPACE>`: Ticket namespace prefix (e.g., `99EVECARPOLSUR`)
- **Output**: Ticket files written to `tickets/<NAMESPACE>-<NNN>.md`, uncommitted

## Process

### Step 1: Mandatory Reads

Before any analysis, read these four files:
1. The spec file (from argument)
2. `tickets/_TEMPLATE.md` — canonical ticket structure
3. `tickets/README.md` — ticket authoring contract
4. `docs/FOUNDATIONS.md` — architectural commandments

### Step 2: Codebase Validation

Grep/glob the codebase to validate:
- File paths mentioned in the spec actually exist
- Types, functions, and modules referenced in the spec are real
- No assumptions in the spec are stale

### Step 3: Analyze & Decompose

- Identify discrete work units from the spec
- Each ticket must be a reviewable diff (small enough for manual review)
- Map dependencies between tickets
- Determine priority ordering
- Ensure every spec deliverable is covered (no silent skipping)

### Step 4: Present Summary for Approval

Before writing any files, present a numbered summary:
- Ticket ID, title, 1-line description
- Estimated effort (Small/Medium/Large)
- Dependencies between tickets
- Wait for user approval or adjustments

### Step 5: Write Ticket Files

- Write each ticket to `tickets/<NAMESPACE>-<NNN>.md`
- Use `tickets/_TEMPLATE.md` structure exactly
- Every ticket includes:
  - Files to Touch (validated against codebase)
  - Out of Scope (explicit non-goals)
  - Acceptance Criteria: specific tests + invariants
  - Architecture Check (FOUNDATIONS.md alignment)
- Do NOT auto-commit

## Constraints

- All tickets must align with `docs/FOUNDATIONS.md`
- Every ticket must follow `tickets/_TEMPLATE.md` structure
- File paths in tickets must be verified against the actual codebase
- No ticket may silently skip a spec deliverable (ticket fidelity)
- Dependencies between tickets must be explicit in `Deps` field

## Non-Goals

- No optional flags (--priority, --max-tickets, etc.)
- No auto-commit
- No sub-agent delegation
