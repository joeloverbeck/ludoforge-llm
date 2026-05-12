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
- When adding metadata or helper fields to recursive AST/IR unions, treat generated JSON Schema size and `$ref` reuse as an early risk. Run a focused validation against at least one production-sized artifact that exercises the recursive union, inspect whether generated schemas expand the union inline or reuse definitions, and hoist/reuse shared subschemas before broad proof if validator recursion or stack depth becomes the first failure.
- When adding a new schema file under an existing schema/artifact directory, classify it before implementation as `generator-owned` or `manual artifact`. Check the generator's file list or write targets, decide whether the new schema should be added to that list, and name the validation lane that proves the decision. If it is intentionally manual, record that in the ticket closeout so later schema-artifact runs are not misread as missing the new file.
- For additive compiled-field migrations, requiring the new field in compiler-owned artifacts while leaving handwritten TypeScript fixtures temporarily optional is valid when explicit, Foundation-compliant, and verified.
- For additive compiled consideration or policy-profile fields, use a compact mirror map before coding: authored shape (`GameSpecDoc`/parser-facing doc type), analyzer or lowering entrypoint, compiled consideration/library preservation, kernel/runtime type, Zod/schema mirror, generated `GameDef` schema, exact-shape tests, and any deferred runtime behavior owner. Do not treat "type added" or "compiler diagnostic added" as sufficient if a mirror can silently drop the authored field before the compiled artifact.
- If a new field mainly supports one feature path, consider keeping it optional on local test-helper contracts to avoid unnecessary fixture churn.
- For type-only exports or preparatory type surfaces whose acceptance asks for an import/typecheck spot-check, classify the witness before coding. If the symbol is exported from the named module and the package/workspace build or typecheck consumes that module surface, record the spot-check as `subsumed by build/typecheck`. Add a focused durable type-only consumer only when the ticket explicitly requires a witness file, package-barrel import, or cross-package/public export proof.

**Required-field migrations**:
- When an earlier ticket made a field required, add empty/default placeholders across constructors, defaults, fixtures, and goldens for atomicity.
- When the current ticket makes a shared field required, repo-owned constructors, helpers, fixtures, runtime schemas, and generated artifacts are in-scope immediately.
- For type-only serialized/exported contract tickets, do a source-producer preflight before coding: inspect the runtime serializers, deserializers, builders, fixtures, and public construction helpers that must actually create the narrowed type. If live typecheck would require runtime or fixture wiring for the new type to be true, treat the ticket as a Foundation 14/15 atomicity mismatch and stop for `1-3-1` before preserving a type-only split with casts or partial state.
- Update shared helpers first, then use focused typecheck output for remaining inline fixtures.
- For large hand-authored fixture fanout, use a guarded migration loop: update shared builders/default factories first; run the smallest build/typecheck lane that reveals remaining object literals; patch inline literals in small batches; avoid broad regex rewrites unless the pattern is structurally unambiguous; inspect `git diff --check` and targeted diffs for high-risk unrelated fixtures before broad verification. If a bulk rewrite goes wrong, restore only the affected files or hunks, rerun the focused typecheck/build, and continue from the shared-helper-first path.
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
- When metadata is added broadly to AST/IR nodes or compiled effects, search exact serialized-output tests and fixtures early. Prefer one shared strip/normalization helper for legacy exact-shape assertions when the metadata is orthogonal to the behavior those tests own, and update production goldens only where the new field is part of the public compiled contract.
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
- New package/crate registration: when a ticket adds a package, crate, or equivalent workspace unit, verify workspace discovery, package filter invocation, build script path, build artifact/output location, ignore-rule coverage, and whether task-runner outputs such as `turbo.json` need adjustment before final proof.
- Binary/WASM/FFI ABI surfaces: when a ticket introduces a compact binary boundary, explicitly decide and prove version/magic identity, layout or artifact identity, endian/order convention, length validation, mismatch rejection, overflow/error status behavior, ownership of allocation/freeing, and whether JSON is excluded from the hot path.
  - When changing ABI identity or exported runtime shape, synchronize host and target constants before broad proof: grep the repo for the magic/version/layout/export names, update both sides in the same slice, and add the focused load/smoke proof that would fail on drift. Do this before treating an ABI version mismatch, missing export, or layout rejection as evidence of a deeper runtime bug.
  - For FFI-backed runtime integration, verify the initialization and lifetime model before promising evaluator or hot-path wiring: synchronous versus asynchronous module loading, where the runtime instance is cached, whether the target call path can legally await or must stay synchronous, who owns cache invalidation, and whether adding an async preload/default-flip seam would change the ticket's public contract. If the named integration path cannot call the FFI runtime without changing that contract, classify the current ticket's truthful integration seam and create or update the successor owner before final proof.
  - For VM or evaluator parity across a language/FFI boundary, inventory the source VM's value domain before coding: every result kind, feature output kind, opcode output kind, sentinel/undefined shape, and dynamic/unsupported fallback path. Decide which values the target ABI encodes, which values fail closed, and which values remain deferred. Add focused fail-closed tests before or alongside parity tests so unsupported source values cannot be silently approximated by a narrower target value model.
  - For policy or scorer bridges, classify `value`, `score`, `row`, `candidate`, and `batch` as separate ABI claims. Proving a supported value row over an action batch is not automatically the same as proving candidate-dependent score integration. If the draft says `values/scores`, record which nouns are supported now, which fail closed, and which successor owns the residual score/candidate surface before final proof.
  - For full-profile policy/scorer handoffs, run a cheap current-corpus support inventory before finalizing the ABI boundary or after the first candidate implementation: enumerate the corpus refs and score-row surfaces by class (`stateFeature`, `candidateFeature`, `aggregate`, `preview`, `dynamic`, and any action/candidate intrinsics), then record whether each class is encoded directly, supplied through precomputed rows, or intentionally fail-closed. Use this inventory to avoid discovering a missing non-preview row class only after expensive corpus parity runs.
  - When host object walking is forbidden on a hot FFI path, a generic precomputed-row table can be the truthful bridge for scalar library refs: compute row values on the TypeScript/reference side at the same semantic point, encode only deterministic scalar domains, validate candidate counts, row counts, ids, value tags, and layout/version identity in the ABI, and keep non-scalar or non-materialized rows fail-closed. Treat this as a generic bridge pattern, not a license to add game-specific ids or schemas.
  - Preview-backed scorer rows require a preview materialization identity proof before they can share the same precomputed-row mechanism. A row may be syntactically encodable but semantically wrong if it uses root-state or static precomputed values where the TypeScript reference evaluates against preview state. If parity shows that substitution changes scores, make the preview row fail closed, create or update the preview-owner successor, and do not run same-seam perf gates as final acceptance until preview-backed rows preserve the reference materialization semantics.
  - For policy/VM/FFI handoffs with mixed support, keep a compact ABI coverage matrix in working notes, the active ticket outcome, or another durable proof surface when it would prevent ambiguity. Suggested columns: `surface`, `encoded now`, `evaluated now`, `fail-closed?`, `parity witness`, and `successor owner`. Include rows for materially distinct value, score, row, candidate, batch, preview, aggregate, dynamic, and integration surfaces rather than collapsing them into a single "supported" verdict.
  - For groundwork tickets that name a substrate, artifact, bridge, buffer, or materialization contract, map that noun to a concrete durable surface before coding: `ticket noun -> ABI field/output/artifact -> proof assertion -> successor owner`. Do not close a substrate ticket on an older weaker support flag when the named artifact is not directly observable in the ABI, harness, or checked-in outcome.
  - For ABI identity or export-shape changes, include a compact ABI change ledger in the active ticket outcome when it would clarify the handoff: `ABI magic`, `ABI version`, `layout id`, `host constants`, `target constants`, `export signature`, `load/smoke proof`, `parity proof`, and `inventory/profile proof` when applicable.

## In-Memory vs Serialized Decisions

When a ticket changes an in-memory contract, object shape, or serialized surface, explicitly decide whether runtime and serialized representations are both supposed to change. Preserve or migrate serialized behavior intentionally, then record that decision in working notes before broader verification.

For canonical serialized state or trace surfaces, preserve existing JSON property order unless the ticket explicitly owns a canonical-order migration. Golden snapshot failures that differ only by object key order are still real F8/F13 evidence: fix the producer order or truth the ticket before re-blessing.

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

For staged additive discriminated-union variants or new ref/expression kinds:
- sweep exhaustive consumers before coding: local `switch` statements, discriminated-union helpers, schema mirrors, feature-table/bytecode encoders, diagnostics, and any curated public schema/export surfaces
- for authored policy-expression operator additions, include the shared expression analyzer/operator registry in that sweep before assuming lowering owns the first parse point; map `authored syntax entrypoint -> analyzer/operator registration -> allowed expression contexts -> runtime resolver or fail-closed path -> schema/generated mirror -> negative tests for forbidden contexts`
- when an expression operator is only valid in a subset of policy contexts, add an explicit context gate rather than letting generic expression parsing make it available in weights, guards, scores, or other surfaces that the ticket does not own
- classify each required consumer edit as `type acknowledgement / fail-closed`, `schema/generated-artifact mirror`, `identity/type-only fallout`, or `behavioral implementation`
- when the current ticket explicitly defers real behavior to a sibling, prefer a fail-closed acknowledgement in exhaustive runtime consumers over a generic default branch; record the sibling as the behavioral owner before final proof
- if adding the fail-closed acknowledgement changes an explicit ticket deliverable such as "no dispatch case", stop for `1-3-1` unless the user already authorized the boundary reset

When the staged surface is a partially populated compiled or serialized artifact:
- record which descriptor families, fields, or producers are supported by the current ticket and which are deliberately deferred to siblings
- include a compact compiled-versus-skipped coverage summary in the ticket outcome, proof helper output, or another durable closeout surface when the skipped portion is material to the handoff
- verify that unsupported portions fail closed, remain absent, or are otherwise impossible to consume accidentally under the current ticket boundary

## Historical Benchmark Sweeps Across Worktrees

For historical benchmark sweeps across commits, branches, or detached worktrees:
- expect each isolated worktree to need its own dependency/bootstrap setup before the first measurement
- treat measurement logs written inside those worktrees as evidence artifacts; do not overwrite or discard them just to reuse the same worktree for a different commit
- if preserving those logs blocks further checkout movement, create a fresh isolated worktree for the next comparison rather than destroying the recorded evidence
- record in working notes which measurements were temp-worktree evidence versus which logs were refreshed in the main repo as the ticket-owned final artifacts
