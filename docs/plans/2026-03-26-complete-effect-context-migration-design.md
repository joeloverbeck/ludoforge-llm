# Complete Effect Context Migration — Design

**Date**: 2026-03-26
**Spec**: 85
**Ticket namespace**: 85COMEFFCONMIG

## Summary

Eliminate all 28 `fromEnvAndCursor` call sites across 7 effect handler files, completing the Spec 77 `EffectContext` -> `EffectEnv` + `EffectCursor` migration. Replace with `mergeToReadContext` (13-field spread) or `mergeToEvalContext` (13 fields + binding resolution), and use inline pick objects (~4 fields) for trace functions. Remove `fromEnvAndCursor` from the codebase.

## Approach

**One ticket per file**, ordered smallest-to-largest for incremental validation. Two prerequisite tickets widen downstream signatures before handler migration begins.

## Ticket List

| Ticket | Phase | File | Sites | Effort |
|--------|-------|------|-------|--------|
| -001 | Signatures | scoped-var-runtime-access.ts | 0 (prep) | Small |
| -002 | Signatures | effects-choice.ts | 0 (prep) | Small |
| -003 | Migration | effects-binding.ts | 1 | Small |
| -004 | Migration | effects-reveal.ts | 2 | Small |
| -005 | Migration | effects-subset.ts | 2 | Small |
| -006 | Migration | effects-var.ts | 3 | Medium |
| -007 | Migration | effects-resource.ts | 2 | Medium |
| -008 | Migration | effects-choice.ts | 8 | Medium |
| -009 | Migration | effects-token.ts | 10 | Medium |
| -010 | Cleanup | effect-context.ts + imports | 0 (removal) | Small |

## Dependency Graph

```
001 ──┬── 003, 004, 005, 009 (need widened scoped-var sigs)
      ├── 006, 007 (need widened sigs + mode param)
002 ──┴── 008 (needs widened resolveChoiceDecisionPlayer)
003-009 ── 010 (cleanup after all sites migrated)
```

## Key Patterns

1. **Eval calls**: `fromEnvAndCursor(env, cursor)` -> `mergeToReadContext(env, cursor)` or `mergeToEvalContext(env, cursor)`
2. **Scoped endpoint calls**: Pass `ReadContext` + explicit `env.mode` parameter
3. **Trace calls**: Inline pick `{ collector, state, traceContext, effectPath }` from env + cursor
4. **Variable definition lookup**: Pass `{ def: env.def }` (narrowest type)

## V8 JIT Safety

All changes are V8-safe per FITL perf campaign findings:
- Type widening is compile-time only (identical runtime objects)
- `mergeToReadContext` already used in 6 sites in `effects-control.ts`
- No new fields added to hot-path interfaces
- No import aliasing, no function body enlargement, no branch reordering

## Foundations Alignment

- **F1**: No game-specific changes
- **F5**: Determinism parity (same computation, fewer intermediates)
- **F7**: Scoped mutation exception unaffected
- **F9**: `fromEnvAndCursor` removed outright, not deprecated
- **F10**: Completes Spec 77 migration
