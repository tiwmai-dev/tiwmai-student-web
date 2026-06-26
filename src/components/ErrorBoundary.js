import React from 'react';
import posthog from 'posthog-js';
import { trackEvent } from '../utils/analytics';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    posthog.captureException(error, { extra: { componentStack: errorInfo?.componentStack } });
    trackEvent('exception', {
      description: error.toString(),
      fatal: false,
    });
  }

  handleRetry = () => {
    this.setState({ 
      hasError: false, 
      error: null, 
      errorInfo: null,
      retryCount: this.state.retryCount + 1
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo, retryCount } = this.state;
      const { fallback, showDetails = false } = this.props;

      // If a custom fallback is provided
      if (fallback) {
        return fallback(error, this.handleRetry, this.handleReload);
      }

      // Default error UI
      return (
        <div 
          className="error-boundary-container"
          style={{
            padding: '2rem',
            margin: '1rem',
            borderRadius: '12px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            textAlign: 'center',
            fontFamily: '"Inter", "Kanit", sans-serif'
          }}
          role="alert"
          aria-live="polite"
        >
          <div 
            className="error-icon" 
            style={{ fontSize: '3rem', marginBottom: '1rem' }}
            aria-hidden="true"
          >
            😞
          </div>
          
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: '600', 
            marginBottom: '0.5rem',
            color: '#7f1d1d'
          }}>
            เกิดข้อผิดพลาดที่ไม่คาดคิด
          </h2>
          
          <p style={{ 
            marginBottom: '1.5rem', 
            color: '#991b1b',
            fontSize: '1rem'
          }}>
            ระบบพบปัญหาในการแสดงผลส่วนนี้ กรุณาลองใหม่อีกครั้ง
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              onClick={this.handleRetry}
              style={{
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '500',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#b91c1c'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#dc2626'}
            >
              🔄 ลองใหม่ (ครั้งที่ {retryCount + 1})
            </button>
            
            <button
              onClick={this.handleReload}
              style={{
                backgroundColor: 'white',
                color: '#dc2626',
                border: '1px solid #dc2626',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '500',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = '#fef2f2';
                e.target.style.borderColor = '#b91c1c';
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = 'white';
                e.target.style.borderColor = '#dc2626';
              }}
            >
              🔄 รีโหลดหน้า
            </button>
          </div>

          {showDetails && error && (
            <details 
              style={{ 
                marginTop: '2rem', 
                textAlign: 'left',
                backgroundColor: 'white',
                padding: '1rem',
                borderRadius: '8px',
                border: '1px solid #fca5a5'
              }}
            >
              <summary 
                style={{ 
                  cursor: 'pointer', 
                  fontWeight: '500', 
                  marginBottom: '0.5rem',
                  color: '#7f1d1d'
                }}
              >
                🔍 รายละเอียดข้อผิดพลาด
              </summary>
              <pre 
                style={{ 
                  fontSize: '0.875rem', 
                  overflow: 'auto',
                  color: '#991b1b',
                  lineHeight: '1.4'
                }}
              >
                {error && error.toString()}
                {errorInfo && errorInfo.componentStack}
              </pre>
            </details>
          )}

          <p style={{
            marginTop: '1.5rem',
            fontSize: '0.875rem',
            color: '#6b7280'
          }}>
            หากปัญหายังคงเกิดขึ้น กรุณาติดต่อฝ่ายสนับสนุน
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;