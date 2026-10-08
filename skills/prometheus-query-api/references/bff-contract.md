# BFF query contract

First fetch the relevant official URLs in [sources](sources.md) using the
[live-documentation protocol](../../sdlc/references/live-documentation.md).
The following defines local decisions and evidence, not an offline API manual.

Use with `api-contract`, `spring-boot-bff` and `spring-testing`. The BFF owns
authorization, query shape and public response compatibility.

## Request design

Define typed operations such as `serviceLatency` or `requestRate`. Each
operation lists allowed metrics, labels, aggregations, time range, step and
result limits. Build PromQL on the server from an approved template.

* Derive the Mimir tenant from verified authentication and an entitlement map.
* Validate the tenant ID against Mimir rules and reject `|` unless federation is
  an approved operation.
* Drop inbound `X-Scope-OrgID`, upstream URLs and arbitrary headers.
* Allow-list label names. Escape label values as PromQL string literals; do not
  concatenate raw regular expressions or selectors.
* Use form-encoded POST for long queries when the pinned server supports it.
* Enforce maximum range, minimum step, maximum points, series and timeout before
  calling upstream. Server limits are a second layer, not the product contract.

## Response design

Return a versioned BFF schema, not raw upstream JSON. Normalize timestamps,
values, labels, units, empty results and warnings to the frontend contract.
Keep status, result type and partial-result signals observable to tests.

| Upstream signal | BFF handling to decide in the contract |
|---|---|
| Invalid parameters | Fetch actual status/error type; distinguish BFF bugs from invalid typed input |
| Query execution failure | Fetch error semantics; define a stable response without internal query text |
| Rate or cost limit | Verify limit signals and any retry guidance |
| Timeout or unavailability | Verify status/error distinctions; respect cancellation and budgets |
| Successful response with warnings | Verify envelope fields; define explicit warning handling |

Confirm exact codes and `errorType` values on the pinned server. Do not collapse
all upstream failures into one status. Never return raw upstream error bodies,
tenant IDs, credentials or full PromQL to the browser.

## Test evidence

| Level | Proves |
|---|---|
| Unit | Template rendering, label escaping, tenant validation and bounds |
| Stubbed client contract | Header injection, form encoding, timeout, cancellation and error mapping |
| Real Mimir integration | Prefix, auth path, actual series, response shape, limits and wrong-tenant isolation |
| Frontend contract | Rendering of empty, partial, warning and error responses |

A WireMock test does not prove Mimir compatibility. A same-tenant success test
does not prove isolation; include a wrong-tenant negative case.
