#!/usr/bin/env bash
# Evaluation harness for fitl-perf-optimization campaign
# THIS FILE IS IMMUTABLE — do not modify during improvement loops.
#
# Pipeline: BUILD → GATE → RUNNER (×3, median) → PARSE
# Primary metric: combined_duration_ms (lower is better)
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_LOG="$SCRIPT_DIR/run.log.build"
GATE_LOG="$SCRIPT_DIR/run.log.gate"

HARNESS_RUNS=3
SEED_COUNT=3
PLAYER_COUNT=4
MAX_TURNS=200

# --- Step 1: Build (always, to prevent stale JS) ---
echo "Building engine..." >&2
if ! (cd "$PROJECT_ROOT" && pnpm -F @ludoforge/engine build) > "$BUILD_LOG" 2>&1; then
  echo "status=BUILD_FAIL"
  echo "error=$(tail -5 "$BUILD_LOG")"
  exit 1
fi

# --- Step 2: Full regression gate (all tests via turbo) ---
echo "Running full test suite (regression gate)..." >&2
set +e
(cd "$PROJECT_ROOT" && pnpm turbo test) > "$GATE_LOG" 2>&1
GATE_EXIT=$?
set -e

if [[ "$GATE_EXIT" -ne 0 ]]; then
  echo "status=TEST_FAIL"
  echo "error=Full test suite failed (regression gate)"
  echo "gate_exit_code=$GATE_EXIT"
  echo "--- last 20 lines of gate log ---"
  tail -20 "$GATE_LOG"
  exit 1
fi

echo "Regression gate passed." >&2

# --- Step 3: Run benchmark HARNESS_RUNS times ---
# Store each run's JSON result in a temp file for reliable access
TMPDIR_RUNS=$(mktemp -d)
trap 'rm -rf "$TMPDIR_RUNS"' EXIT

for i in $(seq 1 "$HARNESS_RUNS"); do
  RUNNER_LOG="$SCRIPT_DIR/run.log.runner.$i"
  echo "Benchmark run $i/$HARNESS_RUNS..." >&2

  set +e
  node "$SCRIPT_DIR/run-benchmark.mjs" \
    --seeds "$SEED_COUNT" \
    --players "$PLAYER_COUNT" \
    --max-turns "$MAX_TURNS" \
    > "$RUNNER_LOG" 2>&1
  RUNNER_EXIT=$?
  set -e

  if [[ "$RUNNER_EXIT" -ne 0 ]]; then
    echo "status=RUNNER_FAIL"
    echo "error=Benchmark runner failed on run $i"
    echo "runner_exit_code=$RUNNER_EXIT"
    echo "--- last 20 lines of runner log ---"
    tail -20 "$RUNNER_LOG"
    exit 1
  fi

  # Save the JSON result line (last line of runner output)
  tail -1 "$RUNNER_LOG" > "$TMPDIR_RUNS/run-$i.json"
done

# --- Step 3b: Determinism check + median computation ---
# Use a single node script that reads all run files, checks determinism,
# computes median, MAD, and outputs the final key=value metrics.
FINAL_OUTPUT=$(node -e "
  const fs = require('fs');
  const runs = [];
  for (let i = 1; i <= ${HARNESS_RUNS}; i++) {
    const raw = fs.readFileSync('${TMPDIR_RUNS}/run-' + i + '.json', 'utf8').trim();
    runs.push(JSON.parse(raw));
  }

  // Determinism check: all state_hash values must match
  const hashes = runs.map(r => r.state_hash);
  for (let i = 1; i < hashes.length; i++) {
    if (hashes[i] !== hashes[0]) {
      console.log('status=DETERMINISM_FAIL');
      console.log('error=State hash mismatch: run 1 hash=' + hashes[0] + ', run ' + (i+1) + ' hash=' + hashes[i]);
      process.exit(1);
    }
  }
  process.stderr.write('Determinism check passed (all ' + runs.length + ' runs produced identical state_hash).\\n');

  // Sort by combined_duration_ms, find median
  const indexed = runs.map((r, i) => ({ duration: r.combined_duration_ms, idx: i }));
  indexed.sort((a, b) => a.duration - b.duration);
  const medianEntry = indexed[Math.floor(indexed.length / 2)];
  const medianRun = runs[medianEntry.idx];
  const medianDuration = medianEntry.duration;

  // MAD = median of absolute deviations from median
  const deviations = indexed.map(e => Math.abs(e.duration - medianDuration));
  deviations.sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)];
  const madPct = medianDuration > 0 ? (mad / medianDuration * 100) : 0;

  // Output key=value lines
  console.log('combined_duration_ms=' + medianRun.combined_duration_ms);
  console.log('compilation_ms=' + medianRun.compilation_ms);
  console.log('games_completed=' + medianRun.games_completed);
  console.log('errors=' + medianRun.errors);
  console.log('total_moves=' + medianRun.total_moves);
  console.log('mad_ms=' + mad.toFixed(2));
  console.log('mad_pct=' + madPct.toFixed(4));
  console.log('terminalResult_ms=' + medianRun.per_function.terminalResult_ms);
  console.log('legalMoves_ms=' + medianRun.per_function.legalMoves_ms);
  console.log('applyMove_ms=' + medianRun.per_function.applyMove_ms);
  console.log('agentChooseMove_ms=' + medianRun.per_function.agentChooseMove_ms);
  console.log('computeDeltas_ms=' + medianRun.per_function.computeDeltas_ms);
" 2>&1)

PARSE_EXIT=$?
if [[ "$PARSE_EXIT" -ne 0 ]]; then
  # Check if it was a determinism failure (status line will be in output)
  if echo "$FINAL_OUTPUT" | grep -q "status=DETERMINISM_FAIL"; then
    echo "$FINAL_OUTPUT"
    exit 1
  fi
  echo "status=PARSE_FAIL"
  echo "error=Failed to compute median/parse benchmark results"
  echo "$FINAL_OUTPUT"
  exit 1
fi

# Emit the final metrics (determinism check stderr already printed above)
echo "$FINAL_OUTPUT" | grep -v "^Determinism check"

exit 0
