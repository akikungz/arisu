# Observability Guide (Metrics, Traces, Logs)

This document explains how to analyze Arisu’s metrics, traces (Jaeger), and logs in Grafana, and how to provision Grafana for a repeatable dashboard setup.

## Architecture overview
- **Metrics**: Prometheus pulls `/metrics` from the app (via `prom-client`).
- **Traces**: OpenTelemetry exports spans to Jaeger via OTLP/HTTP (`/v1/traces`).
- **Logs**: Pino logs go to stdout (JSON or pretty). Optional Loki shipping via `pino-loki`.

## Required app configuration
Arisu reads observability settings from environment variables defined in `src/env.ts`.

### Core variables
- `OTEL_SERVICE_NAME` (default: `momoi`)
- `OTEL_EXPORTER_OTLP_ENDPOINT` (e.g. `http://jaeger:4318`)
- `LOG_LEVEL` (`debug|info|warn|error`)
- `LOG_FORMAT` (`json|plain`)
- `LOG_PRETTY` (`true|false`)
- `LOG_LOKI_ENDPOINT` (e.g. `http://loki:3100`)

### Endpoints exposed by the service
- **Metrics**: `GET /metrics`
- **HTTP traces**: Auto-instrumented via OpenTelemetry middleware
- **Logs**: JSON on stdout; optional Loki shipping

## Metrics analysis (Prometheus → Grafana)
Key metrics defined in `src/metrics.ts` and `src/logger.ts`:
- `http_requests_total{method,path,status}`
- `http_request_duration_seconds{method,path,status}` (histogram)
- `log_messages_total{level,service}`
- `log_errors_total{service,error_type}`

### Recommended Grafana panels (PromQL)
**1) Request rate (RPS)**
```
sum(rate(http_requests_total[1m])) by (method, path)
```

**2) Error rate (5xx)**
```
sum(rate(http_requests_total{status=~"5.."}[5m]))
```

**3) Latency p95**
```
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
)
```

**4) Log volume by level**
```
sum(rate(log_messages_total[5m])) by (level)
```

**5) Error log count**
```
sum(rate(log_errors_total[5m])) by (error_type)
```

## Logs analysis (Loki → Grafana)
Logs are structured with trace context (`traceId`, `spanId`) when spans are active.

### Recommended log queries (LogQL)
**1) All logs for the service**
```
{application="${OTEL_SERVICE_NAME}"}
```

**2) Error logs only**
```
{application="${OTEL_SERVICE_NAME}"} |= "level":"error"
```

**3) Logs for a specific trace**
```
{application="${OTEL_SERVICE_NAME}"} | json | traceId="<trace_id>"
```

## Traces analysis (Jaeger → Grafana)
Traces are exported to Jaeger using the OTLP/HTTP endpoint:
```
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
```
In Grafana, add a **Jaeger data source** and browse traces by service name (`OTEL_SERVICE_NAME`).

### Recommended trace views
- **Service overview**: latency, error rate, throughput
- **Trace waterfall**: inspect slow spans and error-tagged spans
- **Correlate logs**: use `traceId` to jump from logs to traces

## Creating a Grafana dashboard
Create a dashboard with three rows:

### 1) Metrics row
- **RPS** (Prometheus): `sum(rate(http_requests_total[1m])) by (method, path)`
- **Error rate** (Prometheus): `sum(rate(http_requests_total{status=~"5.."}[5m]))`
- **Latency p95** (Prometheus): `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))`

### 2) Logs row
- **Log stream** (Loki): `{application="${OTEL_SERVICE_NAME}"} | json`
- **Error stream** (Loki): `{application="${OTEL_SERVICE_NAME}"} |= "level":"error"`

### 3) Traces row
- **Trace search** (Jaeger): filter by `service=${OTEL_SERVICE_NAME}`

## Grafana provisioning guide
Provisioning makes dashboards and data sources reproducible in CI/CD or Docker deployments. Grafana reads provisioning files on startup.

### Directory layout
```
provisioning/
  datasources/
    datasources.yaml
  dashboards/
    dashboards.yaml
    arisu-observability.json
```

### Example data source provisioning (`datasources.yaml`)
```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
  - name: Jaeger
    type: jaeger
    access: proxy
    url: http://jaeger:16686
```

### Example dashboard provisioning (`dashboards.yaml`)
```yaml
apiVersion: 1

dashboards:
  - name: arisu-observability
    orgId: 1
    folder: Observability
    type: file
    disableDeletion: false
    editable: true
    options:
      path: /etc/grafana/provisioning/dashboards
```

### Dashboard JSON file
Export your Grafana dashboard as JSON and save it as:
```
provisioning/dashboards/arisu-observability.json
```
Grafana will load it automatically on startup.

## Correlating metrics, logs, and traces
- Use `traceId` from logs to open the same trace in Jaeger.
- Use `path` and `status` labels from metrics to pinpoint endpoints with errors.
- Use the trace waterfall to identify slow spans; then filter logs by `traceId` to see related events.

## Troubleshooting tips
- **No traces**: Verify `OTEL_EXPORTER_OTLP_ENDPOINT` and that Jaeger OTLP/HTTP receiver is enabled.
- **No logs in Loki**: Check `LOG_LOKI_ENDPOINT` and Loki availability; ensure Grafana Loki data source is configured.
- **Metrics missing**: Confirm Prometheus is scraping `/metrics` and that the service is reachable.
