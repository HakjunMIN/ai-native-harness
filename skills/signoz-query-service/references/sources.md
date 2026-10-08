# SigNoz query API live sources

Follow the [live-documentation protocol](../../sdlc/references/live-documentation.md).
Fetch relevant URLs now and inspect the deployed fork/tag before deriving contracts.

| Topic | Official URL to fetch | Verify |
|---|---|---|
| API discovery | [SigNoz documentation](https://signoz.io/docs/) | Supported query endpoints, auth and signal-specific request/response schemas |
| API implementation | [SigNoz source](https://github.com/SigNoz/signoz) | Matching routes, DTOs, time units and error behavior at the deployed revision |
| Release differences | [SigNoz releases](https://github.com/SigNoz/signoz/releases) | API changes and compatibility across target versions |

For collector, storage and lifecycle work, also fetch relevant URLs from the
[OSS source map](../../signoz-oss/references/sources.md). Missing public API detail
requires matching source inspection, not invented endpoint paths or direct SQL.
