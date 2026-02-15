# GAMEDEFGEN-011: Unified Selector Contract Registry Across Compiler and Kernel

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Medium

## 1) What To Fix / Add

1. Introduce a single, game-agnostic selector contract registry in `src/` that defines selector rules by surface/role (for example action actor, action executor, and future selector surfaces).
2. Make compiler lowering and cross-validation consume this registry rather than duplicating selector constraints in multiple modules.
3. Thread registry-backed metadata into runtime preflight checks so compile-time and runtime selector contracts cannot drift.
4. Preserve strict/no-alias semantics: exact selector and binding forms only.

## 2) Invariants That Should Pass

1. A selector rule is declared once and enforced consistently across compile-time and runtime surfaces.
2. Contract updates in one place change behavior deterministically across all participating modules.
3. No game-specific logic is introduced; registry remains generic and reusable.
4. Diagnostics (code/path/message/suggestion) remain deterministic and stable.

## 3) Tests That Should Pass

1. Unit: registry contract definitions validate expected role constraints (scalar vs multi, binding-allowed, etc.).
2. Unit: compiler + cross-validator emit matching diagnostics for identical selector violations.
3. Unit/integration: kernel preflight/runtime behavior aligns with compiler acceptance/rejection matrix.
4. Regression: existing valid GameSpecDoc fixtures compile and execute unchanged.
