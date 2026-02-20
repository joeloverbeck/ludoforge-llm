// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReplayPlaceholder } from '../../src/ui/screens/ReplayPlaceholder.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('session placeholders', () => {
  it('renders replay placeholder and emits back action', () => {
    const onBackToMenu = vi.fn();

    render(createElement(ReplayPlaceholder, { onBackToMenu }));

    fireEvent.click(screen.getByTestId('replay-back-to-menu'));
    expect(onBackToMenu).toHaveBeenCalledTimes(1);
  });
});
