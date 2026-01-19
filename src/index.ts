import { startInstrumentation } from './instrumentation.js'

// Initialize OpenTelemetry instrumentation before other imports
startInstrumentation()

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { httpInstrumentationMiddleware } from '@hono/otel'

import { authHandler } from './auth.js'
import { env } from './env.js'

const app = new Hono()

// OpenTelemetry middleware for Hono
app.use('*', httpInstrumentationMiddleware())

// JSON Logger middleware
app.use('*', logger((message, ...rest) => {
  const logData = {
    timestamp: new Date().toISOString(),
    message,
    ...rest
  }
  console.log(JSON.stringify(logData))
}))

// Request URL scheme logger
app.use('*', (c, next) => {
  const url = new URL(c.req.url)
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    type: 'request-url',
    scheme: url.protocol.replace(':', ''),
    host: url.host,
    path: url.pathname,
    fullUrl: c.req.url,
    "x-forwarded-proto": c.req.header('x-forwarded-proto') || null
  }))
  return next()
})

// Mount better-auth routes
app.route('/', authHandler)

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

serve({
  fetch: (req) => {
    const url = new URL(req.url)
    // Check forwarded protocol header to determine if the request is secure
    if (url.protocol === 'http:' && req.headers.get('x-forwarded-proto') === 'https') {
      url.protocol = 'https:'
    }
    const modifiedRequest = new Request(url.toString(), req)
    return app.fetch(modifiedRequest)
  },
  port: env.PORT
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
