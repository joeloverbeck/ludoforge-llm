// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UnsavedChangesDialog } from '../../src/ui/UnsavedChangesDialog.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('UnsavedChangesDialog', () => {
  it('does not render when closed', () => {
    render(createElement(UnsavedChangesDialog, {
      isOpen: false,
      onDiscard: vi.fn(),
      onCancel: vi.fn(),
    }));

    expect(screen.queryByTestId('unsaved-changes-dialog')).toBeNull();
  });

  it('renders and calls callbacks for Discard and Cancel', () => {
    const onDiscard = vi.fn();
    const onCancel = vi.fn();

    render(createElement(UnsavedChangesDialog, {
      isOpen: true,
      onDiscard,
      onCancel,
    }));

    expect(screen.getByTestId('unsaved-changes-dialog')).toBeTruthy();

    fireEvent.click(screen.getByTestId('unsaved-changes-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('unsaved-changes-discard'));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
