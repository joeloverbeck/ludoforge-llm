# Spec 148: Runtime-Interned Identifier Comparison On Kernel Hot Paths

**Status**: PROPOSED
**Priority**: P3 (smallest of the three architectural-ceiling specs from the fitl-preview-perf campaign; deliver after Spec 146 + Spec 147 land, since the residual ceiling will be smaller and the cost-benefit may shift)
**Complexity**: M (kernel-internal interning table, runtime-scoped lifetime, hot-path Map / Set replacements; no GameSpecDoc YAML change, no compiler IR change, no public-API regression risk)
**Dependencies**:
- Foundation 17 (Strongly Typed Domain Identifiers) — extends the brand-types pattern with a runtime numeric encoding.
- Foundation 8 (Determinism) — interned encodings are computed deterministically per `(GameDef, idDomain)` and never observable in serialized artifacts.
- Foundation 14 (No Backwards Compatibility) — serialized YAML / JSON keep canonical string IDs; the interning is purely a kernel runtime cache. No compatibility shims are introduced.
- Spec 146 [scoped-draft-state-for-preview-drive] (archived/completed) and Spec 147 [aot-consideration-ast-compilation] (PROPOSED) — should land before this spec, as they reduce the residual hot-path identifier cost and the cost-benefit may shift after they ship.

**Source**:
- V8 sampling profile from `campaigns/fitl-preview-perf/musings.md` "Re-profile after exp-015": `Builtin: StringEqual` (2.0%), `Builtin: StringCompare` (1.8%), `Builtin: StringFastLocaleCompare` (1.3%), `Builtin: FindOrderedHashMapEntry` (4.4%, partially id-related). Combined ~5-9% of total CPU is in identifier comparisons or in Map / Set lookups keyed on identifier strings.
- Cumulative-FITL-perf global lessons: "string-based IDs (6% CPU, addressable via Spec 129 integer interning)". Spec 129 was never written; this spec is its successor.
- Bottom-up call graph attribution: id comparisons are distributed across `legalChoicesWithPreparedContextInternal`, `applyMoveToken`, `applySetTokenProp`, `evalQuery`, and `getTokenStateIndexEntry`. No single call site dominates — the cost is the cumulative tax of string comparisons across all kernel evaluators.

## Brainstorm Context

**Original framing.** Foundation 17 brands domain identifiers (ZoneId, ActionId, SeatId, TokenTypeId, DecisionKey, FrameId, TurnId, etc.) as nominal types over `string`. The brand types eliminate cross-domain bugs at compile time; the runtime values are still `string`. Every kernel hot-path comparison (`a === b` where `a, b` are ids) reduces to V8's `Builtin: StringEqual`, which is fast for short strings but non-trivial when called millions of times.

The fitl-preview-perf benchmark's profile shows ~5-9% of CPU in string operations (StringEqual + StringCompare + StringFastLocaleCompare). The exact attribution to identifier comparisons (vs. content strings like player names or zone display names) is mixed, but the hot path of legal-moves enumeration and effect application is dominated by id comparisons — there are ~5x more `id === id` checks than content-string operations on a typical microturn.

**Motivation.**
1. **Numeric comparison is faster than string comparison in V8**, by roughly 5-10× for short strings (where short = 1-32 chars) when the comparison happens millions of times. A small-integer (`SMI`) comparison is a single machine instruction; a string comparison is a length check + content scan + hash check.
2. **Map / Set with numeric keys outperform Map / Set with string keys** when key cardinality is small (<256). FITL's identifier domains are all in the 10-200 range. A Map with integer keys can use `Builtin: FindOrderedHashMapEntry` more efficiently because it skips the string-hash path.
3. **F#17 already authorizes nominal id types**. This spec extends the same nominal pattern to a runtime numeric encoding without changing the serialized representation. The kernel internally compares interned integers; YAML / JSON / GameDef snapshots keep canonical string IDs.

**Prior art surveyed.**
- **Apache Lucene's `BytesRef` interning** in the document index: every term is interned to a `termId` (small integer), and the document-content matching uses integer comparisons in the hot loop. Same architectural pattern, different domain.
- **CPython's small-integer caching and string interning**: `is`-comparison fast-path. Less directly applicable but illustrates that interning identifier-like values is a standard JIT-friendly optimization.
- **Chess engines** virtually always intern board squares as small integers (a8 = 0, h1 = 63) and never use string comparisons in the move-generation loop.

The shared pattern: any system that does millions of identifier comparisons per second interns its identifiers numerically. Game engines that don't tend to use languages where the JIT does it transparently (e.g., Java string interning + escape analysis); JavaScript / V8 do not.

**Synthesis.** Add a runtime-scoped interning table to `GameDefRuntime`: `idCodec: { encode(domain, id): number; decode(domain, code): string }`. Domains include `zoneId`, `actionId`, `seatId`, `tokenTypeId`, `decisionKey`, `frameId`, `turnId`, `moveParamKey`, `featureId`, `varName`. The encoding is computed deterministically from the GameDef's compile-time inventory of each domain (e.g., `def.zones.map(z => z.id)`); same GameDef → same encoding. The encoding is opaque — kernel code MUST NOT rely on a specific integer value, only on equality between encoded values.

Hot-path comparisons replace `idA === idB` with `encodedA === encodedB`. Hot-path Map / Set keys use the encoded integer. Public APIs continue to accept and return canonical string IDs; the encoding is a kernel-runtime detail.

**Alternatives explicitly considered (and rejected).**
- **Interning at the JavaScript runtime level via `Symbol.for`.** Symbol comparison is fast but Symbols can't be Map keys interchangeably with strings; would force a parallel API. Rejected — interface burden.
- **Prefix matching on string IDs.** Use first-2-char hash for fast-path inequality. Hand-tuned, fragile, doesn't help equality fast path. Rejected — speculative optimization without clear win.
- **Migrate the entire codebase to use integers everywhere.** Would replace F#17's branded strings with branded numbers. Massive change, breaks YAML round-trip, breaks logging, breaks debugging. Rejected — F#14 violation (no migration shim) but also F#9 (Replay/Telemetry) — string IDs are essential for human-readable replay logs.
- **Per-comparison memoization via WeakMap.** Cache `(left, right) → boolean`. Quadratic memory in id-pair space. Rejected — exceeds the cost of the original comparison.

**User constraints reflected.** F#1 (Engine Agnosticism — the codec is generic over domains, no game-specific id list), F#7 (Specs Are Data — the codec table is data computed deterministically from GameDef), F#8 (Determinism — same GameDef → same encoding; encoded integers are canonical for the GameDef's lifetime), F#9 (Replay / Telemetry — serialized artifacts keep canonical string IDs; the encoding is invisible outside the kernel runtime), F#13 (Artifact Identity — encoding is per-runtime, not part of `gameDefHash`), F#14 (No Backwards Compatibility — public APIs unchanged; only internal hot paths use encoded integers, no shim layer), F#17 (Strongly Typed Domain Identifiers — the encoding is keyed by domain, preventing cross-domain confusion at the codec API level).

## Overview

Add a runtime-scoped `IdCodec` to `GameDefRuntime`:

```ts
export interface IdCodec {
  /** Compile-time inventory: throws if `id` is not a known identifier in `domain`. */
  encode(domain: IdDomain, id: string): number;
  /** Inverse: throws if `code` is not a known encoded id in `domain`. */
  decode(domain: IdDomain, code: number): string;
  /** Returns true iff `domain` knows `id`. Non-throwing variant for legality probes. */
  isKnown(domain: IdDomain, id: string): boolean;
}

export type IdDomain =
  | 'zoneId'
  | 'actionId'
  | 'seatId'
  | 'tokenTypeId'
  | 'decisionKey'
  | 'frameId'
  | 'turnId'
  | 'moveParamKey'
  | 'featureId'
  | 'globalVarName'
  | 'perPlayerVarName'
  | 'zoneVarName'
  | 'markerLatticeId';
```

The codec is built once per `createGameDefRuntime`, populated from the GameDef's compile-time inventory. Encoding is monotonic per domain (first inventory entry → 0, second → 1, etc.); the kernel does not rely on specific values, only on equality.

Hot-path call sites that this spec migrates:
- `legal-moves.ts:enumerateLegalMoves` and friends — action-id comparisons on every legality probe.
- `applyMoveToken` / `applySetTokenProp` / `applyAddVar` and other effect handlers — zone-id, token-type-id comparisons on every effect.
- `evalQuery` / `evalCondition` — id comparisons for `match`, `filter`, `equals` predicates.
- `token-state-index.ts:getTokenStateIndex` — keyed Map; switches to `Map<number, ...>` for hot lookups.
- `policy-evaluation-core.ts:evaluateZoneTokenAggregate` and friends — zone-id, prop-name comparisons.

## Problem Statement

### Defect class: distributed string-comparison tax

The fitl-preview-perf profile shows no single dominant string-comparison call site. The cost is distributed across ~10-15 evaluator functions, each contributing 0.1-0.5% of CPU. Aggregate: ~5-9% of CPU in `Builtin: StringEqual` + `Builtin: StringCompare` + Map / Set string-keyed lookups.

Direct attempts to optimize these call sites are blocked by the cumulative-FITL-perf V8-deopt ceiling: any modification of the kernel computation hot paths regresses. The only safe optimization is removing work — and the work is the string comparison itself. Replacing it with an integer comparison removes the work without changing the call shape.

### Why this is not "premature optimization"

The string-comparison tax was already documented in prior FITL perf campaigns (see `campaigns/lessons-global.jsonl` entries from `fitl-perf-optimization`). It was deferred because the bigger wins were elsewhere. Spec 146 + Spec 147 close those bigger wins; Spec 148 closes the residual.

### Why this fits within F#17

F#17 mandates "distinct nominal types" for identifiers. Branded strings satisfy that at compile time. This spec adds a runtime numeric encoding behind the same brand types. The TypeScript types remain `ZoneId`, `ActionId`, etc.; the codec exposes `encode(domain, brandedId): number` for hot-path code that wants to compare integers. The brand-type compile-time safety is preserved; the runtime gains a fast-path option.

## Design

### D1. New types (in `kernel/id-codec.ts`)

```ts
export type IdDomain = 'zoneId' | 'actionId' | ...;

export interface IdCodec {
  encode(domain: IdDomain, id: string): number;
  decode(domain: IdDomain, code: number): string;
  isKnown(domain: IdDomain, id: string): boolean;
}

export const buildIdCodec = (def: GameDef): IdCodec;
```

`buildIdCodec` walks `def.zones`, `def.actions`, `def.seats`, etc., assigns dense small integers per domain, returns the codec.

### D2. Integration with GameDefRuntime

Add `idCodec: IdCodec` to `GameDefRuntime`. Build once per `createGameDefRuntime`. The codec is `sharedStructural` (same identity across forked runtimes for the same GameDef). Per F#17, the integer values are NOT part of any serialized artifact; they're a runtime-only acceleration.

### D3. Migration (kernel hot paths only)

For each migrated call site, replace `idA === idB` with `runtime.idCodec.encode('zoneId', idA) === runtime.idCodec.encode('zoneId', idB)` — but only at the COMPARISON LOOP level. The encode call is ALSO a Map lookup, so this is only a win if the comparison loop is hot enough that the encode-once amortizes over many comparisons.

The migration pattern:
```ts
// Before:
for (const move of moves) {
  for (const blacklisted of blacklist) {
    if (move.actionId === blacklisted) { ... }
  }
}

// After:
const encodedBlacklist = new Set(blacklist.map((id) => runtime.idCodec.encode('actionId', id)));
for (const move of moves) {
  const encodedMoveId = runtime.idCodec.encode('actionId', move.actionId);
  if (encodedBlacklist.has(encodedMoveId)) { ... }
}
```

Migrating call sites:
1. Enumerate-legal-moves blacklist check (`legal-moves.ts`).
2. Token-state-index keying (`token-state-index.ts`).
3. Zone-attribute / zone-var hot lookups (`eval-query.ts`).
4. Action-tag membership (`evaluateExpr` / `resolveRef`).
5. Decision-key matching (`microturn/apply.ts`).

Other call sites are deferred (cost-benefit not justified).

### D4. Codec correctness contract

The codec is an in-memory acceleration. Public APIs MUST continue to accept and return canonical string IDs:
- `enumerateLegalMoves(...).moves[i].actionId` returns a `string` (branded `ActionId`).
- `applyMove(def, state, move, ...)` accepts a `move.actionId: string`.
- Decision logs serialize string IDs.
- Replay artifacts contain string IDs.

The kernel internally encodes / decodes at API boundaries. Encoding is `idCodec.encode(domain, id)`; the encoded value is opaque to consumers.

### D5. Forking and run-isolation

Per Spec 141 (run-boundary contract), `GameDefRuntime` is forked per simulation run. The `idCodec` is `sharedStructural` (read-only), so it is shared across forks. No per-run reset needed.

### D6. ABI and determinism

- `idCodec` is added to `GameDefRuntime`. The `GameDefRuntime` interface gains one field.
- Per F#13 (Artifact Identity), the codec is NOT part of `gameDefHash` — it's a runtime-only artifact. Two runs of the same GameDef produce the same codec assignments by construction (identifiers are walked in canonical order per the existing GameDef compilation order), so no determinism issue arises.
- Per F#11, the codec is read-only after construction. No mutation through the GameDefRuntime contract.

## Acceptance Criteria

1. **Performance**: After Spec 146 + Spec 147 land, the residual `Builtin: StringEqual` + `Builtin: StringCompare` cost on the spec-145 perf corpus drops by ≥40% (the proportion attributable to id comparisons rather than content strings).
2. **Determinism**: Per-run encoding is deterministic — same GameDef compiles to same codec across N invocations. CI-tested via `idCodec.encode('zoneId', 'south-vietnam') === N` for fixed N across runs.
3. **No serialized leakage**: `JSON.stringify(state)` produces no integer-encoded ids; replay artifacts contain string ids; `gameDefHash` does not include codec values.
4. **Full gate**: `pnpm turbo test` passes.
5. **Profile evidence**: `Builtin: StringEqual` self-time drops, with `Builtin: SMIComparison` rising commensurately (or remaining baseline-low if V8 inlines the integer comparison entirely).

## Risks

- **Migration scope creep**: Touching every kernel hot-path comparison is a wide diff. Mitigated by gating migration on per-call-site profile evidence; the spec narrows to call sites that show ≥0.2% in the bottom-up profile.
- **V8 deopt from adding a field to `GameDefRuntime`**: per the cumulative lesson "Adding ANY new field to EffectCursor or GameDefRuntime interfaces causes V8 hidden class deoptimization (4-7% regression)". Mitigated by treating the codec as a top-level runtime field constructed once at `createGameDefRuntime`; the runtime's hidden class stabilizes immediately. The risk is real and the spec acceptance MUST verify no global regression in the existing perf corpus.
- **Cost-benefit may shift after Spec 146 + 147**: With those specs landing, the residual string-cost share may be smaller. The acceptance criteria are conditional on the post-146/147 profile.

## Out Of Scope

- Spec 146 (drive-batched preview completion).
- Spec 147 (AOT consideration AST compilation).
- Removal of branded string types from public APIs.
- Persistence of encoded ids in serialized artifacts.
- Cross-game codec sharing (each `GameDef` gets its own codec).
