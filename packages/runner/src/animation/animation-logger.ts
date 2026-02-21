import type { EffectTraceEntry } from '@ludoforge/engine/runtime';
import type { AnimationDescriptor } from './animation-types.js';

// ---------------------------------------------------------------------------
// Log entry shapes
// ---------------------------------------------------------------------------

export interface TraceReceivedLogEntry {
  readonly traceLength: number;
  readonly isSetup: boolean;
  readonly entries: readonly EffectTraceEntry[];
}

export interface DescriptorsMappedLogEntry {
  readonly inputCount: number;
  readonly outputCount: number;
  readonly skippedCount: number;
  readonly descriptors: readonly AnimationDescriptor[];
}

export interface TimelineBuiltLogEntry {
  readonly visualDescriptorCount: number;
  readonly groupCount: number;
}

export type QueueEventType =
  | 'enqueue'
  | 'playStart'
  | 'playComplete'
  | 'skip'
  | 'skipAll'
  | 'drop'
  | 'flush';

export interface QueueEventLogEntry {
  readonly event: QueueEventType;
  readonly queueLength: number;
  readonly isPlaying: boolean;
}

// ---------------------------------------------------------------------------
// Console abstraction (for testing)
// ---------------------------------------------------------------------------

export interface LoggerConsole {
  group(...args: unknown[]): void;
  groupEnd(): void;
  log(...args: unknown[]): void;
  table(data: unknown): void;
}

// ---------------------------------------------------------------------------
// Logger interface
// ---------------------------------------------------------------------------

export interface AnimationLogger {
  readonly enabled: boolean;
  setEnabled(enabled: boolean): void;
  logTraceReceived(entry: TraceReceivedLogEntry): void;
  logDescriptorsMapped(entry: DescriptorsMappedLogEntry): void;
  logTimelineBuilt(entry: TimelineBuiltLogEntry): void;
  logQueueEvent(entry: QueueEventLogEntry): void;
}

// ---------------------------------------------------------------------------
// Summary helpers (exported for direct testing)
// ---------------------------------------------------------------------------

export interface TraceEntrySummary {
  readonly kind: string;
  readonly tokenId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly zone?: string;
  readonly varName?: string;
}

export function summarizeTraceEntries(entries: readonly EffectTraceEntry[]): readonly TraceEntrySummary[] {
  return entries.map((entry) => {
    const base: TraceEntrySummary = { kind: entry.kind };
    switch (entry.kind) {
      case 'moveToken':
        return { ...base, tokenId: entry.tokenId, from: entry.from, to: entry.to };
      case 'createToken':
      case 'destroyToken':
        return { ...base, tokenId: entry.tokenId, zone: entry.zone };
      case 'setTokenProp':
        return { ...base, tokenId: entry.tokenId };
      case 'varChange':
        return { ...base, varName: entry.varName };
      case 'resourceTransfer':
        return { ...base, from: entry.from.varName, to: entry.to.varName };
      default:
        return base;
    }
  });
}

export interface DescriptorSummary {
  readonly kind: string;
  readonly tokenId?: string;
  readonly from?: string;
  readonly to?: string;
}

export function summarizeDescriptors(descriptors: readonly AnimationDescriptor[]): readonly DescriptorSummary[] {
  return descriptors.map((descriptor) => {
    const base: DescriptorSummary = { kind: descriptor.kind };
    switch (descriptor.kind) {
      case 'moveToken':
      case 'cardDeal':
      case 'cardBurn':
        return { ...base, tokenId: descriptor.tokenId, from: descriptor.from, to: descriptor.to };
      case 'createToken':
      case 'destroyToken':
        return { ...base, tokenId: descriptor.tokenId };
      case 'setTokenProp':
      case 'cardFlip':
        return { ...base, tokenId: descriptor.tokenId };
      default:
        return base;
    }
  });
}

// ---------------------------------------------------------------------------
// Stage label colors
// ---------------------------------------------------------------------------

const STAGE_STYLES: Record<string, string> = {
  trace: 'color: #00bcd4; font-weight: bold',
  descriptors: 'color: #4caf50; font-weight: bold',
  timeline: 'color: #ff9800; font-weight: bold',
  queue: 'color: #9c27b0; font-weight: bold',
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface CreateAnimationLoggerOptions {
  readonly console?: LoggerConsole;
  readonly enabled?: boolean;
}

export function createAnimationLogger(options?: CreateAnimationLoggerOptions): AnimationLogger {
  const cons: LoggerConsole = options?.console ?? globalThis.console;
  let enabled = options?.enabled ?? false;

  return {
    get enabled(): boolean {
      return enabled;
    },

    setEnabled(value: boolean): void {
      enabled = value;
    },

    logTraceReceived(entry: TraceReceivedLogEntry): void {
      if (!enabled) return;
      cons.group(`%c[AnimTrace] Trace received (${entry.traceLength} entries, setup=${entry.isSetup})`, STAGE_STYLES.trace);
      cons.table(summarizeTraceEntries(entry.entries));
      cons.groupEnd();
    },

    logDescriptorsMapped(entry: DescriptorsMappedLogEntry): void {
      if (!enabled) return;
      cons.group(`%c[AnimDesc] Mapped ${entry.inputCount} trace → ${entry.outputCount} descriptors (${entry.skippedCount} skipped)`, STAGE_STYLES.descriptors);
      cons.table(summarizeDescriptors(entry.descriptors));
      cons.groupEnd();
    },

    logTimelineBuilt(entry: TimelineBuiltLogEntry): void {
      if (!enabled) return;
      cons.log(`%c[AnimTimeline] Built timeline: ${entry.visualDescriptorCount} visual descriptors, ${entry.groupCount} groups`, STAGE_STYLES.timeline);
    },

    logQueueEvent(entry: QueueEventLogEntry): void {
      if (!enabled) return;
      cons.log(`%c[AnimQueue] ${entry.event} — queue: ${entry.queueLength}, playing: ${entry.isPlaying}`, STAGE_STYLES.queue);
    },
  };
}
