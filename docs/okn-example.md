# A working OKN query-to-view example

Open `http://127.0.0.1:4173/?view=okn` after the normal install/build/start steps. This small read-only extension demonstrates a fixed query, an explicit semantic mapping, data-carried presentation hints, a validated view specification and registered components. **Intent selection is scripted; presentation comes from local RDF.** It does not call an LLM, generate queries from natural language or execute generated UI code.

## What the walkthrough shows

1. Start with **Dated public snapshot**. The date and source mode are always visible.
2. Leave **Compare predicted flood depth** selected, using profile **A · Prefer comparison**. The RDF viewer preference selects a chart when the data passes chart acceptance checks.
3. Change only **RDF presentation profile** to **B · Prefer value table**. The question, query, source rows and data hash remain identical; a different viewer triple produces a table. Switch back to A. The same compiled frontend handles both profiles.
4. Expand the inspector for the exact SELECT, raw bindings, actual RDF compiler input, validated descriptor, derived RDF and AG-UI events. The optional evidence question selects a separate RDF-declared intent; it is not necessary for the A/B proof.
5. Optionally choose **Query OKN endpoint**. This is a server-side read-only request. Failures visibly use the dated snapshot. A successful empty response remains empty. Live success/failure results are cached for 60 seconds to avoid repeated endpoint requests when changing questions.

The [comparison screenshot](images/okn-comparison.png), [table screenshot](images/okn-evidence.png), [mechanism screenshot](images/okn-mechanism.png) and [10-second recording](images/okn-walkthrough.webm) were captured from the working UI using the real, explicitly labeled public snapshot. They are not mockups, and they do not depict an autonomous model or a fresh live request. The approximately 10-second recording changes only the RDF profile, opens the inspector and returns to the chart; the compare question stays selected. Simulated error tests were performed separately, outside these captures.

## Native source and scope

Endpoint: `https://apps.okn.us/federation/sparql`.
Named graph: `https://purl.org/okn/frink/kg/ufokn`.

[OKN documentation](https://registry.okn.us/query/query-page/) describes this endpoint as a consolidated triplestore with named graphs; this example does not demonstrate live federation across remote services. [UFOKN's registry](https://registry.okn.us/registry/kgs/ufokn/) documents Schema.org vocabulary. The query and snapshot are at [`query.rq`](../e2e-demo/fixtures/okn/query.rq) and [`snapshot.json`](../e2e-demo/fixtures/okn/snapshot.json).

The selected public feature suffixes are `9mvu6s0twh5x`, `9mvu9ztt54v1` and `9mvu9zwtgy1s`. The captured depth strings are `0.276`, `0.095` and `0.095`, all with unit code `MTR` and source timestamp `2024-10-29T08:00:00`. The source describes these records as flood-depth predictions. Chart labels use feature IRI suffixes; the table preserves full IRIs. No real-time status, operational accuracy or temporal coverage is implied.

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

## RDF hints, selection and rendering

There is no JSON preferences file. [`okn-ui.ttl`](../e2e-demo/shapes/okn-ui.ttl) defines a dataset shape targeting the application-derived `demo:dataset`. Its `demo:prediction` values are the row nodes. Two property shapes declare the supported intents; each points to a row shape with columns. [`okn-ui-chart.ttl`](../e2e-demo/shapes/okn-ui-chart.ttl) and [`okn-ui-table.ttl`](../e2e-demo/shapes/okn-ui-table.ttl) differ by exactly one triple:

```turtle
# A
ui:Compare shui:viewer ui:ComparisonViewer .
# B (replace A, do not assert both)
ui:Compare shui:viewer shui:ValueTableViewer .
```

Here `shui:` is `http://www.w3.org/ns/shacl-ui#`; `ui:` is the project namespace `https://example.org/okn-ui-hints/`. The following common excerpt binds the chart to actual RDF paths, not JavaScript row field names:

```turtle
ui:Compare sh:path demo:prediction ; sh:node ui:Row ;
  ui:forIntent ui:compare ; ui:category ui:Feature ; ui:measure ui:Depth ;
  ui:unit ui:Unit ; ui:time ui:Time ; ui:fallbackViewer shui:ValueTableViewer .
ui:Depth sh:path (sosa:hasResult qudt:numericValue) ;
  sh:name "Predicted depth (m)" ; sh:order 3 ; shui:viewer shui:LiteralViewer .
```

[`server/okn-presentation.mjs`](../e2e-demo/server/okn-presentation.mjs) compiles the selected local RDF into descriptors, follows the declared paths in the derived RDF graph, and checks value/view compatibility. The intent has no hard-coded chart/table preference. The browser's fixed registry dispatches on the compiled viewer IRI; both chart axes and table cells use compiled mappings. No network-loaded widgets, generated code, arbitrary SPARQL or client-supplied Turtle are executed.

### Verified terms and scope

Sources inspected on 2026-10-12: [published SHACL UI FPWD, 2026-05-26](https://www.w3.org/TR/2026/WD-shacl12-ui-20260526/), [current editor's draft](https://w3c.github.io/data-shapes/shacl12-ui/), and [DASH form vocabulary](https://datashapes.org/forms.html). The editor's draft now uses `http://www.w3.org/ns/shacl-ui/`; this prototype intentionally pins the published **hash** vocabulary. Slash terms are not silently treated as aliases.

| Vocabulary | Runtime behavior |
| --- | --- |
| `sh:targetNode`, `sh:property`, `sh:path`, `sh:node` | Fixed dataset focus/collection, row shape, and field traversal; column paths are direct or two-step sequences. |
| `sh:name`, `sh:order` | Descriptor title/column labels and ascending column ordering; IRI breaks equal-order ties. |
| `shui:viewer shui:ValueTableViewer` | Bounded multi-value table: each collection member is a row, columns come from its `sh:node` shape. All bounded rows are shown in a scrolling table; no pagination UI. |
| `shui:LiteralViewer`, `shui:IRIViewer` | Lexical text or IRI display; only HTTP(S) links are navigable. No nested IRI interaction UI. |
| `dash:viewer` with `dash:ValueTableViewer`, `dash:LiteralViewer`, `dash:URIViewer` | Explicit legacy compatibility aliases to these same bounded components, covered by a test. DASH is `http://datashapes.org/dash#`; no other DASH features claimed. |
| Project `ui:ComparisonViewer` | Registered comparison chart. Not a standard SHUI/DASH chart. |
| Project `ui:forIntent`, `ui:category`, `ui:measure`, `ui:unit`, `ui:time`, `ui:fallbackViewer` | Local intent, column references and safe table fallback. These terms are not SHACL constraints. |

This is explicit-preference interpretation, not the SHUI scoring/matcher algorithm, full renderer conformance, SHACL Rules, generic ontology-driven inference or an autonomous agent. The original form adapters retain their earlier scope. An RDF declaration requests a component; it cannot override the application's acceptance checks.

### Validation boundaries and failure behavior

1. Source normalization checks the fixed identities, numeric syntax, quantity kind, MTR code and timestamp syntax; unsupported live responses produce the labeled dated fallback.
2. `okn.ttl` and `shacl-engine` validate the derived data structure. This does not validate presentation RDF or prediction truth.
3. The strict presentation compiler rejects missing/duplicate/conflicting viewer choices, unsupported/misplaced predicates, unregistered widgets, malformed paths, unresolved mapping references and unexpected intents. Missing or multiple values at a declared path and literal/IRI viewer mismatches fail closed. A bad installed profile fails startup; runtime data/view errors produce AG-UI `RUN_ERROR`, with the previous result explicitly marked stale.
4. Custom chart acceptance requires 1–3 records, distinct categories, nonnegative finite decimal measures, metre units and identical source-time strings. Incompatible mappings, multiple times, repeated categories or no rows use the **RDF-declared** table fallback. No implicit aggregation or time interpretation occurs.
5. Zod validates the compiled descriptor on the server and client. The client checks that the tool spec equals the current authoritative state before registry dispatch. This is JSON contract validation, separate from SHACL data validation.

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

Local checks: **37 backend tests passed** (21 existing + 10 OKN); typecheck, lint and build passed. All existing 14 transport checks plus the OKN snapshot/RDF-profile/switch/spec/repeat/origin checks passed. The AG-UI transport asserts unchanged query, rows, derived graph, data hash and question across the RDF-only viewer change. The earlier extension check returned three live rows; this revision verifies the fixed snapshot offline and does not claim a new live fetch. Build warnings about dependency directives and chunk size remain.

The optional [`scripts/capture-okn.mjs`](../scripts/capture-okn.mjs) uses a separately installed Playwright module; it is not a runtime dependency. With the server running, set `PLAYWRIGHT_MODULE` to that installation's absolute `index.mjs` path and optionally `CHROMIUM_PATH` to its browser executable, then run `node scripts/capture-okn.mjs` from repository root. Use Playwright's normal browser installation if no executable override is supplied. Do not run captures with private data substituted.

Browser checks passed: chart, RDF-only profile switch with equal data hash and intent, inspector, repeat/switch-back, 390px viewport without page-level overflow, visible loading, local transport failure, empty results, and a visibly dated endpoint-failure fallback. No page errors were observed. The mocked failure/empty flows run in a separate unrecorded context. Additional unit tests prove RDF label/order/path/mapping changes are consumed, DASH aliases work, and conflicting/unsupported hints are rejected. Unit tests also cover live-fetch failure/timeout fallback, in-flight/cache behavior, invalid specs, units and results, response-size bounds, conflicting rows, and derived SHACL rejection. CI runs the backend/build and offline transport checks; browser capture and the live public endpoint check are local checks, not CI network dependencies.

## Remaining limits

No live autonomous agent, general query builder, time-series renderer, map, visualization grammar, unit conversion engine, clinical/operational use, chart editing, hosted deployment or arbitrary schema support. The separate synthetic time-series discussion remains conceptual. Snapshot data can become stale; it is deliberately dated and never labeled as current conditions. The full endpoint dataset's redistribution terms are not redefined by this prototype's MIT code license.
