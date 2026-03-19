import { forwardRef, useId, type ButtonHTMLAttributes, type ReactElement } from 'react';

import styles from './SettingsMenuTrigger.module.css';

interface SettingsMenuTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-expanded' | 'aria-haspopup' | 'aria-controls'> {
  readonly menuId: string;
  readonly open: boolean;
  readonly label?: string;
}

export const SettingsMenuTrigger = forwardRef<HTMLButtonElement, SettingsMenuTriggerProps>(function SettingsMenuTrigger(
  {
    menuId,
    open,
    label = 'Settings',
    className,
    type = 'button',
    ...buttonProps
  },
  ref,
): ReactElement {
  const generatedId = useId();
  const triggerId = buttonProps.id ?? `settings-menu-trigger-${generatedId}`;

  return (
    <button
      {...buttonProps}
      id={triggerId}
      ref={ref}
      type={type}
      className={className === undefined ? styles.trigger : `${styles.trigger} ${className}`}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={menuId}
      data-testid="settings-menu-trigger"
    >
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M10.2 2.9h3.6l.7 2.1c.6.2 1.2.5 1.8.8l2.1-.8 1.8 3.1-1.5 1.6c.1.3.1.7.1 1s0 .7-.1 1l1.5 1.6-1.8 3.1-2.1-.8c-.6.3-1.2.6-1.8.8l-.7 2.1h-3.6l-.7-2.1c-.6-.2-1.2-.5-1.8-.8l-2.1.8-1.8-3.1 1.5-1.6a7 7 0 0 1 0-2L3.6 8.1 5.4 5l2.1.8c.6-.3 1.2-.6 1.8-.8z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle
          cx="12"
          cy="12"
          r="3.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
      <span className={styles.label}>{label}</span>
    </button>
  );
});
