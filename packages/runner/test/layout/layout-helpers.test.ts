import { describe, expect, it } from 'vitest';
import { asZoneId, type ZoneDef } from '@ludoforge/engine/runtime';

import { promoteCardRoleZones } from '../../src/layout/layout-helpers';

describe('promoteCardRoleZones', () => {
  it('moves role-listed aux zones to board', () => {
    const partitioned = {
      board: [zone('board-a')],
      aux: [zone('draw:none'), zone('discard:none'), zone('other:none')],
    };

    const promoted = promoteCardRoleZones(partitioned, new Set(['draw:none', 'discard:none']));

    expect(promoted.board.map((zone) => zone.id)).toEqual(['board-a', 'draw:none', 'discard:none']);
    expect(promoted.aux.map((zone) => zone.id)).toEqual(['other:none']);
  });

  it('returns original partition when role zone set is empty', () => {
    const partitioned = {
      board: [zone('board-a')],
      aux: [zone('draw:none')],
    };

    const promoted = promoteCardRoleZones(partitioned, new Set());

    expect(promoted).toBe(partitioned);
  });

  it('does not duplicate zones already present in board', () => {
    const boardZone = zone('shared:none');
    const partitioned = {
      board: [boardZone],
      aux: [zone('shared:none'), zone('other:none')],
    };

    const promoted = promoteCardRoleZones(partitioned, new Set(['shared:none']));

    expect(promoted.board.map((zone) => zone.id)).toEqual(['shared:none']);
    expect(promoted.aux.map((zone) => zone.id)).toEqual(['shared:none', 'other:none']);
  });
});

function zone(id: string): ZoneDef {
  return {
    id: asZoneId(id),
    owner: 'none',
    visibility: 'public',
    ordering: 'set',
  } as ZoneDef;
}
