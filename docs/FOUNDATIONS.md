# Foundations

Architectural commandments for LudoForge-LLM. Every spec, ticket, and implementation must align with these principles.

---

## 1. Engine Agnosticism

**The kernel, compiler, and runtime SHALL NOT contain game-specific logic.**

All game behavior is encoded in GameSpecDoc YAML and compiled to GameDef JSON. The engine is a universal interpreter — it executes any well-formed GameDef without knowing what game it represents. No hardcoded game-specific identifiers, branches, rule handlers, map definitions, scenario setup, or card payloads in engine code.

## 2. Evolution-First Design

**Evolution mutates YAML only. All rule-authoritative game data required to compile and execute the rules MUST be representable inside GameSpecDoc YAML.**

The system exists so LLMs can evolve board games through optimization. GameSpecDoc is the unit of evolution — embedded `dataAssets` with `id`/`kind`/`payload` carry all semantics-affecting game content. Visual presentation, batch orchestration, and analytics configuration live in separate artifacts. If a datum can change legal actions, state transitions, observability, scoring, or terminal conditions, it belongs in GameSpecDoc.

## 3. Visual Separation

**Game-specific visual presentation data SHALL live in `visual-config.yaml`, not in GameSpecDoc or the engine.**

GameSpecDoc contains rule-authoritative data only. The `visual-config.yaml` file in each game's `data/games/<game>/` directory contains presentation data only: layout, colors, shapes, token visuals, zone styles, animation config, and UI affordance hints. `visual-config.yaml` MUST NOT define legality, hidden-information policy, state transitions, or any other rule-authoritative behavior. The runner consumes visual config through `VisualConfigProvider` — a query-based projection layer over kernel state, not a second rules engine.

## 4. Authoritative State and Observer Views

**The kernel owns one authoritative state; players, agents, and runners consume projections of that state according to visibility rules encoded in the spec.**

Hidden and private information are first-class semantic concerns. Hands, decks, face-down pieces, secret objectives, simultaneous selections, and masked outcomes MUST be modelable without ad hoc game code or UI-only filtering. Non-omniscient runners and agents MUST NOT inspect full state except in explicit omniscient analysis modes.

## 5. One Rules Protocol, Many Clients

**The simulator, web runner, and AI agents MUST all use the same action, legality, and event protocol.**

The kernel is the single source of truth for legal actions and state transitions. UI gestures map to generic actions; agents choose from the same legal action set; simulations advance through the same apply-action pipeline. No UI-only rule paths, no simulation-only shortcuts, and no duplicated legality logic outside the kernel.

**Constructibility clause**: Every client-visible legal action is directly executable at its microturn scope. Client-side search, template completion, or completion certificates are not part of the legality contract. Each microturn publishes a finite list of atomic decisions; selecting any decision is sufficient to advance kernel state.

## 6. Schema Ownership Stays Generic

**Payload schema and type contracts in shared compiler/kernel schemas MUST remain generic. No per-game schema files.**

Do not create schema files that define one game's structure as a required execution contract. Game-specific structure is expressed through GameSpecDoc's generic `dataAssets` mechanism, not through dedicated type definitions.

## 7. Specs Are Data, Not Code

**Game specs are declarative data, never executable code.**

No `eval`, embedded scripts, runtime callbacks, plugin hooks, or arbitrary code generation inside GameSpecDoc, GameDef, visual config, or experiment artifacts. All extensibility must come through generic DSL constructs, compiler macros that lower to generic AST, or engine changes justified across multiple games. A spec must be safe to compile and run in untrusted environments.

## 8. Determinism Is Sacred

**Same GameDef + same initial state + same seed + same actions = identical result. Always. No exceptions.**

The kernel is a pure, deterministic state machine. PRNG state lives in GameState and uses a specified exact algorithm. Execution MUST NOT depend on wall-clock time, system locale, object key order, hash-map/set iteration order, or any other ambient process state. All rule-authoritative numeric operations MUST be exact. Today that means integers only, with division defined as `Math.trunc`; any future expansion of the numeric domain must preserve exactness and determinism. State serialization round-trips must be canonical and bit-identical. Hashes accelerate comparison; canonical serialized state remains the source of truth for equality.

## 9. Replay, Telemetry, and Auditability

**Every state transition MUST produce a structured, deterministic event record suitable for replay, debugging, and analytics.**

The event stream, together with canonical snapshots when needed, must be sufficient to reconstruct games, drive the runner, explain outcomes, and compute statistics at scale. Analytics and fitness evaluation should consume generic events and state queries, not bespoke per-game instrumentation in engine code.

## 10. Bounded Computation

**All iteration MUST be bounded. No general recursion. All choices MUST be finite and enumerable.**

`forEach` operates over finite collections. `repeat N` uses compile-time or validated runtime bounds. Trigger chains, reaction windows, and similar cascades are capped by configurable budgets. The kernel must finitely enumerate the current executable decision frontier in stable deterministic order. A compound human-visible turn is modeled as a bounded sequence of kernel-owned decision states (microturns), each of which exposes atomic legal actions only. Mechanics emerge from composition of a small instruction set, not bespoke primitives.

## 11. Immutability

**All state transitions MUST return new objects. Never mutate.**

Kernel effect handlers receive state and return new state. Use spread operators and immutable update patterns. The previous state is never modified — this enables determinism verification, undo/replay, and safe parallel reasoning about state.

**Exception — Scoped internal mutation**: Within a single synchronous effect-execution scope, the kernel MAY use a private draft state or copy-on-write working state for performance. That working state MUST be fully isolated from caller-visible state: no shared mutable descendants, no aliasing that can leak outside the scope, and no observation before finalization. The external contract remains `applyMove(state) -> newState`, where the input `state` is never modified. This guarantee MUST be enforced by regression tests.

## 12. Compiler-Kernel Validation Boundary

**The compiler validates everything knowable from the spec alone. The kernel validates only state-dependent semantics and runtime invariants.**

The compiler is responsible for YAML syntax, field presence, reference resolution, macro expansion, static typing, effect/condition/value-expression arity and shape checks, boundedness checks, and any semantic constraint derivable without executing the game. The kernel is responsible for validating state-dependent preconditions, action legality in a concrete state, observability constraints, budget exhaustion, and runtime contract enforcement. Specs that can be proven invalid at compile time MUST fail compilation.

## 13. Artifact Identity and Reproducibility

**Every compiled artifact, replay, and experiment result MUST carry enough identity to reproduce it exactly.**

At minimum record the GameSpec hash, GameDef hash, compiler version, kernel version, scenario identifier or hash, and seed set. Historical runs are only meaningful if they can be tied back to the exact rules and binaries that produced them.

## 14. No Backwards Compatibility

**Do not keep compatibility shims in production code. When a change breaks existing contracts, migrate all owned artifacts in the same change and test thoroughly.**

No alias paths, deprecated fallbacks, compatibility wrappers, or `_legacy` suffixes in runtime or compiler code. If a refactor changes an interface or schema, every repository-owned GameSpecDoc, GameDef, visual config, fixture, replay, and test is updated in the same change. Unused code is deleted, not commented out. Historical experiments must remain reproducible via migrated snapshots or explicit version pinning; reproducibility is non-negotiable even when compatibility layers are forbidden.

## 15. Architectural Completeness

**Every change MUST be architecturally comprehensive. No hacks, no patches, no shortcuts.**

Solutions address root causes, not symptoms. If a problem reveals a design gap, the design is fixed — not papered over with a workaround. Specs and tickets must propose complete solutions that integrate cleanly with existing architecture.

## 16. Testing as Proof

**Architectural properties MUST be proven through automated tests, not assumed.**

Compiler determinism is proven by compiling the same GameSpecDoc twice and asserting byte-identical GameDef. Runtime determinism is proven by replay tests that assert canonical serialized state equality for the same GameDef, initial state, seed, and actions; hashes may be used as accelerators or diagnostics, not as the sole oracle. Correctness is proven by golden tests. Robustness is proven by property tests and long-run simulation fuzzing. Game-agnosticism is proven by a conformance corpus spanning materially different game families: at minimum one perfect-information board game, one hidden-information card game, one stochastic game, and one asymmetric or phase-heavy game. Bugs are fixed through TDD: write the failing test first, then fix the code. Never adapt tests to preserve a bug.

## 17. Strongly Typed Domain Identifiers

**Domain identifiers (ZoneId, PlayerId, ActionId, TokenTypeId, etc.) MUST be represented as distinct nominal types in implementation code, not interchangeable raw strings.**

In TypeScript, this means branded types. The kernel validates identifier construction at runtime. Serialized YAML and JSON artifacts continue to use canonical string representations. This eliminates an entire class of bugs where identifiers from different domains are accidentally interchanged.

## 18. Constructibility Is Part of Legality

**A move is not legal for clients unless it is constructible under the kernel's bounded deterministic rules protocol. Existence without a construction artifact is insufficient.**

Legality and constructibility are a single property exposed by a single kernel artifact. Every kernel-published legal action is constructible atomically at its microturn scope. No client-side search, no template completion, no satisfiability verdict distinct from publication, no `unknown` legal actions. The microturn publication pipeline is the single kernel artifact that establishes legality and executability; they cannot diverge.

## 19. Decision-Granularity Uniformity

**Every kernel-visible decision is atomic. Compound human-visible turns emerge from decision sequences grouped by `turnId`, not from templates or pre-declared compound shapes.**

Player agents and chance / kernel agents operate under the same microturn protocol; the only distinction is who decides. Player decisions require agent consultation; chance decisions resolve via the authoritative RNG; kernel-owned decisions (outcome grants, turn retirement) resolve via deterministic kernel rules. No compound shape is ever exposed as a legal action. No grammar layer in the kernel or runtime ever aggregates multiple kernel decisions into a single client-visible unit except for analytics-side summaries (`compoundTurns[]`), which are derived post-hoc from `decisions[]` and never authoritative.

---

## Appendix: Determinism Proofs vs. Profile-Quality Witnesses

The determinism commandment (#8) is proven by the `packages/engine/test/determinism/` corpus: every test there asserts only engine-level invariants such as replay identity and bounded execution. Failures in that corpus are engine bugs and block CI.

Convergence claims tied to a specific policy-profile variant are not engine invariants. They are quality signals for the profile maintainer, and they live in `packages/engine/test/policy-profile-quality/`, not in `determinism/`. Failures there emit `POLICY_PROFILE_QUALITY_REGRESSION` warnings and a non-blocking CI summary rather than a blocking determinism failure.

The distinction is architectural, not rhetorical: mixing determinism proof with profile-quality witness claims reintroduces the dual-duty anti-pattern that Spec 136 and Spec 139 were written to eliminate. Spec 140 amended Foundations #5, #10, and #18, and added Foundation #19, to formalize the microturn-native decision protocol. Spec 139's certificate-carrying contract (the prior iteration of #18) is retired.
