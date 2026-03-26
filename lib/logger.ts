type LogLevel = 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  module: string
  message: string
  data?: Record<string, unknown>
}

function formatEntry(entry: LogEntry): string {
  const timestamp = new Date().toISOString()
  const base = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.module}] ${entry.message}`
  if (entry.data) {
    return `${base} ${JSON.stringify(entry.data)}`
  }
  return base
}

/**
 * Create a structured logger scoped to a module name.
 */
export function createLogger(module: string) {
  return {
    info(message: string, data?: Record<string, unknown>) {
      console.log(formatEntry({ level: 'info', module, message, data }))
    },
    warn(message: string, data?: Record<string, unknown>) {
      console.warn(formatEntry({ level: 'warn', module, message, data }))
    },
    error(message: string, error?: unknown, data?: Record<string, unknown>) {
      const errorData: Record<string, unknown> = { ...data }
      if (error instanceof Error) {
        errorData.errorMessage = error.message
        errorData.stack = error.stack
      } else if (error !== undefined) {
        errorData.error = String(error)
      }
      console.error(formatEntry({ level: 'error', module, message, data: errorData }))
    },
  }
}
