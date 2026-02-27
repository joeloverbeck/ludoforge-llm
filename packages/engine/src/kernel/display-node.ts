import type { LimitDef } from './types.js';

// ---------------------------------------------------------------------------
// Inline node types (leaf-level semantic tokens)
// ---------------------------------------------------------------------------

export interface DisplayKeywordNode {
  readonly kind: 'keyword';
  readonly text: string;
}

export interface DisplayOperatorNode {
  readonly kind: 'operator';
  readonly text: string;
}

export interface DisplayValueNode {
  readonly kind: 'value';
  readonly text: string;
  readonly valueType?: 'number' | 'boolean' | 'string';
}

export interface DisplayReferenceNode {
  readonly kind: 'reference';
  readonly text: string;
  readonly refKind: string;
}

export interface DisplayPunctuationNode {
  readonly kind: 'punctuation';
  readonly text: string;
}

export interface DisplayAnnotationNode {
  readonly kind: 'annotation';
  readonly annotationType: 'pass' | 'fail' | 'value' | 'usage';
  readonly text: string;
}

export type DisplayInlineNode =
  | DisplayKeywordNode
  | DisplayOperatorNode
  | DisplayValueNode
  | DisplayReferenceNode
  | DisplayPunctuationNode
  | DisplayAnnotationNode;

// ---------------------------------------------------------------------------
// Structural node types
// ---------------------------------------------------------------------------

export interface DisplayLineNode {
  readonly kind: 'line';
  readonly indent: number;
  readonly children: readonly DisplayInlineNode[];
}

export interface DisplayGroupNode {
  readonly kind: 'group';
  readonly label: string;
  readonly icon?: string;
  readonly children: readonly DisplayNode[];
  readonly collapsible?: boolean;
}

// ---------------------------------------------------------------------------
// Union types
// ---------------------------------------------------------------------------

export type DisplayNode = DisplayGroupNode | DisplayLineNode | DisplayInlineNode;

export type DisplayNodeKind = DisplayNode['kind'];

// ---------------------------------------------------------------------------
// Annotated action description
// ---------------------------------------------------------------------------

export interface LimitUsageInfo extends LimitDef {
  readonly current: number;
}

export interface AnnotatedActionDescription {
  readonly sections: readonly DisplayGroupNode[];
  readonly limitUsage: readonly LimitUsageInfo[];
}
