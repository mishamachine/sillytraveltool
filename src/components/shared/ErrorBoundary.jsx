import { Component } from 'react'
import Goose from '../goose/Goose'
import { captureException } from '../../lib/sentry'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
    captureException(error, { contexts: { react: { componentStack: info.componentStack } } })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', background: 'var(--bg, #FAF7F2)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '40px 24px', textAlign: 'center', gap: 16,
        }}>
          <Goose variant="worried" size={96} />
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700, fontSize: 20, color: '#2A2520',
          }}>
            Something went wrong
          </div>
          <p style={{
            fontSize: 14, color: '#6B6355', lineHeight: 1.6,
            maxWidth: 300,
          }}>
            The Goose tripped over something unexpected. Try refreshing or going back.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '10px 20px', borderRadius: 12,
                background: '#C4561E', color: '#fff', border: 'none',
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 20px', borderRadius: 12,
                background: 'transparent', color: '#6B6355',
                border: '1.5px solid #E8E3DB',
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 600, fontSize: 14, cursor: 'pointer',
              }}
            >
              Refresh
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
