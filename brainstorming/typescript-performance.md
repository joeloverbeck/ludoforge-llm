Yes — but not by “compiling TypeScript” in the way you probably want.

The serious browser options are:

1. **WebAssembly hot kernels**  
    Write the expensive inner loop in **Rust, C/C++, Zig, or AssemblyScript**, compile it to WASM, and call it from your TypeScript app. WebAssembly is the browser-native route for near-native compiled code, and is explicitly designed as a compilation target for languages like C/C++ and Rust.  
2. **Web Workers / worker pools**  
    Move AI search/evaluation off the UI thread. This does not make computation faster by itself, but it prevents the browser from freezing, and lets you use parallelism. Web Workers run scripts in background threads separate from the main UI thread.  
3. **WASM + workers + SharedArrayBuffer**  
    This is the serious “AI engine in the browser” setup: one main TS UI thread, one or more workers running WASM, and shared/transferred typed-array state. Shared memory via `SharedArrayBuffer` is available when the page is cross-origin isolated.  
4. **WebGPU compute**, but only for very parallel work  
    WebGPU can run high-performance general-purpose GPU computation in the browser, but it is best for thousands/millions of similar independent evaluations, not branch-heavy symbolic policy logic.

My blunt recommendation: **do not try to compile your whole TypeScript engine.** That will likely be a waste of time. Keep the orchestration, game definition loading, UI, debugging, logging, and policy authoring in TypeScript. Move only the “brutal loop” into a lower-level representation.

For a game-agnostic card/board engine, the best targets are usually:

* legal action enumeration  
* action scoring  
* rollout / simulation loops  
* `chooseN` combinatorics  
* state cloning / apply / undo  
* heuristic feature extraction  
* policy DSL evaluation  
* transposition table lookup  
* bitset operations  
* Monte Carlo playout batches

The key is that WASM likes **flat numeric data**, not rich JS object graphs. A `WebAssembly.Memory` is basically raw bytes exposed through an `ArrayBuffer`/`SharedArrayBuffer`; both JS and WASM can access it, but you should think in terms of typed arrays, offsets, IDs, enums, bitsets, and compact structs.

The shape I’d use for your engine:

TypeScript browser app  
 - UI  
 - game definition loading  
 - debug traces  
 - policy authoring  
 - human-readable action explanations  
 - orchestration

Compiled AI worker  
 - receives compact state buffer  
 - receives compact legal-action/action-template buffer  
 - runs policy/search/evaluation loop  
 - returns best action ID + scores + optional trace

Or, more concretely:

GameSpecDoc / policy DSL  
       ↓  
TypeScript compiler phase  
       ↓  
Compact bytecode / opcodes / tables  
       ↓  
WASM policy VM or generated WASM-friendly evaluator  
       ↓  
Worker pool evaluates thousands of candidates  
       ↓  
TS receives best move + explanation payload

For language choice:

| Option | Use when | My view |
| ----- | ----- | ----- |
| **Rust → WASM** | You want performance, safety, decent tooling, strong data modeling | Best default |
| **C/C++ → WASM via Emscripten** | You already have C/C++ code or want absolute control | Powerful, heavier toolchain |
| **AssemblyScript** | You want TS-like syntax and are willing to obey WASM-ish constraints | Tempting, but not “real TypeScript” |
| **Zig → WASM** | You like low-level simplicity and manual control | Good, but smaller ecosystem |
| **WebGPU** | You can batch huge numbers of uniform evaluations | Specialist weapon, not first move |

AssemblyScript is probably the most seductive option because it looks like TypeScript, but it is really a **TypeScript-like language targeting WebAssembly**, not a magical compiler for arbitrary TS. Its own docs distinguish normal TypeScript, which transpiles to dynamic JS, from AssemblyScript, which compiles to a static WASM binary.

For Rust, the standard path is `wasm-bindgen` / `wasm-pack`, exposing a small API to JS/TS. The Rust+WASM book is specifically aimed at compiling Rust to WebAssembly for web use.

For C/C++, Emscripten is the usual browser toolchain; it compiles C/C++ to WebAssembly and targets browser execution.

The biggest performance trap is crossing the JS↔WASM boundary too often. Do **not** do this:

for (const action of legalActions) {  
 const score = wasm.scoreAction(state, action);  
}

Do this instead:

const result = wasm.scoreAllActions(stateBufferPtr, actionsBufferPtr, actionCount);

One chunky call. Big contiguous buffers. Return one result block.

For your particular situation, I’d rank the interventions like this:

## **1. First compile the policy DSL to bytecode or generated JS**

Before WASM, kill interpretation overhead.

If your agent policies are currently object-walking something like:

for each rule:  
 inspect condition object  
 resolve selectors  
 evaluate predicates  
 mutate score object

that will be slow as hell.

Compile policies into something flatter:

LOAD_FEATURE 12  
GT_CONST 5  
JUMP_IF_FALSE +8  
ADD_SCORE ACTION_TAG_ATTACK 30  
MUL_SCORE FEATURE_7 0.4  
END

Then run a tight VM over numeric opcodes.

That VM can start in TypeScript using `Int32Array` / `Float64Array`. Once stable, port the VM to Rust/AssemblyScript/WASM.

## **2. Replace game state objects with compact state views for AI**

Your nice engine state can remain object-rich. But AI should see something like:

interface EncodedState {  
 ints: Int32Array;  
 floats: Float64Array;  
 bitsets: BigUint64Array;  
}

Object-heavy generic engines often die from allocation, GC, deep clones, and polymorphic property access, not from arithmetic.

For board/card games, compact representations are usually enormous wins:

card owner:        Int16Array(cardCount)  
card zone:         Int8Array(cardCount)  
card tapped/used:  bitset  
player resources:  Int16Array(playerCount * resourceKinds)  
legal actions:     Int32Array(actionCount * actionRecordSize)

## **3. Add apply/undo instead of clone/apply**

If your AI does:

const next = cloneState(state);  
applyMove(next, move);

inside search, that is probably one of your murder weapons.

Prefer:

const undo = applyMoveInPlace(state, move);  
evaluate(state);  
undoMoveInPlace(state, undo);

Or use arena snapshots:

state buffer  
mutation log  
checkpoint offset  
rollback to offset

This matters whether you use TS or WASM.

## **4. Move the AI loop into a Worker**

Even if you stay in TypeScript, put the AI in a Worker. That gives you a clean boundary and prevents UI stalls. Later, the worker can load WASM internally. Workers can also spawn more same-origin workers, which is useful for a search pool.

A good browser architecture:

main thread:  
 render UI  
 accept human input  
 display search progress

ai-worker:  
 run policy/search  
 maintain transposition table  
 call wasm kernel

optional worker pool:  
 evaluate rollout batches

## **5. Then port the hot VM/evaluator to WASM**

The first WASM target I’d build is not “the game engine.” It is:

evaluateActions(  
 encodedStatePtr,  
 legalActionsPtr,  
 actionCount,  
 policyBytecodePtr,  
 outputScoresPtr  
): void

That one function can run thousands of times without touching JS.

## **6. Use SIMD only after the data shape is right**

WASM has SIMD instructions, but SIMD only helps once your data is already laid out in lanes/batches. It will not save a branchy, object-heavy policy evaluator.

## **7. Consider WebGPU only for batch playouts/evaluations**

WebGPU becomes interesting if you can say:

Evaluate 100,000 independent action-state pairs.  
Each pair uses the same compact evaluator.  
Return scores.

It is much less attractive for:

Run complex symbolic rules with lots of branching, maps, strings, and dynamic action construction.

The best immediate design for you is probably:

TS policy compiler  
 ↓  
numeric policy bytecode  
 ↓  
TS bytecode VM using typed arrays  
 ↓  
workerized AI  
 ↓  
Rust/AssemblyScript WASM implementation of same VM  
 ↓  
optional worker pool / SharedArrayBuffer

The strong opinion: **WASM should be your second optimization wave, not your first.** If the engine is currently slow because it is interpreting policies, cloning states, allocating action objects, recursively generating `chooseN` combos, and walking generic schemas, porting that mess to WASM will just give you a faster mess with worse debugging.

Make the AI substrate boring first: numeric state, action IDs, bytecode policies, apply/undo, batched evaluation. Then compile that substrate. That is where WASM can actually pay off.

