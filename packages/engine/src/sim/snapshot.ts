import { createEvalContext, createEvalRuntimeResources } from '../kernel/eval-context.js';
import { evalValue } from '../kernel/eval-value.js';
import { countSeatTokens } from '../kernel/derived-values.js';
import type { ZoneId } from '../kernel/branded.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import { kernelRuntimeError } from '../kernel/runtime-error.js';
import type { GameState, VariableValue } from '../kernel/types.js';
import type { ValidatedGameDef } from '../kernel/validate-gamedef.js';
import type {
  DecisionPointSnapshot,
  SeatStandingSnapshot,
  SnapshotDepth,
  StandardDecisionPointSnapshot,
  VerboseDecisionPointSnapshot,
  ZoneSummary,
} from './snapshot-types.js';

const cloneVariableRecord = (vars: Readonly<Record<string, VariableValue>> | undefined): Readonly<Record<string, VariableValue>> => (
  vars === undefined ? {} : { ...vars }
);

const buildSeatStandings = (
  def: ValidatedGameDef,
  state: GameState,
  runtime: GameDefRuntime,
  depth: SnapshotDepth,
  boardZoneIds: readonly ZoneId[],
): readonly SeatStandingSnapshot[] => {
  const resources = createEvalRuntimeResources();
  const seatProp = def.victoryStandings?.seatGroupConfig.seatProp;
  const margins = def.terminal.margins ?? [];

  return margins.map((marginDef): SeatStandingSnapshot => {
    const seatIndex = def.seats?.findIndex((seat) => seat.id === marginDef.seat) ?? -1;
    const context = createEvalContext({
      def,
      adjacencyGraph: runtime.adjacencyGraph,
      state,
      activePlayer: state.activePlayer,
      actorPlayer: state.activePlayer,
      bindings: {},
      runtimeTableIndex: runtime.runtimeTableIndex,
      resources,
    });
    const marginValue = evalValue(marginDef.value, context);
    if (typeof marginValue !== 'number') {
      throw kernelRuntimeError(
        'TERMINAL_MARGIN_NON_NUMERIC',
        `Victory margin "${marginDef.seat}" must evaluate to a number`,
        { seat: marginDef.seat },
      );
    }
    const margin = marginValue;

    if (depth === 'none' || depth === 'minimal') {
      return {
        seat: marginDef.seat,
        margin,
      };
    }

    const perPlayerVars = seatIndex >= 0
      ? cloneVariableRecord(state.perPlayerVars[seatIndex])
      : {};

    const tokenCountOnBoard = seatProp === undefined
      ? undefined
      : boardZoneIds.reduce(
          (sum, zoneId) => sum + countSeatTokens(state, zoneId, [marginDef.seat], seatProp),
          0,
        );

    return {
      seat: marginDef.seat,
      margin,
      perPlayerVars,
      ...(tokenCountOnBoard === undefined ? {} : { tokenCountOnBoard }),
    };
  });
};

const buildZoneSummaries = (
  def: ValidatedGameDef,
  state: GameState,
  boardZoneIds: readonly ZoneId[],
): readonly ZoneSummary[] => {
  const seatProp = def.victoryStandings?.seatGroupConfig.seatProp;

  return boardZoneIds.map((zoneId): ZoneSummary => {
    const zoneVars = state.zoneVars[zoneId];
    const tokenCountBySeat = seatProp === undefined
      ? undefined
      : Object.fromEntries(
          (def.seats ?? []).map((seat) => [
            seat.id,
            countSeatTokens(state, zoneId, [seat.id], seatProp),
          ]),
        );

    return {
      zoneId,
      ...(zoneVars === undefined ? {} : { zoneVars: { ...zoneVars } }),
      ...(tokenCountBySeat === undefined ? {} : { tokenCountBySeat }),
    };
  });
};

export function extractDecisionPointSnapshot(
  def: ValidatedGameDef,
  state: GameState,
  runtime: GameDefRuntime,
  depth: SnapshotDepth,
): DecisionPointSnapshot | StandardDecisionPointSnapshot | VerboseDecisionPointSnapshot {
  const boardZoneIds = def.zones
    .filter((zone) => zone.zoneKind === 'board')
    .map((zone) => zone.id);
  const seatStandings = buildSeatStandings(def, state, runtime, depth, boardZoneIds);
  const base: DecisionPointSnapshot = {
    turnCount: state.turnCount,
    phaseId: state.currentPhase,
    activePlayer: state.activePlayer,
    seatStandings,
  };

  if (depth === 'none' || depth === 'minimal') {
    return base;
  }

  const standard: StandardDecisionPointSnapshot = {
    ...base,
    globalVars: cloneVariableRecord(state.globalVars),
  };

  if (depth === 'standard') {
    return standard;
  }

  return {
    ...standard,
    zoneSummaries: buildZoneSummaries(def, state, boardZoneIds),
  };
}
