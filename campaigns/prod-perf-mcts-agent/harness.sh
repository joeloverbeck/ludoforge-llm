#!/usr/bin/env bash
# Evaluation harness for prod-perf-mcts-agent campaign
# THIS FILE IS IMMUTABLE — do not modify during improvement loops.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="$SCRIPT_DIR/run.log"
BUILD_LOG="$SCRIPT_DIR/run.log.build"

# --- Step 1: Build (always, to prevent stale JS) ---
echo "Building engine..." >&2
if ! (cd "$PROJECT_ROOT" && pnpm -F @ludoforge/engine build) > "$BUILD_LOG" 2>&1; then
  echo "status=BUILD_FAIL"
  echo "error=$(tail -5 "$BUILD_LOG")"
  exit 1
fi

# --- Step 2: Full regression gate (all engine tests) ---
echo "Running full engine test suite (regression gate)..." >&2
GATE_LOG="$SCRIPT_DIR/run.log.gate"
set +e
(cd "$PROJECT_ROOT" && pnpm -F @ludoforge/engine test) > "$GATE_LOG" 2>&1
GATE_EXIT=$?
set -e

if [[ "$GATE_EXIT" -ne 0 ]]; then
  echo "status=TEST_FAIL"
  echo "error=Full test suite failed (regression gate)"
  echo "gate_exit_code=$GATE_EXIT"
  # Show last 20 lines for diagnosis
  echo "--- last 20 lines of gate log ---"
  tail -20 "$GATE_LOG"
  exit 1
fi

echo "Regression gate passed." >&2

# --- Step 3: Run MCTS fast-profile core tests for metric measurement ---
# Runs only the fast-profile MCTS e2e test file WITHOUT RUN_MCTS_E2E=1.
# This executes only the 3 core smoke tests:
#   - 2-player fast game (200 turns, seed 201)
#   - determinism check (10 turns, seed 501)
#   - timing bounds (200 turns, seed 701)
# Extended tests (3p, 6p, mixed) are skipped automatically.
echo "Running MCTS fast-profile core tests for metric..." >&2
cd "$PROJECT_ROOT/packages/engine"
set +e
node --test dist/test/e2e/mcts/texas-holdem-mcts-fast.test.js > "$LOG_FILE" 2>&1
TEST_EXIT=$?
set -e

# --- Step 4: Parse TAP output ---
DURATION=$(grep -E '^# duration_ms' "$LOG_FILE" | tail -1 | awk '{print $3}') || true
PASS=$(grep -E '^# pass' "$LOG_FILE" | tail -1 | awk '{print $3}') || true
FAIL_COUNT=$(grep -E '^# fail' "$LOG_FILE" | tail -1 | awk '{print $3}') || true
TESTS=$(grep -E '^# tests' "$LOG_FILE" | tail -1 | awk '{print $3}') || true

# --- Step 5: Validate ---
if [[ -z "$DURATION" || -z "$PASS" || -z "${FAIL_COUNT:-}" || -z "$TESTS" ]]; then
  echo "status=PARSE_FAIL"
  echo "error=Could not parse TAP output"
  echo "test_exit_code=$TEST_EXIT"
  exit 1
fi

if [[ "$FAIL_COUNT" -ne 0 ]]; then
  echo "status=TEST_FAIL"
  echo "combined_duration_ms=$DURATION pass=$PASS fail=$FAIL_COUNT tests=$TESTS"
  exit 1
fi

if [[ "$TEST_EXIT" -ne 0 ]]; then
  echo "status=TEST_FAIL"
  echo "combined_duration_ms=$DURATION pass=$PASS fail=$FAIL_COUNT tests=$TESTS"
  echo "test_exit_code=$TEST_EXIT"
  exit 1
fi

# --- Step 6: Output metric line ---
echo "combined_duration_ms=$DURATION pass=$PASS tests=$TESTS"
exit 0
