# Ticket-Type Triage

Before loading every optional reference, classify the ticket into the smallest live category that preserves correctness:

- **Bounded local refactor**: one main module or a tight cluster of same-domain files, no schema/serialized artifact ownership, no blocking discrepancies, and no verified sibling ownership drift beyond a lightweight sanity check
- **Shared-contract or migration ticket**: exported types, schemas, generated artifacts, serialized surfaces, or broad fixture fallout are likely
- **Mixed bounded/shared-contract ticket**: the code change is local, but it changes a serialized trace/result shape, generated schema, exported union, diagnostic field, or required object-literal property consumed outside the local package
- **Proof, benchmark, audit, or investigation ticket**: the decisive deliverable is evidence, measurement, or a verdict rather than production code
- **Mixed ticket**: more than one category applies; load the minimum extra references for each active category rather than defaulting to the whole skill body

## Bounded Local Refactor

When the ticket is a **bounded local refactor**, keep the read phase lean after the mandatory `FOUNDATIONS.md`, ticket, `Deps`, repo-state, and `AGENTS.md` checks:

1. Validate the named files, functions, and commands.
2. Open sibling drafts only long enough to confirm the current ticket has not been absorbed or contradicted.
3. Load only the optional reference files needed by the live boundary you actually found.
4. Still emit the full working-notes checkpoint before coding.
5. Do not automatically load every later reference file named elsewhere in this skill. Treat those loads as conditional for bounded local refactors unless reassessment reveals blocking drift, migration/shared-contract fallout, or another concrete need.

## Proof, Benchmark, Audit, or Investigation Ticket

When the ticket is a **proof, benchmark, audit, or investigation ticket**, do this compact gate checklist before heavy commands:

1. Identify the authoritative measurement or verdict surface (`harness`, saved report, trace, direct runner, etc.).
2. Confirm which logs, reports, or other artifacts this ticket actually owns.
3. Classify the comparison baseline as live-to-be-rerun versus already-recorded historical evidence.
4. Restate the downstream threshold action before running commands (`close sibling`, `keep sibling active`, `create follow-up`, `mark blocked`, etc.).

## Event-Driven, Card-Driven, or Action-Identity-Sensitive Repro

When a ticket depends on an **event-driven, card-driven, or action-identity-sensitive repro**, do this identity check before tracing deeper into a plausible candidate:

1. Verify the exact currently resolved card, action, branch, or other runtime-owned identity from live state, trace, or authoritative harness output.
2. Prefer that direct identity evidence over an inferred nearby candidate when multiple adjacent events or actions could explain the same symptom.
3. Record the confirmed current witness identity in working notes before deeper implementation or TDD proof work.

## Gate, Smoke, or Regression Ticket with Named Historical Witness

When a **gate, smoke, or regression ticket** depends on a named historical witness, classify that witness before preserving it literally in the active ticket:

1. `same seam`: the witness still fails or passes for the same underlying contract the ticket names.
2. `absorbed fix`: the witness is already green on current `HEAD`, so it is now a proof gate rather than a production-fix owner.
3. `new prerequisite bug`: the witness now fails for a materially different live bug class, so it should move to a new prerequisite or follow-up ticket rather than remain mislabeled inside the current gate.
4. Record that classification in working notes before coding or rewriting the active ticket.

## Historical-Evidence Sufficiency Check

When a **proof, benchmark, investigation, or mixed ticket** requires an exact historical reproduction artifact or incident characterization, do this historical-evidence sufficiency check before assuming the ticket can close on present-day proof alone:

1. Classify the repo evidence as `reconstructable`, `summary-only`, or `missing` for the named historical state, trace slice, or benchmark incident.
2. If the evidence is `summary-only` or `missing`, decide before closeout whether the ticket can:
   - close on an equivalent bounded live proof plus an explicit ticket rewrite
   - remain `BLOCKED` pending a reconstructable artifact or new instrumentation
   - require a 1-3-1 boundary reset because the literal historical deliverable is not currently attainable from repo-owned evidence
3. Record that classification in working notes so later implementation and closeout do not silently downgrade an exact historical deliverable into a looser modern proof.

## Contradictory Live Evidence (Profiling/Investigation)

When a profiling or investigation ticket may close on **contradictory live evidence** rather than on a code fix, use this quick contradiction checklist before widening scope:

1. Rerun the named baseline in the same environment when the ticket depends on a relative performance claim.
2. Rerun current `HEAD` in that same environment before treating an earlier recorded verdict as definitive.
3. Reclassify the current ticket as `evidence-only closeout`, `still-live fix ticket`, or `needs 1-3-1 boundary reset` before profiling deeper or editing code.

## Shared-Contract or Migration Ticket

When the ticket is a **shared-contract or migration ticket**, do this compact downstream-consumer checkpoint before coding:

1. List the repo-owned downstream packages or modules that consume the changed runtime surface.
2. Classify each consumer as `runtime owner`, `serialized/display boundary`, `generated artifact consumer`, or `tests/fixtures only`.
3. Record which verification lanes are intermediate local proofs versus final acceptance-proof lanes for the ticket.
4. If any downstream consumer is outside the main package you are editing, plan at least one workspace-level build/typecheck lane before considering the ticket complete.

For a **mixed bounded/shared-contract ticket**, add this early fallout pass before treating the work as a local refactor:

1. `rg` the changed field/type/literal across the workspace, not only the package you expect to edit.
2. Check hand-authored fixtures, runner/UI/report consumers, trace-summary fixtures, and exhaustiveness-style tests for required object-shape fallout.
3. Decide whether schema/artifact regeneration is owned now or explicitly deferred to a sibling ticket.
4. Keep the focused local witness as the first proof, but reserve closeout until the planned workspace-level build/typecheck lane has either passed or been truthfully classified.
