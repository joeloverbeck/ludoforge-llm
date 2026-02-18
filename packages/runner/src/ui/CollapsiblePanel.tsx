import { useState, type ReactElement, type ReactNode } from 'react';

import styles from './CollapsiblePanel.module.css';

interface CollapsiblePanelProps {
  readonly title: string;
  readonly panelTestId: string;
  readonly toggleTestId: string;
  readonly contentTestId: string;
  readonly children?: ReactNode;
}

export function CollapsiblePanel({
  title,
  panelTestId,
  toggleTestId,
  contentTestId,
  children,
}: CollapsiblePanelProps): ReactElement {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className={styles.panel} data-testid={panelTestId} aria-label={`${title} panel`}>
      <button
        type="button"
        className={styles.toggle}
        data-testid={toggleTestId}
        onClick={() => {
          setCollapsed((value) => !value);
        }}
      >
        {title} {collapsed ? 'Show' : 'Hide'}
      </button>
      {collapsed ? null : (
        <div className={styles.content} data-testid={contentTestId}>
          {children}
        </div>
      )}
    </section>
  );
}
