#!/usr/bin/env bash
# Evaluation harness for texas-agent-evolution campaign
# THIS FILE IS IMMUTABLE — do not modify during improvement loops.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_LOG="$SCRIPT_DIR/run.log.build"
GATE_LOG="$SCRIPT_DIR/run.log.gate"
RUNNER_LOG="$SCRIPT_DIR/run.log.runner"

SEED_COUNT=50
PLAYER_COUNT=4
EVOLVED_SEAT=0
MAX_TURNS=10000

# --- Step 1: Build (always, to prevent stale JS) ---
echo "Building engine..." >&2
if ! (cd "$PROJECT_ROOT" && pnpm -F @ludoforge/engine build) > "$BUILD_LOG" 2>&1; then
  echo "status=BUILD_FAIL"
  echo "error=$(tail -5 "$BUILD_LOG")"
  exit 1
fi

# --- Step 2: Full regression gate (all engine tests) ---
echo "Running full engine test suite (regression gate)..." >&2
set +e
(cd "$PROJECT_ROOT" && pnpm -F @ludoforge/engine test) > "$GATE_LOG" 2>&1
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

# --- Step 3: Run tournament simulations ---
echo "Running $SEED_COUNT tournament simulations ($PLAYER_COUNT players, evolved seat $EVOLVED_SEAT)..." >&2
set +e
node "$SCRIPT_DIR/run-tournament.mjs" \
  --seeds "$SEED_COUNT" \
  --players "$PLAYER_COUNT" \
  --evolved-seat "$EVOLVED_SEAT" \
  --max-turns "$MAX_TURNS" \
  --trace-seed 1000 \
  > "$RUNNER_LOG" 2>&1
RUNNER_EXIT=$?
set -e

if [[ "$RUNNER_EXIT" -ne 0 ]]; then
  echo "status=RUNNER_FAIL"
  echo "error=Tournament runner failed"
  echo "runner_exit_code=$RUNNER_EXIT"
  echo "--- last 20 lines of runner log ---"
  tail -20 "$RUNNER_LOG"
  exit 1
fi

# --- Step 4: Parse JSON output (last line of runner log) ---
RESULT_JSON=$(tail -1 "$RUNNER_LOG")

WIN_RATE=$(echo "$RESULT_JSON" | node -e "
  let d = '';
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(d.trim());
      process.stdout.write(String(data.winRate));
    } catch (e) {
      process.stderr.write('JSON parse error: ' + e.message + '\\n');
      process.exit(1);
    }
  });
")

WINS=$(echo "$RESULT_JSON" | node -e "
  let d = '';
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', () => {
    const data = JSON.parse(d.trim());
    process.stdout.write(String(data.wins));
  });
")

COMPLETED=$(echo "$RESULT_JSON" | node -e "
  let d = '';
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', () => {
    const data = JSON.parse(d.trim());
    process.stdout.write(String(data.completed));
  });
")

ERRORS=$(echo "$RESULT_JSON" | node -e "
  let d = '';
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', () => {
    const data = JSON.parse(d.trim());
    process.stdout.write(String(data.errors));
  });
")

if [[ -z "$WIN_RATE" ]]; then
  echo "status=PARSE_FAIL"
  echo "error=Could not parse win rate from runner output"
  echo "raw_output=$RESULT_JSON"
  exit 1
fi

# --- Step 5: Output metric line ---
echo "win_rate=$WIN_RATE wins=$WINS completed=$COMPLETED errors=$ERRORS"
exit 0
