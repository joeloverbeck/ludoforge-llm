import type { InternTable } from './types.js';

export type InternedDomain = keyof InternTable;

const domainEntries = (table: InternTable, domain: InternedDomain): readonly string[] => table[domain];

const externIndex = (entries: readonly string[], index: number, label: string): string => {
  if (!Number.isInteger(index) || index < 0 || index >= entries.length) {
    throw new Error(`Unknown ${label} index: ${String(index)}`);
  }
  return entries[index]!;
};

const internName = (entries: readonly string[], name: string, label: string): number => {
  const index = entries.indexOf(name);
  if (index === -1) {
    throw new Error(`Unknown ${label}: ${name}`);
  }
  return index;
};

export const externInternedIndex = (
  table: InternTable,
  domain: InternedDomain,
  index: number,
): string => externIndex(domainEntries(table, domain), index, domain);

export const internInternedName = (
  table: InternTable,
  domain: InternedDomain,
  name: string,
): number => internName(domainEntries(table, domain), name, domain);

export const externZoneIndex = (index: number, table: InternTable): string => externIndex(table.zones, index, 'zone');
export const internZoneName = (name: string, table: InternTable): number => internName(table.zones, name, 'zone');

export const externActionIndex = (index: number, table: InternTable): string =>
  externIndex(table.actions, index, 'action');
export const internActionName = (name: string, table: InternTable): number =>
  internName(table.actions, name, 'action');

export const externTokenTypeIndex = (index: number, table: InternTable): string =>
  externIndex(table.tokenTypes, index, 'tokenType');
export const internTokenTypeName = (name: string, table: InternTable): number =>
  internName(table.tokenTypes, name, 'tokenType');

export const externSeatIndex = (index: number, table: InternTable): string => externIndex(table.seats, index, 'seat');
export const internSeatName = (name: string, table: InternTable): number => internName(table.seats, name, 'seat');

export const externPlayerIndex = (index: number, table: InternTable): string =>
  externIndex(table.players, index, 'player');
export const internPlayerName = (name: string, table: InternTable): number =>
  internName(table.players, name, 'player');

export const externPhaseIndex = (index: number, table: InternTable): string =>
  externIndex(table.phases, index, 'phase');
export const internPhaseName = (name: string, table: InternTable): number =>
  internName(table.phases, name, 'phase');

export const externGlobalVarIndex = (index: number, table: InternTable): string =>
  externIndex(table.globalVars, index, 'globalVar');
export const internGlobalVarName = (name: string, table: InternTable): number =>
  internName(table.globalVars, name, 'globalVar');

export const externPerPlayerVarIndex = (index: number, table: InternTable): string =>
  externIndex(table.perPlayerVars, index, 'perPlayerVar');
export const internPerPlayerVarName = (name: string, table: InternTable): number =>
  internName(table.perPlayerVars, name, 'perPlayerVar');

export const externZoneVarIndex = (index: number, table: InternTable): string =>
  externIndex(table.zoneVars, index, 'zoneVar');
export const internZoneVarName = (name: string, table: InternTable): number =>
  internName(table.zoneVars, name, 'zoneVar');
