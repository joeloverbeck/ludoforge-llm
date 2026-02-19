import { describe, expect, it } from 'vitest';

import * as layoutTypes from '../../src/layout/layout-types';

describe('layout-types', () => {
  it('has no runtime exports', () => {
    expect(Object.keys(layoutTypes)).toEqual([]);
  });
});
