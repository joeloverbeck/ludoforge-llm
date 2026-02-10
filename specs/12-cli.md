# Spec 12: CLI

**Status**: Draft
**Priority**: P1 (required for MVP)
**Complexity**: M
**Dependencies**: Spec 08a, Spec 08b, Spec 10, Spec 11
**Estimated effort**: 2-3 days
**Source sections**: Brainstorming section 2.5

## Overview

Implement the developer CLI that provides 5 commands for the full workflow: lint Game Specs, compile to GameDef JSON, run simulations, evaluate game quality, and replay traces. The CLI uses Node.js built-in `parseArgs` (no external CLI framework). It orchestrates all other modules (parser, compiler, simulator, evaluator) and provides user-friendly output with proper exit codes.

## Scope

### In Scope
- 5 CLI commands: `spec:lint`, `spec:compile`, `run`, `eval`, `replay`
- Argument parsing with `node:util` `parseArgs`
- File I/O (read spec files, write JSON output)
- Structured output (JSON and human-readable modes)
- Exit codes (0 = success, 1 = error, 2 = validation errors)
- Error handling with user-friendly messages
- Help text for each command

### Out of Scope
- Interactive mode / REPL
- Watch mode / file watching
- Color output (keep it simple for MVP)
- Configuration files (.ludoforgerc or similar)
- Plugin system
- Web interface
- Progress bars for long operations

## Key Types & Interfaces

### CLI Entry Point

```typescript
// src/cli/index.ts — main entry point
async function main(args: string[]): Promise<number>;
// Returns exit code: 0 = success, 1 = error, 2 = validation warnings
```

### Command Definitions

```typescript
interface CliCommand {
  readonly name: string;
  readonly description: string;
  readonly usage: string;
  readonly options: Record<string, {
    readonly type: 'string' | 'boolean';
    readonly short?: string;
    readonly description: string;
    readonly default?: string | boolean;
  }>;
  readonly positionals: readonly {
    readonly name: string;
    readonly required: boolean;
    readonly description: string;
  }[];
  execute(args: ParsedArgs): Promise<number>;
}
```

## Implementation Requirements

### Command: spec:lint

**Usage**: `ludoforge spec:lint <file.md> [--json] [--verbose]`

**Behavior**:
1. Read the markdown file from disk
2. Call `parseGameSpec(markdown)` → get doc + sourceMap + parse diagnostics
3. Call `validateGameSpec(doc, { sourceMap })` → get validation diagnostics
4. Combine all diagnostics
5. Output diagnostics in human-readable format (default) or JSON (`--json`)
6. Exit 0 if no errors, exit 2 if warnings only, exit 1 if errors

**Human-readable output format**:
```
spec:lint results for game-spec.md

  ERROR  actions[2].effects[0].moveToken.from
         Zone 'shop' does not exist
         Suggestion: Did you mean 'market'?
         Available: deck, hand, market

  WARN   zones[1].adjacentTo
         Zone 'zoneB' lists 'zoneA' as adjacent, but 'zoneA' does not list 'zoneB'
         Suggestion: Add 'zoneB' to zoneA.adjacentTo

2 issues found (1 error, 1 warning)
```

**JSON output format** (`--json`):
```json
{
  "file": "game-spec.md",
  "diagnostics": [
    {
      "path": "actions[2].effects[0].moveToken.from",
      "severity": "error",
      "message": "Zone 'shop' does not exist",
      "suggestion": "Did you mean 'market'?",
      "alternatives": ["deck", "hand", "market"]
    }
  ],
  "summary": { "errors": 1, "warnings": 1, "info": 0 }
}
```

### Command: spec:compile

**Usage**: `ludoforge spec:compile <file.md> --out <game.json> [--json] [--verbose]`

**Behavior**:
1. Read the markdown file
2. `parseGameSpec(markdown)` → doc + sourceMap + diagnostics
3. If parse errors: output diagnostics, exit 1
4. `validateGameSpec(doc, { sourceMap })` → diagnostics
5. If validation errors: output diagnostics, exit 1
6. `expandMacros(doc)` → expanded doc + diagnostics
7. `compileGameSpecToGameDef(expandedDoc, { sourceMap })` → gameDef + diagnostics
8. If compilation errors: output diagnostics, exit 1
9. `validateGameDef(gameDef)` → diagnostics (final sanity check)
10. If semantic errors: output diagnostics, exit 1
11. Write GameDef JSON to `--out` path
12. Output success message with summary (zones, actions, triggers counts)
13. Exit 0

**Output file**: Valid JSON, pretty-printed (2-space indent), with BigInt values serialized as hex strings where applicable.

### Command: run

**Usage**: `ludoforge run <game.json> --agents <random,greedy> --seed <n> [--players <n>] [--max-turns <n>] [--out <trace.json>] [--quiet]`

**Behavior**:
1. Read and parse GameDef JSON from file
2. Validate with Zod schema
3. Resolve player count:
   - If `--players` provided: validate against `def.metadata.players.min/max`
   - If omitted: use `def.metadata.players.min`
4. Parse agent spec string → create agents via `parseAgentSpec(spec, playerCount)`
5. Call `runGame(def, seed, agents, maxTurns, playerCount)`
6. If `--out` specified: write GameTrace JSON to file
7. Output summary: winner, turns played, final scores
8. If `--quiet`: suppress per-turn output, only show final result
9. Exit 0

**Default values**:
- `--seed`: 1
- `--max-turns`: 1000
- `--players`: `def.metadata.players.min`
- `--agents`: if omitted, synthesize `"random"` repeated `playerCount` times

**Summary output**:
```
Game: proto-001 | Seed: 42 | Turns: 23

Result: Player 0 wins (score)
  Player 0: 15 VP
  Player 1: 8 VP

Trace written to trace.json
```

### Command: eval

**Usage**: `ludoforge eval <game.json> --runs <n> --agents <random,greedy> [--players <n>] [--seed-start <n>] [--max-turns <n>] [--out <report.json>] [--json]`

**Behavior**:
1. Read and validate GameDef JSON
2. Resolve player count (same rule as `run`)
3. Parse agent spec with `playerCount`
4. Generate seeds: `[seedStart, seedStart+1, ..., seedStart+runs-1]`
5. Call `runGames(def, seeds, agents, maxTurns, playerCount)` → traces
6. Call `generateEvalReport(def, traces)` → report
7. If `--out` specified: write EvalReport JSON to file
8. Output summary in human-readable (default) or JSON format

**Default values**:
- `--runs`: 10
- `--seed-start`: 1
- `--max-turns`: 1000
- `--players`: `def.metadata.players.min`

**Human-readable output**:
```
Evaluation: proto-001 | 10 runs | Agents: random, greedy

Metrics:
  Avg Game Length:       23.4 turns
  Avg Branching Factor:  5.2 moves
  Action Diversity:      0.73
  Resource Tension:      12.5
  Interaction Proxy:     0.15
  Dominant Action Freq:  0.42
  Drama Measure:         0.18

Degeneracy Flags: NONE

Report written to report.json
```

If flags detected:
```
Degeneracy Flags:
  - DOMINANT_ACTION: 'buyCard' action used in 85% of turns
  - TRIVIAL_WIN: 2 games ended in < 5 turns
```

### Command: replay

**Usage**: `ludoforge replay <trace.json> [--turn <n>] [--verbose]`

**Behavior**:
1. Read and deserialize GameTrace JSON
2. Display move-by-move game progression
3. If `--turn` specified: show only that turn's details
4. Show state hash, player, action, deltas for each move

**Output format**:
```
Replay: proto-001 | Seed: 42 | Turns: 23

Turn 1 (Player 0) [hash: 0x3a4f...]
  Action: takeMoney
  Deltas:
    perPlayerVars.0.money: 2 → 3

Turn 2 (Player 1) [hash: 0x7b2c...]
  Action: buyCard { $card: tok_card_0 }
  Deltas:
    perPlayerVars.1.money: 2 → 0
    zones.market: [tok_card_0, ...] → [...]
    zones.tableau:1: [] → [tok_card_0]
  Triggers:
    marketRestock (depth 1)

...

Result: Player 0 wins (score: 15 VP)
```

### Argument Parsing

Use Node.js built-in `parseArgs` from `node:util`:

```typescript
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    out: { type: 'string', short: 'o' },
    agents: { type: 'string', short: 'a' },
    seed: { type: 'string', short: 's' },
    'max-turns': { type: 'string' },
    players: { type: 'string', short: 'p' },
    runs: { type: 'string', short: 'n' },
    'seed-start': { type: 'string' },
    json: { type: 'boolean' },
    verbose: { type: 'boolean', short: 'v' },
    quiet: { type: 'boolean', short: 'q' },
    help: { type: 'boolean', short: 'h' },
    turn: { type: 'string', short: 't' },
  },
  allowPositionals: true,
});
```

### Command Routing

```typescript
const command = positionals[0]; // e.g., "spec:lint", "run", "eval"
switch (command) {
  case 'spec:lint':   return specLint(values, positionals.slice(1));
  case 'spec:compile': return specCompile(values, positionals.slice(1));
  case 'run':         return run(values, positionals.slice(1));
  case 'eval':        return evaluate(values, positionals.slice(1));
  case 'replay':      return replay(values, positionals.slice(1));
  default:            return showHelp();
}
```

### Help Text

Each command shows usage when called with `--help` or with wrong arguments:

```
ludoforge — LudoForge-LLM game evolution toolkit

Commands:
  spec:lint <file.md>         Parse and validate a Game Spec
  spec:compile <file.md>      Compile Game Spec to GameDef JSON
  run <game.json>             Run a game simulation
  eval <game.json>            Evaluate game quality over multiple runs
  replay <trace.json>         Replay a game trace

Use 'ludoforge <command> --help' for command-specific options.
```

### Error Handling

- File not found → "Error: File not found: <path>" + exit 1
- JSON parse error → "Error: Invalid JSON in <path>: <message>" + exit 1
- Schema validation error → structured diagnostics + exit 1
- Unexpected errors → "Internal error: <message>" + exit 1
- All errors go to stderr, all normal output to stdout

## Invariants

1. All commands exit 0 on success, non-zero on failure
2. `spec:lint` outputs structured diagnostics (JSON with `--json` or human-readable)
3. `spec:compile` output is valid JSON that passes GameDef schema validation
4. `run` output is deterministic for given seed
5. `eval` runs are independent (each gets a different seed from the seed sequence)
6. Error messages are user-friendly with suggestions where applicable
7. `--json` flag produces machine-parseable output for all commands that support it
8. Exit code 2 is reserved for "success with warnings" (distinct from error)
9. No external CLI framework dependency (only `node:util` parseArgs)
10. File I/O errors are caught and reported with the file path

## Required Tests

### Unit Tests

**Argument parsing**:
- `spec:lint game.md` → correct command routing
- `spec:compile game.md --out game.json` → correct option extraction
- `run game.json --agents random,greedy --seed 42` → correct parsing
- `eval game.json --runs 10` → correct default values applied
- Missing required positional → error message + exit 1
- `--help` → help text printed, exit 0

**Output formatting**:
- Diagnostics formatted correctly in human-readable mode
- Diagnostics formatted correctly in JSON mode
- Metrics table formatted with correct alignment
- Replay output shows correct turn-by-turn progression

### Integration Tests

**spec:lint**:
- Valid spec file → exit 0, no errors
- Invalid spec file → exit 1, diagnostics printed with paths and suggestions
- `--json` flag → valid JSON output

**spec:compile**:
- Valid spec → writes valid GameDef JSON to output file, exit 0
- Spec with errors → diagnostics printed, no output file written, exit 1
- Output file passes `validateGameDef`

**run**:
- Valid GameDef + seed → produces valid trace
- `--out trace.json` → trace file written
- Same seed → same output (determinism)

**eval**:
- Valid GameDef + 5 runs → valid EvalReport with metrics
- `--out report.json` → report file written
- Report has correct runCount

### E2E Tests

**Full pipeline**:
- `spec:compile game.md --out game.json` → `run game.json --seed 1 --out trace.json` → `eval game.json --runs 5 --out report.json`
- Each step succeeds, output files are valid, report has metrics and no degeneracy flags

### Property Tests

- For any valid GameDef file, `run` with any seed terminates and exits 0
- `spec:compile` on valid spec always produces output that `run` can consume

### Golden Tests

- Known spec file → expected compile output (file comparison)
- Known GameDef + seed → expected run summary output

## Acceptance Criteria

- [ ] All 5 commands implemented and functional
- [ ] `spec:lint` reports diagnostics with paths and suggestions
- [ ] `spec:compile` produces valid GameDef JSON
- [ ] `run` produces deterministic output for given seed
- [ ] `eval` computes metrics and degeneracy flags correctly
- [ ] `replay` shows turn-by-turn game progression
- [ ] `--json` flag works for spec:lint, spec:compile, eval
- [ ] `--help` shows usage for each command
- [ ] Exit codes are correct (0/1/2)
- [ ] File I/O errors handled gracefully
- [ ] No external CLI framework dependency
- [ ] E2E pipeline works: compile → run → eval

## Files to Create/Modify

```
src/cli/index.ts                 # MODIFY — main entry point, command routing
src/cli/commands/spec-lint.ts    # NEW — spec:lint command
src/cli/commands/spec-compile.ts # NEW — spec:compile command
src/cli/commands/run.ts          # NEW — run command
src/cli/commands/eval.ts         # NEW — eval command
src/cli/commands/replay.ts       # NEW — replay command
src/cli/format.ts                # NEW — output formatting (human-readable, JSON)
src/cli/parse-args.ts            # NEW — argument parsing helpers
src/cli/help.ts                  # NEW — help text generation
test/integration/cli-lint.test.ts     # NEW
test/integration/cli-compile.test.ts  # NEW
test/integration/cli-run.test.ts      # NEW
test/integration/cli-eval.test.ts     # NEW
test/integration/cli-replay.test.ts   # NEW
test/e2e/cli-pipeline.test.ts         # NEW — full pipeline E2E test
```
