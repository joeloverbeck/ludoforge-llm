import type { EffectTraceEntry } from '@ludoforge/engine/runtime';

import type {
  DiagnosticBatch,
  DiagnosticQueueEvent,
  EphemeralCreatedEntry,
  FaceControllerCallEntry,
  SpriteResolutionEntry,
  TokenVisibilityInitEntry,
  TweenLogEntry,
} from './animation-diagnostics.js';
import type { AnimationDescriptor } from './animation-types.js';

export interface DiagnosticBuffer {
  readonly maxBatches: number;
  beginBatch(isSetup: boolean): void;
  recordTrace(entries: readonly EffectTraceEntry[]): void;
  recordDescriptors(descriptors: readonly AnimationDescriptor[], skippedCount: number): void;
  recordSpriteResolution(entry: SpriteResolutionEntry): void;
  recordEphemeralCreated(entry: EphemeralCreatedEntry): void;
  recordTween(entry: TweenLogEntry): void;
  recordFaceControllerCall(entry: FaceControllerCallEntry): void;
  recordTokenVisibilityInit(entry: TokenVisibilityInitEntry): void;
  recordQueueEvent(entry: DiagnosticQueueEvent): void;
  recordWarning(message: string): void;
  endBatch(): void;
  getBatches(): readonly DiagnosticBatch[];
  downloadAsJson(): void;
  clear(): void;
}

export interface DiagnosticBufferRuntime {
  downloadJson(payload: { readonly filename: string; readonly mimeType: string; readonly content: string }): void;
}

interface MutableBatch {
  readonly batchId: number;
  readonly timestampIso: string;
  readonly isSetup: boolean;
  traceEntries: readonly EffectTraceEntry[];
  descriptors: readonly AnimationDescriptor[];
  skippedCount: number;
  spriteResolutions: SpriteResolutionEntry[];
  ephemeralsCreated: EphemeralCreatedEntry[];
  tweens: TweenLogEntry[];
  faceControllerCalls: FaceControllerCallEntry[];
  tokenVisibilityInits: TokenVisibilityInitEntry[];
  queueEvent?: DiagnosticQueueEvent;
  warnings: string[];
}

function cloneSerializable<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const key of Reflect.ownKeys(value as object)) {
    const member = (value as Record<PropertyKey, unknown>)[key];
    if (member !== null && typeof member === 'object') {
      deepFreeze(member);
    }
  }
  return value;
}

function toFrozenBatch(batch: MutableBatch): DiagnosticBatch {
  const frozen: DiagnosticBatch = {
    batchId: batch.batchId,
    timestampIso: batch.timestampIso,
    isSetup: batch.isSetup,
    traceEntries: cloneSerializable(batch.traceEntries),
    descriptors: cloneSerializable(batch.descriptors),
    skippedCount: batch.skippedCount,
    spriteResolutions: cloneSerializable(batch.spriteResolutions),
    ephemeralsCreated: cloneSerializable(batch.ephemeralsCreated),
    tweens: cloneSerializable(batch.tweens),
    faceControllerCalls: cloneSerializable(batch.faceControllerCalls),
    tokenVisibilityInits: cloneSerializable(batch.tokenVisibilityInits),
    ...(batch.queueEvent ? { queueEvent: cloneSerializable(batch.queueEvent) } : {}),
    warnings: cloneSerializable(batch.warnings),
  };
  return deepFreeze(frozen);
}

function sanitizeTimestampForFilename(timestampIso: string): string {
  return timestampIso.replace(/[:]/g, '-');
}

function createDefaultRuntime(): DiagnosticBufferRuntime {
  return {
    downloadJson(payload): void {
      if (
        typeof Blob === 'undefined' ||
        typeof URL === 'undefined' ||
        typeof URL.createObjectURL !== 'function' ||
        typeof URL.revokeObjectURL !== 'function' ||
        typeof document === 'undefined'
      ) {
        return;
      }

      const blob = new Blob([payload.content], { type: payload.mimeType });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = payload.filename;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    },
  };
}

function createMutableBatch(batchId: number, isSetup: boolean): MutableBatch {
  return {
    batchId,
    timestampIso: new Date().toISOString(),
    isSetup,
    traceEntries: [],
    descriptors: [],
    skippedCount: 0,
    spriteResolutions: [],
    ephemeralsCreated: [],
    tweens: [],
    faceControllerCalls: [],
    tokenVisibilityInits: [],
    warnings: [],
  };
}

export function createDiagnosticBuffer(
  maxBatches = 100,
  runtime: DiagnosticBufferRuntime = createDefaultRuntime(),
): DiagnosticBuffer {
  if (!Number.isInteger(maxBatches) || maxBatches < 1) {
    throw new RangeError('Diagnostic buffer maxBatches must be a positive integer');
  }

  const batches: DiagnosticBatch[] = [];
  let currentBatch: MutableBatch | undefined;
  let nextBatchId = 1;

  function appendBatch(batch: DiagnosticBatch): void {
    batches.push(batch);
    if (batches.length > maxBatches) {
      batches.shift();
    }
  }

  function withCurrentBatch(mutator: (batch: MutableBatch) => void): void {
    if (!currentBatch) {
      return;
    }
    mutator(currentBatch);
  }

  function exportPayload(): string {
    const snapshot = batches.slice();
    const oldestBatchId = snapshot[0]?.batchId ?? 0;
    const newestBatchId = snapshot[snapshot.length - 1]?.batchId ?? 0;
    const payload = {
      meta: {
        exportedAt: new Date().toISOString(),
        batchCount: snapshot.length,
        oldestBatchId,
        newestBatchId,
      },
      batches: snapshot,
    };
    return JSON.stringify(payload, null, 2);
  }

  return {
    maxBatches,

    beginBatch(isSetup: boolean): void {
      if (currentBatch) {
        const finalized = toFrozenBatch(currentBatch);
        appendBatch(finalized);
      }
      currentBatch = createMutableBatch(nextBatchId, isSetup);
      nextBatchId += 1;
    },

    recordTrace(entries: readonly EffectTraceEntry[]): void {
      withCurrentBatch((batch) => {
        batch.traceEntries = cloneSerializable(entries);
      });
    },

    recordDescriptors(descriptors: readonly AnimationDescriptor[], skippedCount: number): void {
      withCurrentBatch((batch) => {
        batch.descriptors = cloneSerializable(descriptors);
        batch.skippedCount = skippedCount;
      });
    },

    recordSpriteResolution(entry: SpriteResolutionEntry): void {
      withCurrentBatch((batch) => {
        batch.spriteResolutions.push(cloneSerializable(entry));
      });
    },

    recordEphemeralCreated(entry: EphemeralCreatedEntry): void {
      withCurrentBatch((batch) => {
        batch.ephemeralsCreated.push(cloneSerializable(entry));
      });
    },

    recordTween(entry: TweenLogEntry): void {
      withCurrentBatch((batch) => {
        batch.tweens.push(cloneSerializable(entry));
      });
    },

    recordFaceControllerCall(entry: FaceControllerCallEntry): void {
      withCurrentBatch((batch) => {
        batch.faceControllerCalls.push(cloneSerializable(entry));
      });
    },

    recordTokenVisibilityInit(entry: TokenVisibilityInitEntry): void {
      withCurrentBatch((batch) => {
        batch.tokenVisibilityInits.push(cloneSerializable(entry));
      });
    },

    recordQueueEvent(entry: DiagnosticQueueEvent): void {
      withCurrentBatch((batch) => {
        batch.queueEvent = cloneSerializable(entry);
      });
    },

    recordWarning(message: string): void {
      withCurrentBatch((batch) => {
        batch.warnings.push(message);
      });
    },

    endBatch(): void {
      if (!currentBatch) {
        return;
      }
      const finalized = toFrozenBatch(currentBatch);
      appendBatch(finalized);
      currentBatch = undefined;
    },

    getBatches(): readonly DiagnosticBatch[] {
      return Object.freeze(batches.slice());
    },

    downloadAsJson(): void {
      const timestampIso = new Date().toISOString();
      runtime.downloadJson({
        filename: `anim-diagnostic-${sanitizeTimestampForFilename(timestampIso)}.json`,
        mimeType: 'application/json',
        content: exportPayload(),
      });
    },

    clear(): void {
      batches.length = 0;
      currentBatch = undefined;
    },
  };
}
