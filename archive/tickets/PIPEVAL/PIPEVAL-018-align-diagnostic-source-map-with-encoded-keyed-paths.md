# PIPEVAL-018: Align diagnostic source-map resolution with encoded keyed paths

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — CNL parser/source-map path anchoring + diagnostic source lookup path traversal for keyed segments
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-016-harden-named-set-collision-diagnostic-path-encoding.md`

## Problem

Named-set diagnostics now emit bracket-quoted keyed paths (for example `doc.metadata.namedSets["insurgent.group[0]"]`), but parser source-map anchors still serialize object keys with raw dot concatenation (`metadata.namedSets.insurgent.group[0]`). In addition, diagnostic source lookup parent traversal treats trailing `]` as a generic bracket segment and can trim inside quoted keyed segments. This breaks representation consistency and makes keyed source-path lookup brittle.

## Assumption Reassessment (2026-03-05)

1. `collectAnchoredPaths(...)` in `packages/engine/src/cnl/parser.ts` currently emits object child paths via `${path}.${key}` for all keys, including path-significant keys.
2. `resolveSpanForDiagnosticPath(...)` in `packages/engine/src/cnl/diagnostic-source-map.ts` currently depends on ad-hoc candidate transforms and uses `trimLastPathSegment(...)` logic that is not quote-aware for bracket-quoted keyed segments.
3. Existing tests validate encoded named-set diagnostic paths, but do not directly lock source-map lookup behavior for bracket-quoted keyed paths.
4. Correction to prior wording: source-map spans are block-granularity today; this ticket targets keyed path identity/alignment and deterministic lookup behavior at that granularity (not sub-key line/column precision).

## Architecture Check

1. A single keyed-path contract between diagnostic paths and parser source-map anchors is cleaner and more extensible than relying on lossy path-candidate heuristics.
2. Quote-aware path-segment traversal is a foundational invariant for diagnostics and avoids key-shape-specific breakage as keyed diagnostics expand beyond `namedSets`.
3. This change remains compiler/validator diagnostics infrastructure only and preserves game-agnostic engine boundaries.
4. No backwards-compatibility alias pathing or shim behavior is introduced.

## What to Change

### 1. Normalize parser source-map object-key path encoding

Update parser path anchoring for object keys to emit bracket-quoted keyed segments when keys are path-significant so keyed diagnostics and source-map anchors share one representation.

### 2. Harden diagnostic source lookup for keyed-segment traversal

Update `diagnostic-source-map` candidate construction and parent traversal to correctly handle bracket-quoted keyed segments and macro-segment stripping without trimming through quoted key content.

### 3. Add explicit keyed source-map lookup tests

Add tests that prove keyed diagnostic paths resolve source spans from encoded keyed anchors and that parent traversal remains deterministic for keyed segments.

## Files to Touch

- `packages/engine/src/cnl/parser.ts` (modify)
- `packages/engine/src/cnl/diagnostic-source-map.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/src/cnl/path-utils.ts` (add)
- `packages/engine/test/unit/parser.test.ts` (modify)
- `packages/engine/test/unit/compiler-diagnostics.test.ts` (modify)
- `packages/engine/test/unit/path-utils.test.ts` (add)

## Out of Scope

- Named-set canonicalization semantic changes (`trim + NFC`)
- Runtime/simulator/kernel behavior changes
- Any visual-config.yaml behavior
- Source-map span granularity refactor beyond current block-level contract

## Acceptance Criteria

### Tests That Must Pass

1. Parser source-map anchors emit encoded keyed object segments for path-significant keys.
2. Diagnostics targeting encoded keyed paths resolve source spans from sourceMap deterministically (including parent traversal where direct leaf span is unavailable).
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. Diagnostic path rendering and source-map lookup stay representation-consistent for keyed object segments.
2. GameDef/runtime/simulation remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/parser.test.ts` — verify parser source-map keyed anchors use bracket-quoted encoding for path-significant object keys.
2. `packages/engine/test/unit/compiler-diagnostics.test.ts` — verify deterministic source lookup/sort for encoded keyed diagnostic paths and keyed parent fallback behavior.
3. `packages/engine/test/unit/path-utils.test.ts` — verify shared path normalization/segmentation contracts (dot/bracket index normalization, keyed-segment parsing, parent trimming).

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/parser.test.js packages/engine/dist/test/unit/compiler-diagnostics.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`

## Outcome

- Parser source-map anchoring now emits bracket-quoted keyed segments for path-significant object keys instead of raw dot-concatenated keys.
- Diagnostic source-map lookup now uses quote-aware path segment parsing for parent traversal, preventing trims through quoted keyed content.
- Tests were added in `parser.test.ts` and `compiler-diagnostics.test.ts` to lock keyed anchor encoding and keyed parent fallback lookup behavior.
- Scope executed as reassessed: `compiler-api.test.ts` and `validate-spec.test.ts` were not modified because keyed source-map lookup behavior is owned and verified more directly at parser + compiler-diagnostics boundaries.
- Additional architecture hardening completed: shared path logic was centralized into `packages/engine/src/cnl/path-utils.ts` and reused by parser, compiler-core, and diagnostic-source-map to remove duplicated implementations and prevent path-contract drift.
- Added `packages/engine/test/unit/path-utils.test.ts` to lock the shared path contract directly.
