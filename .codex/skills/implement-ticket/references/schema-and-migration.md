# Schema, Contract & Migration Rules

## Migration & Rewrite Awareness

- **Mid-migration**: Distinguish the ticket's intended end state from work already landed. Treat extra files needed for Foundation 14 atomicity as required scope. Call out partial-migration state before coding. Treat referenced dirty specs as read-only context when the current ticket does not own spec edits.
- **Ticket rewrites**: If you materially correct ticket scope, re-extract files, acceptance criteria, invariants, and verification commands from the corrected ticket. Treat the rewritten ticket as authoritative. If later verification disproves the rewrite premise, restore the original boundary and note why. If typecheck/build evidence proves a rewritten acceptance case is impossible under the live surface, amend the ticket again. When the rewrite disproves an active spec's stated root cause or owned boundary, update that spec in the same turn unless another active ticket owns that correction.
  - If a rewritten verification-owned ticket exposes a concrete live failure while running its acceptance commands, treat it as in-scope when fixing is necessary to satisfy the rewritten boundary. Refresh working notes before patching.

## Schema & Contract Migrations

When a change touches schemas or contracts, check updates across these layers:

### Layer Checklist

- **Authored layer**: schema/doc types, source-shape/parser-facing doc types, validators, unknown-key allowlists
- **Compiled/runtime layer**: kernel/runtime types, Zod/JSON schemas, compiled DSL/AST shapes, generated schema artifacts
- **Consumer layer**: diagnostics/debug snapshots, exported provider interfaces and adapter wrappers, injected callback plumbing
- **Test layer**: fixtures, goldens, manually constructed runtime/test context objects (e.g., `GameDefRuntime`)

### Migration Guidelines

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

## Golden & Fixture Drift

When a change alters compiled output, scoring, move selection, observability, or preview readiness:
- Treat owned production goldens as expected update surfaces unless evidence shows unexpected drift outside the ticket boundary.
- Before editing an owned golden, capture fresh authoritative output from the current built runtime or test harness.
- When earlier groundwork introduced a required placeholder and the current ticket populates it, expect goldens to drift from stubs to populated values.
- When enriching diagnostics or trace output, prefer preserving the existing coarse summary field and adding an optional detail field unless the ticket owns a breaking schema redesign.
- Probe nearby goldens that look like expected drift explicitly.
- In this repo, compiled-agent contract changes often surface first in policy production goldens (`policy-production-golden.test.ts`, policy catalog fixtures, fixed-seed policy summaries); check those before assuming broader regression.
