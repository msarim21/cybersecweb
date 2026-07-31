import React from 'react';

export default class AppErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[CYBERSECPRO] Frontend failed to render', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: '#0f1629',
        color: '#e2e8f0',
        fontFamily: 'Inter, system-ui, sans-serif',
        textAlign: 'center',
      }}>
        <section>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.08em', color: '#22d3ee' }}>
            CYBERSECPRO
          </div>
          <h1 style={{ margin: '20px 0 8px', fontSize: 20 }}>Control center could not load</h1>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 14 }}>
            Please reload the page. Your account data was not changed.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 20,
              border: '1px solid #22d3ee',
              borderRadius: 10,
              background: 'transparent',
              color: '#22d3ee',
              padding: '10px 18px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </section>
      </main>
    );
  }
}