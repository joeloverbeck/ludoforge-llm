import type { EncodedState, EncodedStateLayout } from '../kernel/encoded-state/index.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';

export type PolicyEvalCacheBinding =
  | {
    readonly kind: 'runtime';
    readonly runtime: GameDefRuntime;
    readonly preEncoded?: {
      readonly layout: EncodedStateLayout;
      readonly encoded: EncodedState;
    };
  }
  | {
    readonly kind: 'isolated';
  }
  | {
    readonly kind: 'preEncoded';
    readonly layout: EncodedStateLayout;
    readonly encoded: EncodedState;
  };

export interface ResolvedPolicyEvalCacheBinding {
  readonly runtime?: GameDefRuntime;
  readonly preEncoded?: {
    readonly layout: EncodedStateLayout;
    readonly encoded: EncodedState;
  };
}

export function resolvePolicyEvalCacheBinding(binding: PolicyEvalCacheBinding): ResolvedPolicyEvalCacheBinding {
  switch (binding.kind) {
    case 'runtime':
      return {
        runtime: binding.runtime,
        ...(binding.preEncoded === undefined ? {} : { preEncoded: binding.preEncoded }),
      };
    case 'preEncoded':
      return { preEncoded: { layout: binding.layout, encoded: binding.encoded } };
    case 'isolated':
      return {};
  }
}

export function createPolicyEvalCacheBinding(
  runtime: GameDefRuntime | undefined,
  preEncoded?: { readonly layout: EncodedStateLayout; readonly encoded: EncodedState },
): PolicyEvalCacheBinding {
  if (runtime === undefined) {
    return preEncoded === undefined
      ? { kind: 'isolated' }
      : { kind: 'preEncoded', layout: preEncoded.layout, encoded: preEncoded.encoded };
  }
  return preEncoded === undefined
    ? { kind: 'runtime', runtime }
    : { kind: 'runtime', runtime, preEncoded };
}
