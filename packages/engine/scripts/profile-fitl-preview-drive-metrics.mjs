import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

export async function createStaticRebuildCounterAccess(distRoot) {
  const [
    { __layout_internal_for_tests: layoutInternals },
    { __featureTable_internal_for_tests: featureTableInternals },
    { __compile_internal_for_tests: compileInternals },
    { __view_internal_for_tests: encodedStateInternals },
  ] = await Promise.all([
    import(join(distRoot, 'src', 'kernel', 'encoded-state', 'layout.js')),
    import(join(distRoot, 'src', 'cnl', 'policy-bytecode', 'feature-table.js')),
    import(join(distRoot, 'src', 'cnl', 'policy-bytecode', 'compile.js')),
    import(join(distRoot, 'src', 'kernel', 'encoded-state', 'view.js')),
  ]);

  return {
    reset() {
      layoutInternals.resetBuildEncodedStateLayoutCount();
      featureTableInternals.resetBuildFeatureTableCount();
      compileInternals.resetBuildExpressionFeatureTableCount();
      encodedStateInternals.resetBuildEncodedStateCount();
    },
    snapshot() {
      return {
        buildEncodedStateLayoutCount: layoutInternals.getBuildEncodedStateLayoutCount(),
        buildFeatureTableCount: featureTableInternals.getBuildFeatureTableCount(),
        buildExpressionFeatureTableCount: compileInternals.getBuildExpressionFeatureTableCount(),
        buildEncodedStateCount: encodedStateInternals.getBuildEncodedStateCount(),
      };
    },
  };
}

export function totalStaticRebuildCount(counters) {
  return counters.buildEncodedStateLayoutCount
    + counters.buildFeatureTableCount
    + counters.buildExpressionFeatureTableCount
    + counters.buildEncodedStateCount;
}

export function createPerCardRecorder(startedAt, readCounterSnapshot, round2, round4) {
  const rows = [];
  let currentTurnCount = 0;
  let currentStartedAtMs = 0;
  let currentCounters = readCounterSnapshot();
  let decisionCount = 0;

  const closeCurrent = (endedAtMs, reason) => {
    const counters = readCounterSnapshot();
    const elapsedMs = endedAtMs - currentStartedAtMs;
    rows.push({
      turnCount: currentTurnCount,
      elapsedMs: round2(elapsedMs),
      decisions: decisionCount,
      closeReason: reason,
      msPerDecision: decisionCount > 0 ? round4(elapsedMs / decisionCount) : null,
      tokenStateIndexBuildCount: counters.tokenStateIndexBuildCount - currentCounters.tokenStateIndexBuildCount,
      zobristKeyCacheHitCount:
        counters.zobristKeyCacheHitCount - currentCounters.zobristKeyCacheHitCount,
      zobristKeyCacheMissCount:
        counters.zobristKeyCacheMissCount - currentCounters.zobristKeyCacheMissCount,
      zobristKeyUncachedCount:
        counters.zobristKeyUncachedCount - currentCounters.zobristKeyUncachedCount,
      draftTokenStateIndexDeltaCount:
        counters.draftTokenStateIndexDeltaCount - currentCounters.draftTokenStateIndexDeltaCount,
      draftTokenStateIndexAttachCount:
        counters.draftTokenStateIndexAttachCount - currentCounters.draftTokenStateIndexAttachCount,
      draftTokenStateIndexSnapshotCount:
        counters.draftTokenStateIndexSnapshotCount - currentCounters.draftTokenStateIndexSnapshotCount,
      draftTokenStateIndexCowCopyCount:
        counters.draftTokenStateIndexCowCopyCount - currentCounters.draftTokenStateIndexCowCopyCount,
      persistentTokenStateIndexCacheHitCount:
        counters.persistentTokenStateIndexCacheHitCount - currentCounters.persistentTokenStateIndexCacheHitCount,
      persistentTokenStateIndexCacheMissCount:
        counters.persistentTokenStateIndexCacheMissCount - currentCounters.persistentTokenStateIndexCacheMissCount,
      persistentTokenStateIndexCacheWriteCount:
        counters.persistentTokenStateIndexCacheWriteCount - currentCounters.persistentTokenStateIndexCacheWriteCount,
      wasmScoreRowBytecodeCompileCount:
        counters.wasmScoreRowBytecodeCompileCount - currentCounters.wasmScoreRowBytecodeCompileCount,
      wasmPreviewCandidateFeatureRowRouteCount:
        counters.wasmPreviewCandidateFeatureRowRouteCount - currentCounters.wasmPreviewCandidateFeatureRowRouteCount,
      wasmPreviewCandidateFeatureRowUnsupportedCount:
        counters.wasmPreviewCandidateFeatureRowUnsupportedCount - currentCounters.wasmPreviewCandidateFeatureRowUnsupportedCount,
      wasmProductionPreviewDriveBatchCount:
        counters.wasmProductionPreviewDriveBatchCount - currentCounters.wasmProductionPreviewDriveBatchCount,
      driveExitTotal: counters.driveExitTotal - currentCounters.driveExitTotal,
      staticRebuildCount: totalStaticRebuildCount(counters) - totalStaticRebuildCount(currentCounters),
      buildEncodedStateLayoutCount:
        counters.buildEncodedStateLayoutCount - currentCounters.buildEncodedStateLayoutCount,
      buildFeatureTableCount:
        counters.buildFeatureTableCount - currentCounters.buildFeatureTableCount,
      buildExpressionFeatureTableCount:
        counters.buildExpressionFeatureTableCount - currentCounters.buildExpressionFeatureTableCount,
      buildEncodedStateCount:
        counters.buildEncodedStateCount - currentCounters.buildEncodedStateCount,
    });
    decisionCount = 0;
  };

  const openCurrent = (turnCount, startedAtMs) => {
    currentTurnCount = turnCount;
    currentStartedAtMs = startedAtMs;
    currentCounters = readCounterSnapshot();
    decisionCount = 0;
  };

  return {
    observe: (ctx) => {
      if (ctx.kind !== 'decision') {
        return;
      }
      const nowMs = performance.now() - startedAt;
      decisionCount += 1;
      if (ctx.turnCount > currentTurnCount) {
        closeCurrent(nowMs, 'turnCountAdvanced');
        openCurrent(ctx.turnCount, nowMs);
      }
    },
    finish: (elapsedMs) => {
      closeCurrent(elapsedMs, 'runFinished');
      return rows.filter((row) =>
        row.decisions > 0
        || row.driveExitTotal > 0
        || row.tokenStateIndexBuildCount > 0
        || row.staticRebuildCount > 0,
      );
    },
  };
}
