import React from 'react';
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log to console in dev; in production, send to error reporting service
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback from props, or default UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
          <div className="relative mb-8 mx-auto">
            {/* Decorative error icon with glow */}
            <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div className="absolute inset-0 rounded-full bg-red-500/20 blur-xl -z-10"></div>
          </div>

          <h2 className="text-2xl font-bold text-white mb-3">Something went wrong</h2>
          <p className="text-gray-400 mb-8 max-w-md mx-auto leading-relaxed">
            An unexpected error occurred while loading this section. This has been logged for investigation.
          </p>

          <div className="flex items-center justify-center gap-4">
            <button
              onClick={this.handleReset}
              className="px-8 py-3 bg-gradient-to-r from-[#F84565] to-[#D63854] text-white font-semibold 
                rounded-full shadow-lg shadow-[#F84565]/30 hover:shadow-xl hover:shadow-[#F84565]/50 
                hover:scale-105 active:scale-95 transition-all duration-300 border border-[#F84565]/30"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.href = '/'}
              className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold 
                rounded-full border border-white/20 hover:border-white/40 backdrop-blur-sm 
                hover:scale-105 transition-all duration-300"
            >
              Go Home
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
