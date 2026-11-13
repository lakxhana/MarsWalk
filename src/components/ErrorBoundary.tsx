import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[MarsWalk ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetState = () => {
    try {
      localStorage.removeItem('marswalk_field_notebook_v1');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const errMessage = this.state.error?.message || 'An unexpected rendering error occurred.';

      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#05060a] p-6 text-[#f3f1ee]">
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#17130f] p-6 shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-2.5 text-xs font-bold tracking-[0.2em] text-amber-400 uppercase">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              MARSWALK · SYSTEM NOTICE
            </div>

            <h1 className="mt-2 text-lg font-semibold text-white">
              Exploration Viewer Encountered an Issue
            </h1>

            <p className="mt-2 text-xs leading-relaxed text-neutral-300">
              The graphics or map subsystem ran into an error during execution. This can occur if WebGL acceleration is unavailable in your browser or if a network tile request was interrupted.
            </p>

            <div className="mt-4 rounded-lg border border-red-500/20 bg-red-950/20 p-3 font-mono text-[11px] text-red-300 break-words max-h-36 overflow-y-auto">
              {errMessage}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={this.handleReload}
                className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-black transition hover:bg-amber-400 cursor-pointer shadow-sm"
              >
                Reload Exploration
              </button>
              <button
                onClick={this.handleResetState}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-neutral-300 transition hover:bg-white/10 hover:text-white cursor-pointer"
              >
                Reset Local Cache & Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
