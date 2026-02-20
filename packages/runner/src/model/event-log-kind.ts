export const EVENT_LOG_KINDS = [
  'movement',
  'variable',
  'trigger',
  'phase',
  'token',
  'iteration',
  'lifecycle',
] as const;

export type EventLogKind = (typeof EVENT_LOG_KINDS)[number];
