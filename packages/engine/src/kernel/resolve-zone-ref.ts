import type { ZoneId } from './branded.js';
import type { EvalContext } from './eval-context.js';
import { evalValue } from './eval-value.js';
import { resolveSingleZoneSel } from './resolve-selectors.js';
import type { ZoneRef } from './types.js';

export function resolveZoneRef(ref: ZoneRef, ctx: EvalContext): ZoneId {
  if (typeof ref === 'string') {
    return resolveSingleZoneSel(ref, ctx);
  }
  const zoneString = String(evalValue(ref.zoneExpr, ctx));
  return resolveSingleZoneSel(zoneString, ctx);
}
