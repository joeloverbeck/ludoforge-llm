#!/usr/bin/env bash
# Evaluation harness for fitl-preview-perf campaign.
# THIS FILE IS IMMUTABLE — do not modify during improvement loops.
#
# Pipeline:
#   1. BUILD                 — pnpm -F @ludoforge/engine build
#   2. GATE                  — focused (Tier 1) or full turbo (Tier 2)
#   3. PREVIEW-ON BENCHMARK  — HARNESS_RUNS times, take median
#   4. PREVIEW-OFF WATCHDOG  — HARNESS_OFF_RUNS times, take median
#   5. DETERMINISM + CORPUS  — verify state hashes + sample shape match
#   6. EMIT                  — key=value lines for the loop runner
#
# Primary metric: previewOn_totalMs_ms (lower is better)
# Watchdog metric: previewOff_totalMs_ms (REJECT if exceeds WATCHDOG_OFF_MAX_MS)
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_LOG="$SCRIPT_DIR/run.log.build"
GATE_LOG="$SCRIPT_DIR/run.log.gate"
SEED_TIER_FILE="$SCRIPT_DIR/seed-tier.txt"

HARNESS_RUNS=3
HARNESS_OFF_RUNS=1
WATCHDOG_OFF_MAX_MS=12660

# --- Resolve current tier ---
if [[ -f "$SEED_TIER_FILE" ]]; then
  CURRENT_TIER="$(tail -n 1 "$SEED_TIER_FILE" | tr -d '[:space:]')"
else
  CURRENT_TIER="tier-1"
fi
echo "Tier: $CURRENT_TIER" >&2

# --- Step 1: Build (always, to prevent stale JS) ---
BUILD_START_MS=$(date +%s%3N)
echo "Building engine..." >&2
if ! (cd "$PROJECT_ROOT" && pnpm -F @ludoforge/engine build) > "$BUILD_LOG" 2>&1; then
  echo "status=BUILD_FAIL"
  echo "error=$(tail -5 "$BUILD_LOG")"
  exit 1
fi
BUILD_END_MS=$(date +%s%3N)
BUILD_MS=$((BUILD_END_MS - BUILD_START_MS))

# --- Step 2: Gate (focused for Tier 1, full turbo for Tier 2) ---
GATE_START_MS=$(date +%s%3N)
echo "Running test gate ($CURRENT_TIER)..." >&2
set +e
if [[ "$CURRENT_TIER" == "tier-2" ]]; then
  (cd "$PROJECT_ROOT" && pnpm turbo test) > "$GATE_LOG" 2>&1
else
  (
    cd "$PROJECT_ROOT/packages/engine"
    node --test \
      'dist/test/unit/agents/**/*.test.js' \
      'dist/test/integration/agents/**/*.test.js' \
      'dist/test/perf/agents/preview-pipeline.perf.test.js'
  ) > "$GATE_LOG" 2>&1
fi
GATE_EXIT=$?
set -e
GATE_END_MS=$(date +%s%3N)
GATE_MS=$((GATE_END_MS - GATE_START_MS))

if [[ "$GATE_EXIT" -ne 0 ]]; then
  echo "status=GATE_FAIL"
  echo "error=Test gate failed ($CURRENT_TIER)"
  echo "gate_exit_code=$GATE_EXIT"
  echo "build_ms=$BUILD_MS"
  echo "gate_ms=$GATE_MS"
  echo "--- last 30 lines of gate log ---"
  tail -30 "$GATE_LOG"
  exit 1
fi

echo "Gate passed ($CURRENT_TIER) in ${GATE_MS}ms." >&2

# --- Step 3 + 4: Run preview-on (×N) and preview-off (×M) ---
TMPDIR_RUNS=$(mktemp -d)
trap 'rm -rf "$TMPDIR_RUNS"' EXIT

run_benchmark() {
  local mode="$1"
  local runs="$2"
  local label_log="$3"
  for i in $(seq 1 "$runs"); do
    local runner_log="$SCRIPT_DIR/run.log.runner.${label_log}.${i}"
    echo "Benchmark ${label_log} ${i}/${runs}..." >&2
    set +e
    node "$SCRIPT_DIR/run-benchmark.mjs" --mode "$mode" \
      > "$runner_log" 2>&1
    local exit_code=$?
    set -e
    if [[ "$exit_code" -ne 0 ]]; then
      echo "status=RUNNER_FAIL"
      echo "error=Benchmark runner failed (mode=$mode, run=$i)"
      echo "runner_exit_code=$exit_code"
      echo "build_ms=$BUILD_MS"
      echo "gate_ms=$GATE_MS"
      echo "--- last 30 lines of runner log ---"
      tail -30 "$runner_log"
      exit 1
    fi
    tail -1 "$runner_log" > "$TMPDIR_RUNS/${label_log}-${i}.json"
  done
}

run_benchmark "on" "$HARNESS_RUNS" "on"
run_benchmark "off" "$HARNESS_OFF_RUNS" "off"

# --- Step 5: Determinism + corpus + median + watchdog (single node script) ---
FINAL_OUTPUT=$(node -e "
  const fs = require('fs');
  const onRuns = [];
  for (let i = 1; i <= ${HARNESS_RUNS}; i++) {
    const raw = fs.readFileSync('${TMPDIR_RUNS}/on-' + i + '.json', 'utf8').trim();
    onRuns.push(JSON.parse(raw));
  }
  const offRuns = [];
  for (let i = 1; i <= ${HARNESS_OFF_RUNS}; i++) {
    const raw = fs.readFileSync('${TMPDIR_RUNS}/off-' + i + '.json', 'utf8').trim();
    offRuns.push(JSON.parse(raw));
  }

  // --- Determinism (preview-on): all 3 state_hash values must match ---
  const onHashes = onRuns.map(r => r.state_hash);
  for (let i = 1; i < onHashes.length; i++) {
    if (onHashes[i] !== onHashes[0]) {
      console.log('status=DETERMINISM_FAIL_ON');
      console.log('error=preview-on state hash mismatch: run 1=' + onHashes[0] + ', run ' + (i+1) + '=' + onHashes[i]);
      process.exit(1);
    }
  }

  // --- Determinism (preview-off): all watchdog runs must agree ---
  const offHashes = offRuns.map(r => r.state_hash);
  for (let i = 1; i < offHashes.length; i++) {
    if (offHashes[i] !== offHashes[0]) {
      console.log('status=DETERMINISM_FAIL_OFF');
      console.log('error=preview-off state hash mismatch: run 1=' + offHashes[0] + ', run ' + (i+1) + '=' + offHashes[i]);
      process.exit(1);
    }
  }

  // --- Corpus shape (preview-on) ---
  const expectedSampleSize = 50;
  for (let i = 0; i < onRuns.length; i++) {
    const r = onRuns[i];
    if (r.sampledActionSelectionCount !== expectedSampleSize) {
      console.log('status=CORPUS_SHAPE_FAIL');
      console.log('error=preview-on run ' + (i+1) + ' sampledActionSelectionCount=' + r.sampledActionSelectionCount + ', expected ' + expectedSampleSize);
      process.exit(1);
    }
    if (!Number.isFinite(r.candidateBudget) || r.candidateBudget <= 0) {
      console.log('status=CORPUS_SHAPE_FAIL');
      console.log('error=preview-on run ' + (i+1) + ' invalid candidateBudget=' + r.candidateBudget);
      process.exit(1);
    }
  }

  // --- Sort preview-on runs by totalMs, find median ---
  const onIndexed = onRuns.map((r, i) => ({ duration: r.totalMs, idx: i }));
  onIndexed.sort((a, b) => a.duration - b.duration);
  const medianOnEntry = onIndexed[Math.floor(onIndexed.length / 2)];
  const medianOn = onRuns[medianOnEntry.idx];
  const medianOnMs = medianOnEntry.duration;

  // --- MAD across preview-on runs ---
  const onDeviations = onIndexed.map(e => Math.abs(e.duration - medianOnMs));
  onDeviations.sort((a, b) => a - b);
  const onMad = onDeviations[Math.floor(onDeviations.length / 2)];
  const onMadPct = medianOnMs > 0 ? (onMad / medianOnMs * 100) : 0;

  // --- Median preview-off (watchdog) ---
  const offIndexed = offRuns.map((r, i) => ({ duration: r.totalMs, idx: i }));
  offIndexed.sort((a, b) => a.duration - b.duration);
  const medianOffEntry = offIndexed[Math.floor(offIndexed.length / 2)];
  const medianOff = offRuns[medianOffEntry.idx];
  const medianOffMs = medianOffEntry.duration;

  // --- Watchdog gate (Goodhart guard) ---
  if (medianOffMs > ${WATCHDOG_OFF_MAX_MS}) {
    console.log('status=WATCHDOG_FAIL');
    console.log('error=previewOff_totalMs_ms=' + medianOffMs.toFixed(2) + ' exceeds WATCHDOG_OFF_MAX_MS=${WATCHDOG_OFF_MAX_MS}');
    console.log('previewOn_totalMs_ms=' + medianOnMs.toFixed(2));
    console.log('previewOff_totalMs_ms=' + medianOffMs.toFixed(2));
    process.exit(1);
  }

  // --- Diagnostics aggregation (from the median preview-on run only) ---
  const diag = medianOn.diagnostics || {};
  const round2 = (v) => Math.round(v * 100) / 100;

  console.log('previewOn_totalMs_ms=' + round2(medianOnMs));
  console.log('previewOff_totalMs_ms=' + round2(medianOffMs));
  console.log('previewOn_perCandidate_ms=' + round2(medianOnMs / medianOn.candidateBudget));
  console.log('previewOff_perCandidate_ms=' + round2(medianOffMs / medianOff.candidateBudget));
  console.log('candidateBudget=' + medianOn.candidateBudget);
  console.log('sampledActionSelectionCount=' + medianOn.sampledActionSelectionCount);
  console.log('previewOn_state_hash=' + onHashes[0]);
  console.log('previewOff_state_hash=' + offHashes[0]);
  console.log('previewOn_mad_ms=' + round2(onMad));
  console.log('previewOn_mad_pct=' + round2(onMadPct));
  console.log('previewDriveDepth_p50=' + (diag.driveDepth_p50 ?? -1));
  console.log('previewDriveDepth_p95=' + (diag.driveDepth_p95 ?? -1));
  console.log('previewDriveDepth_max=' + (diag.driveDepth_max ?? -1));
  console.log('previewGatedCount_total=' + (diag.gatedCount_total ?? -1));
  console.log('previewGatedCount_per_microturn_p50=' + (diag.gatedCount_p50 ?? -1));
  console.log('previewFailureReason_top3=' + JSON.stringify(diag.failureReason_top3 ?? []));
  console.log('previewOutcomeKind_counts=' + JSON.stringify(diag.outcomeKind_counts ?? {}));
  console.log('previewUnknownReason_counts=' + JSON.stringify(diag.unknownReason_counts ?? {}));
  console.log('compilation_ms=' + round2(medianOn.compilation_ms ?? 0));
" 2>&1)

PARSE_EXIT=$?
if [[ "$PARSE_EXIT" -ne 0 ]]; then
  if echo "$FINAL_OUTPUT" | grep -qE "^status=(DETERMINISM_FAIL_ON|DETERMINISM_FAIL_OFF|CORPUS_SHAPE_FAIL|WATCHDOG_FAIL)$"; then
    echo "$FINAL_OUTPUT"
    echo "build_ms=$BUILD_MS"
    echo "gate_ms=$GATE_MS"
    exit 1
  fi
  echo "status=PARSE_FAIL"
  echo "error=Failed to compute median / verify determinism / verify watchdog"
  echo "$FINAL_OUTPUT"
  echo "build_ms=$BUILD_MS"
  echo "gate_ms=$GATE_MS"
  exit 1
fi

# --- Step 6: Emit metrics ---
TOTAL_END_MS=$(date +%s%3N)
TOTAL_HARNESS_MS=$((TOTAL_END_MS - BUILD_START_MS))

echo "$FINAL_OUTPUT"
echo "build_ms=$BUILD_MS"
echo "gate_ms=$GATE_MS"
echo "tier=$CURRENT_TIER"
echo "total_harness_ms=$TOTAL_HARNESS_MS"

exit 0
