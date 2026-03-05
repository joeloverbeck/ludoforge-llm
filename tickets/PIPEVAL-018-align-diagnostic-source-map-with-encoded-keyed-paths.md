# PIPEVAL-018: Align diagnostic source-map resolution with encoded keyed paths

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — CNL parser/source-map path anchoring + diagnostic source lookup compatibility
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-016-harden-named-set-collision-diagnostic-path-encoding.md`

## Problem

Named-set diagnostics now use bracket-quoted keyed path segments (for example `doc.metadata.namedSets["insurgent.group[0]"]`), but parser source-map anchors and source lookup candidate transforms still primarily assume dot-concatenated object key paths. This can degrade key-level source-span resolution and ordering precision for diagnostics involving path-significant authored keys.

## Assumption Reassessment (2026-03-05)

1. Parser source-map anchoring currently builds object child paths using raw dot-concatenated keys (`${path}.${key}`), including keys with path-significant characters.
2. `resolveSpanForDiagnosticPath(...)` candidate construction currently normalizes numeric dot segments to brackets but does not provide a canonical decode path from bracket-quoted keyed segments to parser anchor form.
3. Mismatch correction: parser anchoring and diagnostic source lookup must share one keyed-path representation so encoded keyed diagnostics resolve directly to exact source spans instead of parent fallback.

## Architecture Check

1. Aligning source-map anchoring and lookup on one keyed-path representation is cleaner and more robust than adding more ad-hoc candidate transforms.
2. The change is infrastructure-only and preserves GameSpecDoc as game-specific input data while keeping GameDef/runtime/simulator/kernel fully game-agnostic.
3. No backwards-compatibility alias pathing or shim behavior is introduced.

## What to Change

### 1. Normalize parser source-map object-key path encoding

Update parser path anchoring for object keys to emit the same encoded keyed-segment contract used by diagnostics when keys are path-significant.

### 2. Update diagnostic source lookup candidate generation

Make `diagnostic-source-map` candidate generation and parent traversal compatible with encoded keyed segments and ensure exact keyed diagnostics map to keyed spans.

### 3. Add explicit source-map fidelity tests for keyed diagnostics

Add tests proving keyed named-set diagnostics with path-significant ids resolve to exact keyed source spans and maintain deterministic ordering when sourceMap is provided.

## Files to Touch

- `packages/engine/src/cnl/parser.ts` (modify)
- `packages/engine/src/cnl/diagnostic-source-map.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify, if needed to reuse shared path helpers)
- `packages/engine/test/unit/parser.test.ts` (modify)
- `packages/engine/test/unit/compiler-api.test.ts` (modify)
- `packages/engine/test/unit/validate-spec.test.ts` (modify)

## Out of Scope

- Named-set canonicalization semantic changes (`trim + NFC`)
- Runtime/simulator/kernel behavior changes
- Any visual-config.yaml behavior

## Acceptance Criteria

### Tests That Must Pass

1. Diagnostics for keyed metadata namedSets entries with path-significant ids resolve to exact keyed source spans when sourceMap is provided.
2. Parser/source-map path anchors and diagnostic path candidates are representation-aligned for keyed object paths.
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. Diagnostic path rendering and source-map lookup stay representation-consistent for keyed object segments.
2. GameDef/runtime/simulation remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/parser.test.ts` — verify keyed path anchoring for object keys containing path-significant characters.
2. `packages/engine/test/unit/compiler-api.test.ts` — verify compile diagnostics with sourceMap preserve keyed-path-to-span fidelity.
3. `packages/engine/test/unit/validate-spec.test.ts` — verify validator keyed diagnostics align with keyed source-map spans.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/parser.test.js packages/engine/dist/test/unit/compiler-api.test.js packages/engine/dist/test/unit/validate-spec.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`
