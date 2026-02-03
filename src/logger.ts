import pino, { type Logger, type LoggerOptions } from 'pino'
import { trace, context, SpanStatusCode } from '@opentelemetry/api'
import { Counter } from 'prom-client'
import { register } from './metrics.js'
import { env } from './env.js'

// Prometheus metrics for logging
export const logMessagesTotal = new Counter({
  name: 'log_messages_total',
  help: 'Total number of log messages',
  labelNames: ['level', 'service'],
  registers: [register],
})

export const logErrorsTotal = new Counter({
  name: 'log_errors_total',
  help: 'Total number of error log messages',
  labelNames: ['service', 'error_type'],
  registers: [register],
})

// Log level mapping for pino
const LOG_LEVEL_MAP: Record<string, string> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
}

// Transport target type
type TransportTarget = pino.TransportMultiOptions['targets'][number]

// Build transports array based on environment configuration
function buildTransports(): TransportTarget[] {
  const targets: TransportTarget[] = []

  // Pretty console output for development
  if (env.LOG_PRETTY || env.NODE_ENV === 'development') {
    targets.push({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
      level: LOG_LEVEL_MAP[env.LOG_LEVEL] || 'info',
    })
  } else {
    // JSON output for production (stdout)
    targets.push({
      target: 'pino/file',
      options: { destination: 1 }, // stdout
      level: LOG_LEVEL_MAP[env.LOG_LEVEL] || 'info',
    })
  }

  // Loki transport if OTEL endpoint is configured (Loki typically runs alongside)
  if (env.LOG_LOKI_ENDPOINT) {
    const lokiHost = env.LOG_LOKI_ENDPOINT
    targets.push({
      target: 'pino-loki',
      options: {
        batching: true,
        interval: 5,
        host: lokiHost,
        labels: {
          application: env.OTEL_SERVICE_NAME,
          environment: env.NODE_ENV,
        },
      },
      level: LOG_LEVEL_MAP[env.LOG_LEVEL] || 'info',
    })
  }

  return targets
}

// Create pino logger options
function createLoggerOptions(): LoggerOptions {
  const baseOptions: LoggerOptions = {
    level: LOG_LEVEL_MAP[env.LOG_LEVEL] || 'info',
    base: {
      service: env.OTEL_SERVICE_NAME,
      env: env.NODE_ENV,
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Custom serializers
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
      req: (req) => ({
        method: req.method,
        url: req.url,
        headers: {
          host: req.headers?.host,
          'user-agent': req.headers?.['user-agent'],
          'x-request-id': req.headers?.['x-request-id'],
        },
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
  }

  return baseOptions
}

// Create the base pino logger with transports
const transports = buildTransports()
const baseLogger = pino(
  createLoggerOptions(),
  transports.length > 0 ? pino.transport({ targets: transports }) : undefined
)

/**
 * Enhanced logger that integrates with OpenTelemetry traces and Prometheus metrics
 */
class ObservableLogger {
  private logger: Logger
  private serviceName: string

  constructor(logger: Logger, serviceName: string) {
    this.logger = logger
    this.serviceName = serviceName
  }

  private getTraceContext(): Record<string, string> {
    const activeSpan = trace.getActiveSpan()
    if (!activeSpan) {
      return {}
    }

    const spanContext = activeSpan.spanContext()
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      traceFlags: spanContext.traceFlags.toString(),
    }
  }

  private incrementMetrics(level: string, errorType?: string) {
    logMessagesTotal.inc({ level, service: this.serviceName })

    if (level === 'error' || level === 'fatal') {
      logErrorsTotal.inc({
        service: this.serviceName,
        error_type: errorType || 'unknown',
      })
    }
  }

  private addSpanEvent(level: string, message: string, data?: Record<string, unknown>) {
    const activeSpan = trace.getActiveSpan()
    if (activeSpan) {
      activeSpan.addEvent(`log.${level}`, {
        'log.message': message,
        'log.level': level,
        ...this.flattenObject(data),
      })

      // Set span status to error if logging an error
      if (level === 'error' || level === 'fatal') {
        activeSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: message,
        })
      }
    }
  }

  private flattenObject(obj?: Record<string, unknown>, prefix = ''): Record<string, string> {
    if (!obj) return {}

    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Error)) {
        Object.assign(result, this.flattenObject(value as Record<string, unknown>, newKey))
      } else if (value instanceof Error) {
        result[`${newKey}.name`] = value.name
        result[`${newKey}.message`] = value.message
        if (value.stack) result[`${newKey}.stack`] = value.stack
      } else {
        result[newKey] = String(value)
      }
    }
    return result
  }

  debug(message: string, data?: Record<string, unknown>) {
    const traceContext = this.getTraceContext()
    this.logger.debug({ ...data, ...traceContext }, message)
    this.incrementMetrics('debug')
    this.addSpanEvent('debug', message, data)
  }

  info(message: string, data?: Record<string, unknown>) {
    const traceContext = this.getTraceContext()
    this.logger.info({ ...data, ...traceContext }, message)
    this.incrementMetrics('info')
    this.addSpanEvent('info', message, data)
  }

  warn(message: string, data?: Record<string, unknown>) {
    const traceContext = this.getTraceContext()
    this.logger.warn({ ...data, ...traceContext }, message)
    this.incrementMetrics('warn')
    this.addSpanEvent('warn', message, data)
  }

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>) {
    const traceContext = this.getTraceContext()
    const errorData = error instanceof Error
      ? { err: error, errorType: error.name }
      : { err: error, errorType: 'unknown' }

    this.logger.error({ ...data, ...errorData, ...traceContext }, message)
    this.incrementMetrics('error', errorData.errorType)
    this.addSpanEvent('error', message, { ...data, ...errorData })
  }

  fatal(message: string, error?: Error | unknown, data?: Record<string, unknown>) {
    const traceContext = this.getTraceContext()
    const errorData = error instanceof Error
      ? { err: error, errorType: error.name }
      : { err: error, errorType: 'unknown' }

    this.logger.fatal({ ...data, ...errorData, ...traceContext }, message)
    this.incrementMetrics('fatal', errorData.errorType)
    this.addSpanEvent('fatal', message, { ...data, ...errorData })
  }

  /**
   * Create a child logger with additional context
   */
  child(bindings: Record<string, unknown>): ObservableLogger {
    return new ObservableLogger(this.logger.child(bindings), this.serviceName)
  }

  /**
   * Create a request-scoped logger with request context
   */
  forRequest(requestId: string, method: string, path: string): ObservableLogger {
    return this.child({
      requestId,
      method,
      path,
    })
  }

  /**
   * Get the underlying pino logger for advanced usage
   */
  getPinoLogger(): Logger {
    return this.logger
  }
}

// Export the main logger instance
export const logger = new ObservableLogger(baseLogger, env.OTEL_SERVICE_NAME)

// Export types
export type { ObservableLogger }

// Utility function to create a logger for a specific module
export function createModuleLogger(moduleName: string): ObservableLogger {
  return logger.child({ module: moduleName })
}

// HTTP request logging middleware helper
export interface RequestLogData {
  method: string
  path: string
  status: number
  duration: number
  userAgent?: string
  ip?: string
  requestId?: string
}

export function logHttpRequest(data: RequestLogData) {
  const level = data.status >= 500 ? 'error' : data.status >= 400 ? 'warn' : 'info'
  const message = `${data.method} ${data.path} ${data.status} ${data.duration}ms`

  const logData = {
    http: {
      method: data.method,
      path: data.path,
      statusCode: data.status,
      duration: data.duration,
      userAgent: data.userAgent,
      clientIp: data.ip,
    },
    requestId: data.requestId,
  }

  switch (level) {
    case 'error':
      logger.error(message, undefined, logData)
      break
    case 'warn':
      logger.warn(message, logData)
      break
    default:
      logger.info(message, logData)
  }
}
