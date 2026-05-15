import { buildEncodedStateLayout, type EncodedStateLayout } from '../kernel/encoded-state/index.js';
import type { GameDef } from '../kernel/types.js';

const encodedStateLayoutCache = new WeakMap<GameDef, EncodedStateLayout>();

export function getPolicyEncodedStateLayout(def: GameDef): EncodedStateLayout {
  let layout = encodedStateLayoutCache.get(def);
  if (layout === undefined) {
    layout = buildEncodedStateLayout(def);
    encodedStateLayoutCache.set(def, layout);
  }
  return layout;
}
