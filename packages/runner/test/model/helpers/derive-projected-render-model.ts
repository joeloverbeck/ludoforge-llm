import type { GameDef, GameState } from '@ludoforge/engine/runtime';

import { VisualConfigProvider } from '../../../src/config/visual-config-provider.js';
import { deriveRunnerFrame } from '../../../src/model/derive-runner-frame.js';
import { projectRenderModel } from '../../../src/model/project-render-model.js';
import type { RenderModel } from '../../../src/model/render-model.js';
import type { RunnerFrame, RunnerProjectionBundle } from '../../../src/model/runner-frame.js';
import type { RenderContext } from '../../../src/store/store-types.js';

export interface DerivedProjection {
  readonly bundle: RunnerProjectionBundle;
  readonly frame: RunnerFrame;
  readonly model: RenderModel;
}

interface DeriveProjectedRenderModelOptions {
  readonly previous?: DerivedProjection | null;
  readonly visualConfigProvider?: VisualConfigProvider;
}

export function deriveProjectedRenderModel(
  state: GameState,
  def: GameDef,
  context: RenderContext,
  options: DeriveProjectedRenderModelOptions = {},
): DerivedProjection {
  const bundle = deriveRunnerFrame(state, def, context, options.previous?.bundle ?? null);
  const model = projectRenderModel(
    bundle,
    options.visualConfigProvider ?? new VisualConfigProvider(null),
    options.previous?.model ?? null,
  );

  return { bundle, frame: bundle.frame, model };
}
