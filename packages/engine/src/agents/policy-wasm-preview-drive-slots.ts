import { stablePayloadCode } from '../cnl/policy-bytecode/feature-table.js';
import type {
  PolicyWasmPreviewStateSlot,
  PolicyWasmPreviewStateSlotKind,
  PolicyWasmPreviewStateSlotLifetime,
} from './policy-wasm-preview-drive.js';

const I32_BYTES = 4;

export const inferPolicyWasmPreviewStateSlotKind = (id: string): PolicyWasmPreviewStateSlotKind => {
  if (id.startsWith('global.')) return 'global';
  if (id.startsWith('feature.')) return 'feature';
  if (id.startsWith('surface.')) return 'surface';
  return 'generic';
};

export const previewStateSlotKindCode = (kind: PolicyWasmPreviewStateSlotKind): number => {
  switch (kind) {
    case 'global': return 1;
    case 'feature': return 2;
    case 'surface': return 3;
    case 'generic': return 4;
  }
};

export const previewStateSlotLifetimeCode = (lifetime: PolicyWasmPreviewStateSlotLifetime): number => {
  switch (lifetime) {
    case 'singleIteration': return 1;
    case 'crossIteration': return 2;
  }
};

export const decodePreviewStateSlots = (
  expectedSlots: readonly PolicyWasmPreviewStateSlot[],
  view: DataView,
  outPreviewStateSlotMetadataPtr: number,
): readonly PolicyWasmPreviewStateSlot[] =>
  expectedSlots.map((slot, slotIndex) => {
    const base = outPreviewStateSlotMetadataPtr + (slotIndex * 3 * I32_BYTES);
    const slotCode = view.getInt32(base, true);
    const expectedSlotCode = stablePayloadCode({ literal: slot.id });
    if (slotCode !== expectedSlotCode) {
      throw new Error(`Policy WASM preview-drive slot id code mismatch for slot ${slotIndex}.`);
    }
    return {
      id: slot.id,
      kind: decodePreviewStateSlotKind(view.getInt32(base + I32_BYTES, true)),
      lifetime: decodePreviewStateSlotLifetime(view.getInt32(base + (2 * I32_BYTES), true)),
    };
  });

const decodePreviewStateSlotKind = (code: number): PolicyWasmPreviewStateSlotKind => {
  switch (code) {
    case 1: return 'global';
    case 2: return 'feature';
    case 3: return 'surface';
    case 4: return 'generic';
    default: throw new Error(`Policy WASM preview-drive returned unknown preview-state slot kind ${code}.`);
  }
};

const decodePreviewStateSlotLifetime = (code: number): PolicyWasmPreviewStateSlotLifetime => {
  switch (code) {
    case 1: return 'singleIteration';
    case 2: return 'crossIteration';
    default: throw new Error(`Policy WASM preview-drive returned unknown preview-state slot lifetime ${code}.`);
  }
};
