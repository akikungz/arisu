import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client'

// Create a Registry to register metrics
export const register = new Registry()

// Add default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register })

// Custom metrics for HTTP requests
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register],
})

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.001, 0.005, 0.015, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 1, 2, 5],
  registers: [register],
})
