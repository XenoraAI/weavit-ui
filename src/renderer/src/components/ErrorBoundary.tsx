import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Alert, Box, Button, Code, Stack } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'

interface Props {
  children: ReactNode
  /** Changing this value resets the boundary (e.g. the selected collection). */
  resetKey?: unknown
}

interface State {
  error: Error | null
}

// Catches render-time exceptions in a subtree and shows the message instead of
// unmounting to a blank screen. Resets when resetKey changes.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface in the devtools console for debugging.
    console.error('Render error:', error, info)
  }

  componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <Box p="md">
          <Alert color="red" icon={<IconAlertTriangle />} title="Something went wrong rendering this view">
            <Stack gap="xs">
              <Code block>{this.state.error.message}</Code>
              <Button
                size="xs"
                variant="light"
                w="fit-content"
                onClick={() => this.setState({ error: null })}
              >
                Try again
              </Button>
            </Stack>
          </Alert>
        </Box>
      )
    }
    return this.props.children
  }
}
