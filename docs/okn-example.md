# A working OKN query-to-view example

Open `http://127.0.0.1:4173/?view=okn` after the normal install/build/start steps. This small read-only extension demonstrates a fixed query, an explicit semantic mapping, data-carried presentation hints, a validated view specification and registered components. **Question selection is scripted.** It does not call an LLM, generate queries from natural language or execute generated UI code.

## What the walkthrough shows

1. Start with **Dated public snapshot**. The date and source mode are always visible.
2. **Compare predicted flood depth** selects an SVG comparison chart: three features, one common source timestamp, metre units and a zero baseline.
3. **Show supporting records & units** selects the evidence table using the same data. Repeat or switch back; each request renders one current view.
4. Expand the inspector for the exact SELECT, raw bindings, prototype hints, validated view specification, derived RDF and AG-UI events.
5. Optionally choose **Query OKN endpoint**. This is a server-side read-only request. Failures visibly use the dated snapshot. A successful empty response remains empty. Live success/failure results are cached for 60 seconds to avoid repeated endpoint requests when changing questions.

The [comparison screenshot](images/okn-comparison.png), [table screenshot](images/okn-evidence.png), [mechanism screenshot](images/okn-mechanism.png) and [10-second recording](images/okn-walkthrough.webm) were captured from the working UI using the real, explicitly labeled public snapshot. They are not mockups, and they do not depict an autonomous model or a fresh live request. The recording changes question, opens the inspector and returns to the chart. Simulated error tests were performed separately, outside these captures.

## Native source and scope

Endpoint: `https://apps.okn.us/federation/sparql`.
Named graph: `https://purl.org/okn/frink/kg/ufokn`.

[OKN documentation](https://registry.okn.us/query/query-page/) describes this endpoint as a consolidated triplestore with named graphs; this example does not demonstrate live federation across remote services. [UFOKN's registry](https://registry.okn.us/registry/kgs/ufokn/) documents Schema.org vocabulary. The query and snapshot are at [`query.rq`](../e2e-demo/fixtures/okn/query.rq) and [`snapshot.json`](../e2e-demo/fixtures/okn/snapshot.json).

The selected public feature suffixes are `9mvu6s0twh5x`, `9mvu9ztt54v1` and `9mvu9zwtgy1s`. The captured depth strings are `0.276`, `0.095` and `0.095`, all with unit code `MTR` and source timestamp `2024-10-29T08:00:00`. The source describes these records as flood-depth predictions. Feature A/B/C are compact display aliases in query order, not names asserted upstream. No real-time status, operational accuracy or temporal coverage is implied.

The query has fixed feature IRIs and quantity kind, `SELECT DISTINCT`, an order and `LIMIT 12`. Equivalent projected bindings can arise from repeated blank-node quantities; identical projected rows are collapsed, while differing values/times are retained. This is not provenance-equivalence reasoning or a completeness guarantee. No longitudinal observations are synthesized. Timestamps retain the exact source text, without appending a timezone or inferring whether they mean forecast validity or result-production time.

## Explicit mapping, not native SOSA/QUDT assertions

| Native source | Application-derived representation |
| --- | --- |
| `schema:Observation` record for a prediction | A demo-owned `DerivedPredictionView`, also typed `sosa:Observation` as a proposed interpretation of a prediction evaluation; linked back using `prov:wasDerivedFrom` |
| `schema:observationAbout` | `sosa:hasFeatureOfInterest` retaining the native feature IRI |
| `schema:variableMeasured` / `schema:value` literal | `sosa:hasResult` → `qudt:QuantityValue` with explicitly parsed `qudt:numericValue` |
| `schema:unitCode "MTR"` | `qudt:unit unit:M`; no magnitude conversion |
| `schema:propertyID` containing the Depth URL as text | Explicitly recognized `qudt:hasQuantityKind quantitykind:Depth` IRI |
| `schema:observationDate` literal | Demo-owned `sourceTimestamp` literal; **no** SOSA `resultTime` or `phenomenonTime` asserted |

The proposed `sosa:observedProperty` is demo-owned `predictedFloodDepth`. No sensor identity, procedure, accuracy, uncertainty or missing time point is invented. The source graph is not modified. SOSA typing expresses our interpretation; it is not discovered as a native source assertion or proven by the local validation profile. [SOSA/SSN specification](https://www.w3.org/TR/vocab-ssn/) explains observation/result/time roles; [QUDT metre](https://qudt.org/vocab/unit/M) explicitly associates `MTR` with metre.

[`shapes/okn.ttl`](../e2e-demo/shapes/okn.ttl) checks the derived graph's required feature/result/provenance links, source string timestamp, nonnegative decimal value and metre unit. These are local structural constraints, not full SOSA conformance, proof of prediction correctness or authorization. Raw source terms remain inspectable. Unsupported units, malformed result terms and oversized responses are rejected, rather than being silently interpreted.

## Hints, selection and rendering

[`hints.json`](../e2e-demo/fixtures/okn/hints.json) is a small, schema-checked prototype vocabulary: prefer comparison for feature/depth data, metre units, and a table for evidence. These are not DASH/SHUI chart standards and are separate from SHACL constraints.

[`server/okn.mjs`](../e2e-demo/server/okn.mjs) checks actual rows before applying the hint. A comparison requires one row per feature and one shared source timestamp; conflicting values or times select a table without implicit aggregation. The evidence question always selects the table. The strict view schema permits only two renderer kinds, known fields/unit, a preset question and a dataset hash. The frontend checks that the registered tool specification matches current state. No markup, JavaScript or arbitrary component name comes from the endpoint.

[`src/okn.tsx`](../e2e-demo/src/okn.tsx) registers `show_okn` with CopilotKit and renders the two approved components. [`server/http.mjs`](../e2e-demo/server/http.mjs) emits a state snapshot and tool call on each question. Query, data, hints and view spec remain visible. The original form edit/review/save examples are unchanged; the OKN route has no edit or save operation.

The network target and query are fixed server-side; clients cannot supply either. Fetch follows no redirects, times out after 8 seconds, caps the response at 128 kB, accepts at most 12 bindings, and shares one in-flight request. There is no automatic retry loop. Source modes are distinct: `snapshot`, `live`, and visibly warned `fallback`. No new dependency or credentials are required.

## Verification and capture

```sh
cd e2e-demo
npm test
npm run typecheck
npm run lint
npm run build
node test/run-transport.mjs
```

Local checks: **31 backend tests passed** (21 existing + 10 OKN); typecheck, lint and build passed. All existing 14 transport checks plus the OKN snapshot/switch/spec/repeat/origin checks passed. A live request through the actual server returned three rows and a validated comparison view. Build warnings about dependency directives and chunk size remain.

The optional [`scripts/capture-okn.mjs`](../scripts/capture-okn.mjs) uses a separately installed Playwright module; it is not a runtime dependency. With the server running, set `PLAYWRIGHT_MODULE` to that installation's absolute `index.mjs` path and optionally `CHROMIUM_PATH` to its browser executable, then run `node scripts/capture-okn.mjs` from repository root. Use Playwright's normal browser installation if no executable override is supplied. Do not run captures with private data substituted.

Browser checks passed: chart, table switch, inspector, repeat/switch-back, 390px viewport without page-level overflow, visible loading, local transport failure, empty results, and a visibly dated endpoint-failure fallback. No page errors were observed. The mocked failure/empty flows run in a separate unrecorded context. Unit tests cover live-fetch failure/timeout fallback, in-flight/cache behavior, invalid specs, units and results, response-size bounds, conflicting rows, and derived SHACL rejection. CI runs the backend/build and offline transport checks; browser capture and the live public endpoint check are local checks, not CI network dependencies.

## Remaining limits

No live autonomous agent, general query builder, time-series renderer, map, visualization grammar, unit conversion engine, clinical/operational use, chart editing, hosted deployment or arbitrary schema support. The separate synthetic time-series discussion remains conceptual. Snapshot data can become stale; it is deliberately dated and never labeled as current conditions. The full endpoint dataset's redistribution terms are not redefined by this prototype's MIT code license.
