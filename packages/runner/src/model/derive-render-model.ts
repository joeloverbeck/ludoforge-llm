import type { GameDef, GameState } from '@ludoforge/engine/runtime';

import { VisualConfigProvider } from '../config/visual-config-provider.js';
import type { RenderModel } from './render-model.js';
import { deriveRunnerFrame } from './derive-runner-frame.js';
import { projectRenderModel } from './project-render-model.js';
import type { RunnerFrame } from './runner-frame.js';
import type { RenderContext } from '../store/store-types.js';

/**
 * Legacy convenience entry point for tests that still assert the DOM/UI projection.
 * The authoritative store contract is RunnerFrame; RenderModel is now a projection.
 */
export function deriveRenderModel(
  state: GameState,
  def: GameDef,
  context: RenderContext,
  previousModel: RenderModel | null = null,
): RenderModel {
  const visualConfigProvider = context.visualConfigProvider ?? new VisualConfigProvider(null);
  const previousFrame = previousModel === null
    ? null
    : null as RunnerFrame | null;
  const runnerFrame = deriveRunnerFrame(state, def, context, previousFrame);
  return projectRenderModel(runnerFrame, visualConfigProvider, previousModel);
}
