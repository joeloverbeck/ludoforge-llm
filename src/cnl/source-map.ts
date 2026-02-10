export interface SourceSpan {
  readonly blockIndex: number;
  readonly markdownLineStart: number;
  readonly markdownColStart: number;
  readonly markdownLineEnd: number;
  readonly markdownColEnd: number;
}

export interface GameSpecSourceMap {
  readonly byPath: Readonly<Record<string, SourceSpan>>;
}
