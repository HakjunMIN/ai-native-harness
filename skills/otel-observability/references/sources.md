# OpenTelemetry live sources

Follow the [live-documentation protocol](../../sdlc/references/live-documentation.md).
Fetch relevant URLs and pin SDK, instrumentation, collector and convention versions separately.

| Topic | Official URL to fetch | Verify |
|---|---|---|
| Java instrumentation | [Java docs](https://opentelemetry.io/docs/languages/java/) | SDK and automatic/manual instrumentation integration |
| Automatic instrumentation | [Zero-code Java](https://opentelemetry.io/docs/zero-code/java/) | Agent support, configuration and duplicate spans |
| Signal conventions | [Semantic conventions](https://opentelemetry.io/docs/specs/semconv/) | Names, attributes, stability and migration requirements |
| Protocol | [OTLP specification](https://opentelemetry.io/docs/specs/otlp/) | Signal encoding, transport and delivery semantics |
| Collector | [Collector docs](https://opentelemetry.io/docs/collector/) | Pipeline configuration and operational behavior |
| Component implementation | [Collector contrib](https://github.com/open-telemetry/opentelemetry-collector-contrib) | Components and options at the deployed tag |

Also fetch the destination's sources for distribution-specific behavior; generic
OTel documentation is not proof of SigNoz, Mimir or ClickStack compatibility.
