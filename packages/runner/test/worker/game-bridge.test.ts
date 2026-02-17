import { beforeEach, describe, expect, it, vi } from 'vitest';

const { wrapMock, proxyMock } = vi.hoisted(() => ({
  wrapMock: vi.fn(),
  proxyMock: vi.fn((value: unknown) => value),
}));

vi.mock('comlink', () => ({
  wrap: wrapMock,
  proxy: proxyMock,
}));

import { createGameBridge, proxy } from '../../src/bridge/game-bridge';

interface WorkerRecord {
  readonly instance: {
    terminate: ReturnType<typeof vi.fn>;
  };
  readonly scriptURL: string | URL;
  readonly options?: WorkerOptions;
}

const workerRecords: WorkerRecord[] = [];

class MockWorker {
  public readonly terminate = vi.fn();

  public constructor(scriptURL: string | URL, options?: WorkerOptions) {
    workerRecords.push({
      instance: this,
      scriptURL,
      ...(options === undefined ? {} : { options }),
    });
  }
}

beforeEach(() => {
  workerRecords.length = 0;
  wrapMock.mockReset();
  proxyMock.mockClear();
  vi.stubGlobal('Worker', MockWorker as unknown as typeof Worker);
});

describe('createGameBridge', () => {
  it('constructs a module worker and wraps it with Comlink', () => {
    const expectedBridge = { kind: 'mock-bridge' };
    wrapMock.mockReturnValue(expectedBridge);

    const handle = createGameBridge();

    expect(workerRecords).toHaveLength(1);
    const record = workerRecords[0]!;
    expect(record.options).toEqual({ type: 'module' });
    expect(record.scriptURL).toBeInstanceOf(URL);
    expect((record.scriptURL as URL).pathname).toMatch(/\/src\/worker\/game-worker\.ts$/);

    expect(wrapMock).toHaveBeenCalledTimes(1);
    expect(wrapMock).toHaveBeenCalledWith(record.instance);
    expect(handle.bridge).toBe(expectedBridge);
  });

  it('terminates the underlying worker via handle.terminate()', () => {
    wrapMock.mockReturnValue({ kind: 'mock-bridge' });
    const handle = createGameBridge();
    const record = workerRecords[0]!;

    handle.terminate();

    expect(record.instance.terminate).toHaveBeenCalledTimes(1);
  });

  it('re-exports Comlink proxy for callback bridging', () => {
    expect(proxy).toBe(proxyMock);
  });
});
