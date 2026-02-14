# ARCHGSD-011 - Macro Expansion Source Map Fidelity

**Status**: ✅ COMPLETED  
**Priority**: P1  
**Type**: Architecture / Tooling Correctness  
**Depends on**: none (self-contained in current repo state)

## Why this ticket exists
Macro diagnostics currently rely heavily on synthesized expansion paths. For large games/specs, debugging requires stable traceability from expanded nodes back to author YAML/markdown origins.

## Assumptions Reassessed (2026-02-14)
- `ARCHGSD-010` is not present in `tickets/` or `archive/`; this ticket must be independently implementable.
- `Diagnostic` currently has no structured source-origin metadata (only `path` + message/suggestion fields).
- Effect macro expansion emits synthetic expansion paths (`setup[...][macro:...]...`) that are not guaranteed to resolve through `GameSpecSourceMap.byPath`.
- Existing `test/integration/effect-macro-compile.test.ts` mostly compiles direct in-memory `GameSpecDoc`; it does not currently prove markdown/YAML source-map fidelity.
- Existing `test/unit/compiler-diagnostics.test.ts` validates deterministic sorting against `sourceMap` lookups by `path`, not macro declaration/invocation provenance.

## 1) Specification (what must change)
- Add structured diagnostic provenance for macro-origin failures:
  - invocation site path/span (call site),
  - declaration site path/span (macro/param definition),
  - expanded site path (where failure surfaced after expansion).
- Preserve current `path` semantics as the primary machine anchor while adding provenance metadata (no alias-only model).
- Propagate provenance deterministically through:
  - substituted params,
  - rewritten binder declarations/references,
  - nested macro expansions.
- Keep deterministic sorting/dedup behavior unchanged unless provenance is included in dedupe identity by design.
- When provenance is representable, emit structured metadata instead of encoding origin solely in free-text suggestion strings.

## 2) Invariants (must remain true)
- Diagnostics remain deterministic and stable across repeated compiles.
- Source mapping does not alter runtime semantics or expansion output.
- Mapping works uniformly across setup/actions/triggers/actionPipelines.

## 3) Tests to add/modify
## Modify tests
- `test/unit/compiler-diagnostics.test.ts`
  - include assertions for deterministic sort/dedupe behavior when diagnostics carry macro provenance metadata.
- `test/unit/expand-effect-macros.test.ts`
  - verify macro diagnostics include structured invocation/declaration provenance for constraint failures and nested expansion failures.
- `test/integration/effect-macro-compile.test.ts`
  - add nested macro failure case asserting deterministic declaration + invocation provenance in compile diagnostics.

## New tests
- `test/integration/compile-pipeline.test.ts` (or dedicated integration test file if cleaner)
  - parse markdown to produce `sourceMap`, compile with `sourceMap`, and assert provenance spans resolve deterministically for macro declaration + invocation.

## Scope boundaries
- In scope:
  - Diagnostic type/schema evolution required for provenance metadata.
  - Macro expander + compile pipeline plumbing for provenance attachment.
  - Deterministic behavior and coverage across nested macro expansion.
- Out of scope:
  - Broad parser source-map redesign unrelated to macro expansion.
  - Non-macro diagnostic provenance retrofits outside touched call paths.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm test`

## Outcome
- Completion date: 2026-02-14
- What changed:
  - Added structured macro provenance metadata to diagnostics (`macroOrigin` with invocation/declaration/expanded pointers and optional source spans).
  - Propagated provenance through macro expansion diagnostics (constraint violations, declaration markers, unknown/cycle/depth/missing/extra args, hygiene leak/template failures).
  - Canonicalized macro declaration diagnostic paths to index-based paths (`effectMacros[<index>]...`) so source-map resolution is deterministic.
  - Extended compiler diagnostic processing to annotate provenance pointers with source-map spans and to resolve macro-expanded synthetic paths back to nearest anchored source-map parents.
  - Updated deterministic dedupe identity to include macro provenance metadata.
- Test coverage added/strengthened:
  - `test/unit/compiler-diagnostics.test.ts` (provenance-aware dedupe, provenance span annotation, macro-expanded path source resolution).
  - `test/unit/expand-effect-macros.test.ts` (provenance assertions for constraint and nested template-leak diagnostics).
  - `test/integration/effect-macro-compile.test.ts` (markdown parse + compile with sourceMap; deterministic declaration/invocation provenance with spans for nested macro failure).
- Deviations from original plan:
  - Used `test/integration/effect-macro-compile.test.ts` for parse+sourceMap provenance integration coverage instead of adding a separate `compile-pipeline` integration file, to keep coverage close to macro behavior ownership.
- Verification:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm test` passed.
