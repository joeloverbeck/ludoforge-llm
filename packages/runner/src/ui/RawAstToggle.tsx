import { useState, type ReactElement } from 'react';
import type { DisplayGroupNode } from '@ludoforge/engine/runtime';

import { renderGroup } from './display-node-renderers.js';
import styles from './RawAstToggle.module.css';

interface RawAstToggleProps {
  readonly sections: readonly DisplayGroupNode[];
}

export function RawAstToggle({ sections }: RawAstToggleProps): ReactElement {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={styles.section} data-testid="raw-ast-toggle">
      <button
        type="button"
        className={styles.header}
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        data-testid="raw-ast-button"
      >
        <span className={styles.chevron}>{expanded ? '\u25BE' : '\u25B8'}</span>
        {' '}Raw AST
      </button>
      {expanded && (
        <div className={styles.content} data-testid="raw-ast-content">
          {sections.map((section, i) => renderGroup(section, `ast-s${i}`))}
        </div>
      )}
    </div>
  );
}
