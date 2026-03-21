export interface CanvasRuntimeHealthStatus {
  readonly tickerStarted: boolean;
  readonly canvasConnected: boolean;
  readonly renderCorruptionSuspected: boolean;
}
