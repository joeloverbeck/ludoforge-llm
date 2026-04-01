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

Structured workflow for ticket reassessment and implementation. This eliminates the manual preamble of reading tickets, reassessing assumptions, correcting discrepancies, and then implementing.

## Workflow

### Phase 1: Read and Understand

1. **Read the ticket file(s)** matching the provided glob path
2. **Read referenced specs and docs** from the ticket's `**Deps**` field and any additional context passed as arguments
3. **Extract all references** from the ticket: file paths, function names, type names, module references, class names
4. **Confirm project conventions** from CLAUDE.md (always available in system context)

**Chaining note**: If a prior ticket in the same series was implemented earlier in this session, leverage already-verified context. Phase 2 reassessment should focus on new references introduced by this ticket, not re-verify artifacts confirmed by the prior ticket.

### Phase 2: Reassess Assumptions

5. **Grep/Glob for every referenced artifact** in the ticket:
   - File paths: do they exist? Are they at the stated location?
   - Functions/types/classes: do they exist? Are their signatures as described?
   - Module structures: does the code organization match what the ticket assumes?
   - Dependencies: are imported modules/packages available?
6. **Build a discrepancy list**: anything the ticket states that doesn't match reality

**Guard test note**: For tickets that modify shared types or interfaces (e.g., `GameDef`, `CompileSectionResults`), check for exhaustiveness tests, schema artifact checks, or diagnostic registry audits that may need updating alongside the main deliverables.

### Phase 3: Resolve Discrepancies (if needed)

7. If discrepancies require **ticket corrections** (ticket states something factually wrong):
   - **Present each discrepancy** to the user with what the ticket says vs. what the codebase actually has
   - **Propose corrections** to the ticket text
   - **Wait for user approval** before modifying the ticket file
   - **Edit the ticket file** with approved corrections
8. If discrepancies require a **resolution strategy** (ticket is accurate about intent but has dependency gaps, scope edge cases, or implementation choices to make):
   - **Present the discrepancy** and the proposed resolution strategy
   - **Wait for user confirmation** before proceeding to Phase 4
9. If no discrepancies: confirm the ticket is accurate and proceed

### Phase 4: Implement

10. **Invoke the `superpowers:executing-plans` skill** to implement the corrected ticket
    - The ticket serves as the implementation plan
    - The executing-plans skill may require worktree setup or branch creation — if working directly on main, confirm with the user before proceeding
    - Follow all project conventions (worktree discipline, immutability, TDD, etc.)
    - Run lint, typecheck, and tests before claiming completion (per Pre-Completion Verification rule)

### Phase 5: Follow-Up

11. After implementation is verified and the user confirms completion, offer to **archive the ticket** per `docs/archival-workflow.md`

## Rules

- **Never adapt tests to match bugs** — fix the code
- **Never silently skip deliverables** — if something seems wrong, present options (1-3-1 rule)
- **Worktree discipline**: if working in a worktree, ALL file operations use the worktree root path
- **Correct the ticket, not the code** when assumptions are wrong — the ticket is the source of truth for intent, the codebase is the source of truth for current state
- **FOUNDATIONS.md overrides ticket scope**: if a ticket's scope boundary conflicts with `docs/FOUNDATIONS.md` (e.g., Foundation 14 requires migrating all owned artifacts in the same change, but the ticket defers migration to a later ticket), FOUNDATIONS.md takes precedence. Present the conflict and the Foundation-compliant resolution to the user before proceeding.
- **Ticket fidelity**: every deliverable listed in the ticket must be addressed — either implemented, or flagged as blocked with the 1-3-1 rule

## Example Usage

```
/implement-ticket tickets/LEGACTTOO-009*
/implement-ticket tickets/FITLSEC7RULGAP-001*
/implement-ticket .claude/worktrees/my-feature/tickets/FOO-003*
```
