import { Component } from 'react'
import { captureException } from '../../lib/sentry'
import { trackError } from '../../lib/analytics'
import { ErrorState, Button } from '../../ui'

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
    trackError('render', error)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-crash">
          <ErrorState
            onRetry={this.handleReset}
            secondary={<Button onClick={() => window.location.reload()}>Reload app</Button>}
          >
            This screen hit a snag. Your trips and bookings are safe. Try again, or reload the app.
          </ErrorState>
        </div>
      )
    }
    return this.props.children
  }
}
