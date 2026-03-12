#!/usr/bin/env bash
# Evaluation harness for test-perf-fitl-top3 campaign
# THIS FILE IS IMMUTABLE — do not modify during improvement loops.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="$SCRIPT_DIR/run.log"
BUILD_LOG="$SCRIPT_DIR/run.log.build"

TARGET_FILES=(
  "dist/test/integration/fitl-events-plei-mei.test.js"
  "dist/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.js"
  "dist/test/integration/fitl-coup-support-production.test.js"
)

# --- Step 1: Build (always, to prevent stale JS) ---
echo "Building engine..." >&2
if ! (cd "$PROJECT_ROOT" && pnpm -F @ludoforge/engine build) > "$BUILD_LOG" 2>&1; then
  echo "status=BUILD_FAIL"
  echo "error=$(tail -5 "$BUILD_LOG")"
  exit 1
fi

# --- Step 2: Run tests ---
echo "Running target test suites..." >&2
cd "$PROJECT_ROOT/packages/engine"

# Build the file list relative to packages/engine
FILE_ARGS=()
for f in "${TARGET_FILES[@]}"; do
  FILE_ARGS+=("$f")
done

# Run with node --test, capture TAP output
set +e
node --test "${FILE_ARGS[@]}" > "$LOG_FILE" 2>&1
TEST_EXIT=$?
set -e

# --- Step 3: Parse TAP output ---
# Extract metrics from the final TAP summary lines
# Use || true to prevent set -e from killing the script if grep finds no match
DURATION=$(grep -E '^# duration_ms' "$LOG_FILE" | tail -1 | awk '{print $3}') || true
PASS=$(grep -E '^# pass' "$LOG_FILE" | tail -1 | awk '{print $3}') || true
FAIL_COUNT=$(grep -E '^# fail' "$LOG_FILE" | tail -1 | awk '{print $3}') || true
TESTS=$(grep -E '^# tests' "$LOG_FILE" | tail -1 | awk '{print $3}') || true

# --- Step 4: Validate ---
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

# --- Step 5: Output metric line ---
echo "combined_duration_ms=$DURATION pass=$PASS tests=$TESTS"
exit 0
