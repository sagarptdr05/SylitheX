import { Component, type ReactNode } from 'react'
import { StateBox } from './ui'

/** Keeps the shell alive when one page fails, and offers a way back. */
export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidUpdate(prev: { resetKey?: string }) { if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null }) }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="mx-auto mt-10 max-w-xl">
        <StateBox kind="error" title="This view failed to render" text={`${this.state.err.message}. The rest of the platform is unaffected.`} action="Reload view" onAction={() => this.setState({ err: null })} />
      </div>
    )
  }
}
