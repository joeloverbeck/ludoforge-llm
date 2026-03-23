# Foundations

Architectural commandments for LudoForge-LLM. Every spec, ticket, and implementation must align with these principles.

---

## 1. Engine Agnosticism

**The kernel, compiler, and runtime SHALL NOT contain game-specific logic.**

All game behavior is encoded in GameSpecDoc YAML and compiled to GameDef JSON. The engine is a universal interpreter — it executes any well-formed GameDef without knowing what game it represents. No hardcoded game-specific identifiers, branches, rule handlers, map definitions, scenario setup, or card payloads in engine code.

## 2. Evolution-First Design

**Evolution mutates YAML only. All game data required to compile and execute a game MUST be representable inside GameSpecDoc YAML.**

The system exists so LLMs can evolve board games through optimization. GameSpecDoc is the unit of evolution — embedded `dataAssets` with `id`/`kind`/`payload` carry all game content. If it can't be expressed in YAML, it can't be evolved.

## 3. Visual Separation

**Game-specific visual presentation data SHALL live in `visual-config.yaml`, not in GameSpecDoc or the engine.**

GameSpecDoc files contain game-specific data not related to visual presentation. The `visual-config.yaml` file in each game's `data/games/<game>/` directory contains all presentation data (layout, colors, shapes, token visuals, zone styles, animation config). The runner consumes visual config through `VisualConfigProvider` — a query-based API that resolves visuals generically without knowing which game it serves.

## 4. Schema Ownership Stays Generic

**Payload schema and type contracts in shared compiler/kernel schemas MUST remain generic. No per-game schema files.**

Do not create schema files that define one game's structure as a required execution contract. Game-specific structure is expressed through GameSpecDoc's generic `dataAssets` mechanism, not through dedicated type definitions.

## 5. Determinism Is Sacred

**Same seed + same actions = identical result. Always. No exceptions.**

The kernel is a pure, deterministic state machine. PRNG state lives in GameState (PCG-DXSM-128, bigint arithmetic). No floating-point math — all game values are integers, division uses `Math.trunc`. State serialization round-trips must be bit-identical. Zobrist hashing enables efficient state comparison.

## 6. Bounded Computation

**All iteration MUST be bounded. No general recursion. All choices MUST be finite and enumerable.**

`forEach` operates over finite collections. `repeat N` uses compile-time bounds. Trigger chains are capped at depth K (`maxTriggerDepth`, default 5). Legal moves must be listable — no free-text moves, no unbounded generation. Mechanics emerge from composition of a small instruction set, not bespoke primitives.

## 7. Immutability

**All state transitions MUST return new objects. Never mutate.**

Kernel effect handlers receive state and return new state. Use spread operators and immutable update patterns. The previous state is never modified — this enables determinism verification, undo/replay, and safe parallel reasoning about state.

**Exception — Scoped internal mutation**: Within a single synchronous effect-execution scope (e.g., `applyEffectsWithBudgetState`), effect handlers MAY mutate a working copy of the state for performance. The working copy is created at scope entry (shallow clone) and is not observable by external code. The external contract is preserved: `applyMove(state) → newState` where the input `state` is never modified.

## 8. Compiler-Kernel Validation Boundary

**The compiler validates structure and references. The kernel validates behavior and semantics.**

The compiler (CNL) is responsible for YAML syntax, field presence, reference resolution, macro expansion, and spec-level constraints. The kernel is responsible for effect AST semantics, condition arity, value expression type safety, and runtime contract enforcement. Neither layer encroaches on the other's responsibilities.

## 9. No Backwards Compatibility

**When a change breaks existing contracts, fix all breaks and test thoroughly. No alias paths, no shims, no deprecated fallbacks.**

Do not maintain compatibility layers, re-export aliases, or `_legacy` suffixes. If a refactor changes an interface, every consumer is updated in the same change. Unused code is deleted, not commented out. The codebase reflects current truth, not historical archaeology.

## 10. Architectural Completeness

**Every change MUST be architecturally comprehensive. No hacks, no patches, no shortcuts.**

Solutions address root causes, not symptoms. If a problem reveals a design gap, the design is fixed — not papered over with a workaround. Specs and tickets must propose complete solutions that integrate cleanly with existing architecture. The 1-3-1 rule applies when blocked: 1 problem, 3 options, 1 recommendation — then wait for confirmation.

## 11. Testing as Proof

**Architectural properties MUST be proven through automated tests, not assumed.**

Determinism is proven by determinism tests (same seed + same actions = identical state hash). Correctness is proven by golden tests (known input to expected output). Robustness is proven by property tests (random play for N turns, no crashes, no invalid states). Game-agnosticism is proven by compiling and running multiple games (FITL, Texas Hold'em). Bugs are fixed through TDD: write the failing test first, then fix the code. Never adapt tests to match bugs.

## 12. Branded Types Over Strings

**Domain identifiers (ZoneId, PlayerId, ActionId, TokenTypeId, etc.) MUST use branded types, not raw strings.**

Branded types prevent accidental ID mixing at compile time. The kernel validates branded construction at runtime. This eliminates an entire class of bugs where IDs from different domains are accidentally interchanged.
