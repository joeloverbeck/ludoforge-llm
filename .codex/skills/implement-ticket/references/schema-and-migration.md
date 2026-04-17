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

## Reassessment Surfaces

When reassessing whether a ticket has underspecified constraints, inspect these surfaces:

- Shared type or schema ripple effects
- Repo-owned downstream consumers of the changed contract, especially UI/display, trace/serialization, generated-fixture, and sibling-package boundaries
- Staged shared-contract ownership: when the current ticket introduces a new shared field/type surface and a downstream sibling owns population, migration, or full enforcement, explicitly decide whether the interim shape must be `required now`, `optional until sibling lands`, or `blocking until 1-3-1`
- Shared contract migration fanout: estimate the likely blast radius early with targeted `rg` counts before coding so fixture fallout, helper updates, and broad touch points are visible up front
- Cross-package fallout for shared exported unions, serialized trace kinds, and exhaustiveness-based consumers
- Cross-package mocked-contract fallout for shared exported unions or result-shape changes: grep sibling-package tests, mocks, worker fixtures, and structured-clone fixtures for stale discriminants, mocked return kinds, and hand-authored payload shapes
- Same-package fallout for widened shared unions: grep local `switch` statements, discriminated-union helpers, exhaustiveness guards
- When changing a shared callable type contract, grep both runtime callsites and their tests
- When changing helper signatures, argument threading, or call arity, also grep for source-guard, AST-policy, and contract-style tests that assert call shape or helper wiring
- Shared state/object-shape migrations: explicitly inspect initializers, clone/draft builders, serialization/deserialization, and any runtime delete/unset/cleanup helpers that may silently reintroduce shape drift after your main type change
- Foundation 14 atomic migrations for removals or renames
- Required test, schema, or fixture updates
- Direct fixture fanout: when tests or helpers author runtime state inline, decide whether a shared builder/default can absorb the migration or whether a deliberate mechanical bulk update is the correct narrow move
- Policy/catalog fallout for agent or scoring changes: check compiled policy catalogs, explicit consideration-list assertions, and fixed-seed policy goldens or summary traces when the repo owns them
- Test harness / fixture-authoring invariants: when tests manually author or mutate runtime state, verify coupled invariants such as `stateHash` / `_runningHash`, trusted-move source hashes, branded-vs-serialized identifier domains, and any cache keys derived from state
- When the ticket disputes game-specific legality, consult local rulebook extracts or rules reports
- Acceptance criteria / test text that may be semantically stale even when the command or file path is still valid: wrong raw value shape, wrong contract expectation, wrong output type, wrong asserted invariant
- Campaign/simulation repro reduction opportunity: whether a broad harness witness can be reduced to the earliest deterministic failing prefix and then replaced by a narrower direct proof surface without changing ticket ownership

## In-Memory vs Serialized Decisions

When a ticket changes an in-memory contract, object shape, or serialized surface, explicitly decide whether runtime and serialized representations are both supposed to change. Preserve or migrate serialized behavior intentionally, then record that decision in working notes before broader verification.

## Post-Implementation Sweep for Broad Contract Migrations

For broad contract migrations, representation changes, or identifier migrations, add an explicit post-implementation sweep before broad verification:
- grep for legacy comparisons, stringification, or serialization of the migrated field (`String(...)`, raw equality checks, hand-authored literals, trace/summary emitters, golden producers)
- classify each surviving surface as `must migrate`, `intentional serialized boundary`, or `non-owner`
- run one or two representative runtime proofs on user-facing or serialized surfaces before assuming typecheck-complete means ticket-complete
- when a test file mixes authored `GameSpecDoc`/spec fixtures with compiled `GameDef`/`GameState` runtime fixtures, explicitly classify each edited block as `authored boundary` or `compiled runtime` before changing ids or expectations; keep string identifiers only on the authored side unless live code proves that surface was already compiled

## Identifier Migration Consumer Sweep

For identifier migrations specifically (`ActionId`, `ZoneId`, `Token.type`, variable ids, marker ids, and similar), use this compact consumer sweep:
- runtime contract and compiler lowering
- engine/runtime fixtures and helper builders
- serialized or display-restoration boundaries (runner, traces, reports, visual-config validation, human-readable logs)
- committed generated artifacts or compiled fixture consumers in sibling packages
- at least one workspace-level build/typecheck lane before closeout when more than one package consumes the migrated identifiers

## Interim Contract State for Staged Shared-Contract Tickets

When the ticket introduces a shared contract surface but a downstream sibling still owns population, migration, or full enforcement, make the interim contract state explicit before coding:
- identify which ticket introduces the surface and which sibling owns the follow-through
- decide whether the live boundary requires the new surface to be `required now`, `optional until sibling lands`, or `blocking until 1-3-1`
- rewrite active draft acceptance text before completion if the original wording would misstate that interim contract
- verify the interim shape with the narrowest build-safe proof lane instead of silently absorbing the downstream sibling's work

## Historical Benchmark Sweeps Across Worktrees

For historical benchmark sweeps across commits, branches, or detached worktrees:
- expect each isolated worktree to need its own dependency/bootstrap setup before the first measurement
- treat measurement logs written inside those worktrees as evidence artifacts; do not overwrite or discard them just to reuse the same worktree for a different commit
- if preserving those logs blocks further checkout movement, create a fresh isolated worktree for the next comparison rather than destroying the recorded evidence
- record in working notes which measurements were temp-worktree evidence versus which logs were refreshed in the main repo as the ticket-owned final artifacts
