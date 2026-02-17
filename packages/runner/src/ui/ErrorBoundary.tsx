import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}

const INITIAL_STATE: ErrorBoundaryState = {
  hasError: false,
  error: null,
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = INITIAL_STATE;

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    void info;
    this.setState({ error });
  }

  private handleReload = (): void => {
    if (typeof window !== 'undefined' && typeof window.location.reload === 'function') {
      window.location.reload();
    }
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      return (
        <section role="alert" aria-live="assertive">
          <h1>Something went wrong.</h1>
          <p>{this.state.error?.message ?? 'Unknown render error.'}</p>
          <button type="button" onClick={this.handleReload}>Reload</button>
        </section>
      );
    }

    return this.props.children;
  }
}
