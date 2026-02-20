# Ticket Authoring Contract

This directory contains active implementation tickets.

To keep architecture clean, robust, and extensible, every new ticket must be created from `tickets/_TEMPLATE.md` and must satisfy the checks below.

## Core Architectural Contract

1. `GameSpecDoc` holds game-specific behavior/data.
2. `GameDef` and simulator/runtime/kernel stay game-agnostic.
3. No backwards-compatibility shims or alias paths in new work.
4. If current code and ticket assumptions diverge, update the ticket first before implementation.

## Required Ticket Sections

1. `Assumption Reassessment (YYYY-MM-DD)`:
   - Validate ticket assumptions against current code/tests.
   - Explicitly call out mismatches and corrected scope.
2. `Architecture Check`:
   - Explain why the proposed design is cleaner than alternatives.
   - Confirm no game-specific branching leaks into agnostic layers.
3. `Tests`:
   - List new/modified tests and rationale per test.
   - Include targeted and full-suite verification commands.

## Mandatory Pre-Implementation Checks

1. Dependency references point to existing, non-archived tickets/spec deliverables.
2. Type and data contracts match current code (for example seed type, move shape, store API).
3. Files-to-touch list matches current file layout and ownership.
4. Scope does not duplicate already-delivered architecture.

## Archival Reminder

When complete, mark status as completed, add Outcome, and move ticket to `archive/tickets/` per repository rules.
