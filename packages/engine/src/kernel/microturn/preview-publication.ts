import type { GameDef, GameState } from '../types-core.js';
import type { GameDefRuntime } from '../gamedef-runtime.js';
import type { MicroturnState } from './types.js';
import { publishMicroturn, publishMicroturnFromPreviewStateNoHash } from './publish.js';

export type PreviewMicroturnPublication =
  | { readonly kind: 'published'; readonly microturn: MicroturnState }
  | { readonly kind: 'unbridgeable'; readonly error: Error };

const isMicroturnConstructibilityInvariant = (error: unknown): error is Error =>
  error instanceof Error && error.message.startsWith('MICROTURN_CONSTRUCTIBILITY_INVARIANT:');

export const tryPublishMicroturnForPreview = (
  def: GameDef,
  state: GameState,
  runtime?: GameDefRuntime,
): PreviewMicroturnPublication => {
  try {
    return { kind: 'published', microturn: publishMicroturn(def, state, runtime) };
  } catch (error) {
    if (isMicroturnConstructibilityInvariant(error)) {
      return { kind: 'unbridgeable', error };
    }
    throw error;
  }
};

export const tryPublishMicroturnFromPreviewStateNoHash = (
  def: GameDef,
  state: GameState,
  runtime?: GameDefRuntime,
): PreviewMicroturnPublication => {
  try {
    return { kind: 'published', microturn: publishMicroturnFromPreviewStateNoHash(def, state, runtime) };
  } catch (error) {
    if (isMicroturnConstructibilityInvariant(error)) {
      return { kind: 'unbridgeable', error };
    }
    throw error;
  }
};
