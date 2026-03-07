import type { ReactElement } from 'react';
import type {
  DisplayGroupNode,
  DisplayInlineNode,
  DisplayLineNode,
  DisplayNode,
} from '@ludoforge/engine/runtime';

import styles from './ActionTooltip.module.css';

const INDENT_PX = 12;

function annotationClass(annotationType: string): string {
  switch (annotationType) {
    case 'pass': return styles.annotationPass ?? '';
    case 'fail': return styles.annotationFail ?? '';
    case 'value': return styles.annotationValue ?? '';
    case 'usage': return styles.annotationUsage ?? '';
    default: return styles.annotation ?? '';
  }
}

function inlineClass(kind: string): string {
  switch (kind) {
    case 'keyword': return styles.keyword ?? '';
    case 'operator': return styles.operator ?? '';
    case 'value': return styles.value ?? '';
    case 'reference': return styles.reference ?? '';
    case 'punctuation': return styles.punctuation ?? '';
    default: return '';
  }
}

export function renderInlineNode(node: DisplayInlineNode, key: string): ReactElement {
  if (node.kind === 'annotation') {
    return <span key={key} className={annotationClass(node.annotationType)}>{node.text}</span>;
  }
  return <span key={key} className={inlineClass(node.kind)}>{node.text}</span>;
}

export function renderLine(line: DisplayLineNode, key: string): ReactElement {
  return (
    <div
      key={key}
      className={styles.line}
      style={line.indent > 0 ? { paddingLeft: line.indent * INDENT_PX } : undefined}
    >
      {line.children.map((child, i) => renderInlineNode(child, `${key}-i${i}`))}
    </div>
  );
}

export function renderNode(node: DisplayNode, key: string): ReactElement {
  switch (node.kind) {
    case 'group':
      return renderGroup(node, key);
    case 'line':
      return renderLine(node, key);
    default:
      return renderInlineNode(node as DisplayInlineNode, key);
  }
}

export function renderGroup(group: DisplayGroupNode, key: string): ReactElement {
  return (
    <div key={key} className={styles.group}>
      <span className={styles.groupLabel}>
        {group.icon !== undefined ? `${group.icon} ` : ''}{group.label}
      </span>
      {group.children.map((child, i) => renderNode(child, `${key}-c${i}`))}
    </div>
  );
}
