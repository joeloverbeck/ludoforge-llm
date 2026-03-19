import type { GameDef, GameState } from '@ludoforge/engine/runtime';

import { VisualConfigProvider } from '../../../src/config/visual-config-provider.js';
import { deriveRunnerFrame } from '../../../src/model/derive-runner-frame.js';
import { projectRenderModel } from '../../../src/model/project-render-model.js';
import type { RenderModel } from '../../../src/model/render-model.js';
import type { RunnerFrame } from '../../../src/model/runner-frame.js';
import type { RenderContext } from '../../../src/store/store-types.js';

export interface DerivedProjection {
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
  const frame = deriveRunnerFrame(state, def, context, options.previous?.frame ?? null);
  const model = projectRenderModel(
    frame,
    options.visualConfigProvider ?? new VisualConfigProvider(null),
    options.previous?.model ?? null,
  );

  return { frame, model };
}
