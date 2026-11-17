import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode; panelName?: string }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode; panelName?: string }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'Unexpected rendering error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center">
          <AlertTriangle className="w-7 h-7 text-red-500 mb-2" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {this.props.panelName ? `${this.props.panelName} encountered an error` : 'Module Error'}
          </h3>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 max-w-md">{this.state.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Reload Panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
