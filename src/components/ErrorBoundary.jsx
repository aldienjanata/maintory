import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: '#ff4444', backgroundColor: '#1e1e1e', height: '100vh', width: '100vw', boxSizing: 'border-box', overflow: 'auto' }}>
          <h2>Aplikasi Mengalami Crash</h2>
          <p style={{marginBottom: '10px'}}>Screenshot layar ini dan berikan ke developer:</p>
          <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', backgroundColor: '#000', padding: '10px', borderRadius: '5px', fontSize: '12px' }}>
            {this.state.error && this.state.error.toString()}
            {'\n\n'}
            {this.state.error && this.state.error.stack}
          </pre>
          <button 
            onClick={() => window.location.reload()} 
            style={{marginTop: '20px', padding: '10px 20px', cursor: 'pointer', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '5px'}}
          >
            Refresh Halaman
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
