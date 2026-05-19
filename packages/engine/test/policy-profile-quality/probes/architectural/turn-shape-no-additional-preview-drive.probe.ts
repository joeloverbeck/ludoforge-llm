import { defineProbe } from '../define-probe.js';

export const turnShapeDoesNotTriggerAdditionalPreviewDrive = defineProbe({
  id: 'turn-shape-no-additional-preview-drive',
  game: 'turn-shape-architectural-fixture',
  profile: 'baseline',
  seat: 'alpha',
  stateBinding: {
    scenario: 'default',
    seed: 3016,
  },
  decisionBinding: {
    contextKind: 'actionSelection',
    occurrence: 'first',
  },
  assertions: [
    {
      kind: 'turnShapeNoAdditionalPreviewDrive',
    },
  ],
  severity: 'architecturalInvariant',
  tags: ['turn-shape', 'preview-drive', 'foundation-20', 'arch-invariant'],
});

export const probes = [turnShapeDoesNotTriggerAdditionalPreviewDrive] as const;
