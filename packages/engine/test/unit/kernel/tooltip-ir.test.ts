import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  TooltipMessage,
  SelectMessage,
  PlaceMessage,
  MoveMessage,
  PayMessage,
  GainMessage,
  TransferMessage,
  ShiftMessage,
  ActivateMessage,
  DeactivateMessage,
  RemoveMessage,
  CreateMessage,
  DestroyMessage,
  RevealMessage,
  DrawMessage,
  ShuffleMessage,
  SetMessage,
  ChooseMessage,
  RollMessage,
  ModifierMessage,
  BlockerMessage,
  PhaseMessage,
  GrantMessage,
  SuppressedMessage,
} from '../../../src/kernel/index.js';

import { TOOLTIP_MESSAGE_KINDS } from '../../../src/kernel/index.js';

describe('TooltipIR types', () => {
  it('TOOLTIP_MESSAGE_KINDS contains all 23 kinds', () => {
    assert.equal(TOOLTIP_MESSAGE_KINDS.length, 23);
  });

  it('constructs SelectMessage', () => {
    const msg: SelectMessage = {
      kind: 'select',
      astPath: 'root.effects[0]',
      target: 'spaces',
      bounds: { min: 1, max: 6 },
    };
    assert.equal(msg.kind, 'select');
    assert.equal(msg.target, 'spaces');
  });

  it('constructs PlaceMessage', () => {
    const msg: PlaceMessage = {
      kind: 'place',
      astPath: 'root.effects[1]',
      tokenFilter: 'usTroops',
      targetZone: 'saigon',
    };
    assert.equal(msg.kind, 'place');
  });

  it('constructs MoveMessage with adjacent variant', () => {
    const msg: MoveMessage = {
      kind: 'move',
      astPath: 'root.effects[2]',
      tokenFilter: 'usTroops',
      fromZone: 'quangTri',
      toZone: 'hue',
      variant: 'adjacent',
    };
    assert.equal(msg.kind, 'move');
    assert.equal(msg.variant, 'adjacent');
  });

  it('constructs PayMessage', () => {
    const msg: PayMessage = {
      kind: 'pay',
      astPath: 'root.effects[3]',
      resource: 'aid',
      amount: 3,
    };
    assert.equal(msg.kind, 'pay');
    assert.equal(msg.amount, 3);
  });

  it('constructs GainMessage', () => {
    const msg: GainMessage = {
      kind: 'gain',
      astPath: 'root.effects[4]',
      resource: 'arvnResources',
      amount: 6,
    };
    assert.equal(msg.kind, 'gain');
  });

  it('constructs TransferMessage', () => {
    const msg: TransferMessage = {
      kind: 'transfer',
      astPath: 'root.effects[5]',
      resource: 'aid',
      amount: 2,
      from: 'us',
      to: 'arvn',
    };
    assert.equal(msg.kind, 'transfer');
  });

  it('constructs ShiftMessage', () => {
    const msg: ShiftMessage = {
      kind: 'shift',
      astPath: 'root.effects[6]',
      marker: 'support',
      direction: '+1',
      amount: 1,
    };
    assert.equal(msg.kind, 'shift');
  });

  it('constructs ActivateMessage', () => {
    const msg: ActivateMessage = {
      kind: 'activate',
      astPath: 'root.effects[7]',
      tokenFilter: 'vcGuerrillas',
      zone: 'saigon',
    };
    assert.equal(msg.kind, 'activate');
  });

  it('constructs DeactivateMessage', () => {
    const msg: DeactivateMessage = {
      kind: 'deactivate',
      astPath: 'root.effects[8]',
      tokenFilter: 'nvaGuerrillas',
      zone: 'hue',
    };
    assert.equal(msg.kind, 'deactivate');
  });

  it('constructs RemoveMessage', () => {
    const msg: RemoveMessage = {
      kind: 'remove',
      astPath: 'root.effects[9]',
      tokenFilter: 'nvaTroops',
      fromZone: 'saigon',
      destination: 'casualties-nva',
    };
    assert.equal(msg.kind, 'remove');
  });

  it('constructs CreateMessage', () => {
    const msg: CreateMessage = {
      kind: 'create',
      astPath: 'root.effects[10]',
      tokenFilter: 'usBase',
      targetZone: 'danang',
    };
    assert.equal(msg.kind, 'create');
  });

  it('constructs DestroyMessage', () => {
    const msg: DestroyMessage = {
      kind: 'destroy',
      astPath: 'root.effects[11]',
      tokenFilter: 'tunnel',
      fromZone: 'centralHighlands',
    };
    assert.equal(msg.kind, 'destroy');
  });

  it('constructs RevealMessage', () => {
    const msg: RevealMessage = {
      kind: 'reveal',
      astPath: 'root.effects[12]',
      target: 'saigon',
    };
    assert.equal(msg.kind, 'reveal');
  });

  it('constructs DrawMessage', () => {
    const msg: DrawMessage = {
      kind: 'draw',
      astPath: 'root.effects[13]',
      source: 'eventDeck',
      count: 1,
    };
    assert.equal(msg.kind, 'draw');
  });

  it('constructs ShuffleMessage', () => {
    const msg: ShuffleMessage = {
      kind: 'shuffle',
      astPath: 'root.effects[14]',
      target: 'eventDeck',
    };
    assert.equal(msg.kind, 'shuffle');
  });

  it('constructs SetMessage', () => {
    const msg: SetMessage = {
      kind: 'set',
      astPath: 'root.effects[15]',
      target: 'totalEcon',
      value: '15',
    };
    assert.equal(msg.kind, 'set');
  });

  it('constructs ChooseMessage', () => {
    const msg: ChooseMessage = {
      kind: 'choose',
      astPath: 'root.effects[16]',
      options: ['march', 'attack', 'terror'],
      paramName: 'operation',
    };
    assert.equal(msg.kind, 'choose');
    assert.equal(msg.options.length, 3);
  });

  it('constructs RollMessage', () => {
    const msg: RollMessage = {
      kind: 'roll',
      astPath: 'root.effects[17]',
      range: { min: 1, max: 6 },
      bindTo: 'dieResult',
    };
    assert.equal(msg.kind, 'roll');
  });

  it('constructs ModifierMessage', () => {
    const msg: ModifierMessage = {
      kind: 'modifier',
      astPath: 'root.effects[18]',
      condition: 'monsoon',
      description: 'No air lift during monsoon',
    };
    assert.equal(msg.kind, 'modifier');
  });

  it('constructs BlockerMessage', () => {
    const msg: BlockerMessage = {
      kind: 'blocker',
      astPath: 'root.effects[19]',
      reason: 'Need Aid >= 3',
    };
    assert.equal(msg.kind, 'blocker');
  });

  it('constructs PhaseMessage', () => {
    const msg: PhaseMessage = {
      kind: 'phase',
      astPath: 'root.effects[20]',
      fromPhase: 'selectSpaces',
      toPhase: 'placeForces',
    };
    assert.equal(msg.kind, 'phase');
  });

  it('constructs GrantMessage', () => {
    const msg: GrantMessage = {
      kind: 'grant',
      astPath: 'root.effects[21]',
      operation: 'sweep',
      targetPlayer: 'arvn',
    };
    assert.equal(msg.kind, 'grant');
  });

  it('constructs SuppressedMessage', () => {
    const msg: SuppressedMessage = {
      kind: 'suppressed',
      astPath: 'root.effects[22]',
      reason: 'telemetry variable',
    };
    assert.equal(msg.kind, 'suppressed');
  });

  it('discriminated union narrows correctly via switch', () => {
    const messages: TooltipMessage[] = [
      { kind: 'pay', astPath: 'a', resource: 'aid', amount: 3 },
      { kind: 'gain', astPath: 'b', resource: 'arvnResources', amount: 6 },
      { kind: 'suppressed', astPath: 'c', reason: 'internal' },
    ];

    const results: string[] = [];
    for (const msg of messages) {
      switch (msg.kind) {
        case 'pay':
          results.push(`pay:${msg.resource}:${msg.amount}`);
          break;
        case 'gain':
          results.push(`gain:${msg.resource}:${msg.amount}`);
          break;
        case 'suppressed':
          results.push(`suppressed:${msg.reason}`);
          break;
        default:
          results.push(`other:${msg.kind}`);
      }
    }

    assert.deepEqual(results, [
      'pay:aid:3',
      'gain:arvnResources:6',
      'suppressed:internal',
    ]);
  });

  it('supports optional macroOrigin and stage fields', () => {
    const msg: PlaceMessage = {
      kind: 'place',
      astPath: 'root.effects[0]',
      tokenFilter: 'usTroops',
      targetZone: 'saigon',
      macroOrigin: 'trainUs',
      stage: 'placeForces',
    };
    assert.equal(msg.macroOrigin, 'trainUs');
    assert.equal(msg.stage, 'placeForces');
  });
});
