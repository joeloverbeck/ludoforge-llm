import type { TraceEvent, MoveAppliedEvent } from '@ludoforge/engine/trace';

function formatDelta(delta: { readonly path: string; readonly before: unknown; readonly after: unknown }): string {
  return `${delta.path}: ${JSON.stringify(delta.before)} → ${JSON.stringify(delta.after)}`;
}

function formatMoveApplied(event: MoveAppliedEvent): void {
  const aiLabel = event.aiDecision !== undefined
    ? ` [${event.aiDecision.seatType}]`
    : '';
  const header = `Turn ${String(event.turnCount)} | Player ${String(event.player)} | ${String(event.move.actionId)}${aiLabel}`;

  console.group(`▶ ${header}`);

  if (event.deltas.length > 0) {
    console.group(`▶ State Changes (${String(event.deltas.length)} deltas)`);
    for (const delta of event.deltas) {
      console.log(formatDelta(delta));
    }
    console.groupEnd();
  }

  const firings = event.triggerFirings.filter((entry) => entry.kind === 'fired');
  if (firings.length > 0) {
    console.group(`▶ Triggers (${String(firings.length)} fired)`);
    for (const firing of firings) {
      if (firing.kind === 'fired') {
        console.log(`${String(firing.triggerId)} @ depth ${String(firing.depth)}`);
      }
    }
    console.groupEnd();
  }

  if (event.effectTrace.length > 0) {
    console.group(`▶ Effect Trace (${String(event.effectTrace.length)} entries)`);
    for (const entry of event.effectTrace) {
      switch (entry.kind) {
        case 'moveToken':
          console.log(`moveToken: ${entry.tokenId} → ${entry.to}`);
          break;
        case 'varChange':
          console.log(`varChange: ${entry.varName} = ${JSON.stringify(entry.newValue)}`);
          break;
        case 'createToken':
          console.log(`createToken: ${entry.tokenId} (${entry.type}) → ${entry.zone}`);
          break;
        case 'destroyToken':
          console.log(`destroyToken: ${entry.tokenId} (${entry.type}) in ${entry.zone}`);
          break;
        case 'resourceTransfer':
          console.log(`resourceTransfer: ${String(entry.actualAmount)} units`);
          break;
        case 'shuffle':
          console.log(`shuffle: ${entry.zone}`);
          break;
        default:
          console.log(`${entry.kind}`);
          break;
      }
    }
    console.groupEnd();
  }

  if (event.aiDecision !== undefined) {
    console.group('▶ AI Decision');
    console.log(`${event.aiDecision.seatType} | ${String(event.aiDecision.candidateCount)} candidates | selected #${String(event.aiDecision.selectedIndex)}`);
    console.groupEnd();
  }

  console.groupEnd();
}

export function createConsoleTraceSubscriber(): (event: TraceEvent) => void {
  return (event: TraceEvent): void => {
    switch (event.kind) {
      case 'game-initialized':
        console.group(`▶ Game Initialized | seed=${String(event.seed)} | ${String(event.playerCount)} players | phase=${event.phase}`);
        console.groupEnd();
        break;

      case 'move-applied':
        formatMoveApplied(event);
        break;

      case 'game-terminal':
        console.group(`▶ Game Terminal | ${event.result.type} | turn ${String(event.turnCount)}`);
        console.log(JSON.stringify(event.result));
        console.groupEnd();
        break;
    }
  };
}
