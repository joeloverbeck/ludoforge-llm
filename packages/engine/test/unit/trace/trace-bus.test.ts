// @test-class: architectural-invariant
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createTraceBus } from '../../../src/trace/trace-bus.js';
import type { TraceEvent } from '../../../src/trace/trace-events.js';

const INIT_EVENT: TraceEvent = {
  kind: 'game-initialized',
  seed: 42,
  playerCount: 4,
  phase: 'setup',
};

const TERMINAL_EVENT: TraceEvent = {
  kind: 'game-terminal',
  result: { type: 'draw' },
  turnCount: 10,
};

describe('TraceBus', () => {
  it('delivers events to subscribers synchronously', () => {
    const bus = createTraceBus();
    const received: TraceEvent[] = [];
    bus.subscribe((event) => {
      received.push(event);
    });

    bus.emit(INIT_EVENT);

    assert.equal(received.length, 1);
    assert.deepStrictEqual(received[0], INIT_EVENT);
  });

  it('delivers events to multiple subscribers', () => {
    const bus = createTraceBus();
    const a: TraceEvent[] = [];
    const b: TraceEvent[] = [];
    bus.subscribe((event) => { a.push(event); });
    bus.subscribe((event) => { b.push(event); });

    bus.emit(INIT_EVENT);

    assert.equal(a.length, 1);
    assert.equal(b.length, 1);
  });

  it('subscribe returns an unsubscribe function', () => {
    const bus = createTraceBus();
    const received: TraceEvent[] = [];
    const unsubscribe = bus.subscribe((event) => {
      received.push(event);
    });

    bus.emit(INIT_EVENT);
    assert.equal(received.length, 1);

    unsubscribe();
    bus.emit(TERMINAL_EVENT);
    assert.equal(received.length, 1);
  });

  it('unsubscribeAll removes all subscribers', () => {
    const bus = createTraceBus();
    const a: TraceEvent[] = [];
    const b: TraceEvent[] = [];
    bus.subscribe((event) => { a.push(event); });
    bus.subscribe((event) => { b.push(event); });

    bus.emit(INIT_EVENT);
    assert.equal(a.length, 1);
    assert.equal(b.length, 1);

    bus.unsubscribeAll();
    bus.emit(TERMINAL_EVENT);
    assert.equal(a.length, 1);
    assert.equal(b.length, 1);
  });

  it('emit with no subscribers is a no-op', () => {
    const bus = createTraceBus();
    bus.emit(INIT_EVENT);
  });

  it('unsubscribing the same subscriber twice is safe', () => {
    const bus = createTraceBus();
    const received: TraceEvent[] = [];
    const unsubscribe = bus.subscribe((event) => {
      received.push(event);
    });

    unsubscribe();
    unsubscribe();

    bus.emit(INIT_EVENT);
    assert.equal(received.length, 0);
  });
});
