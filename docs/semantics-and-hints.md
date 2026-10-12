# Semantics, small hints and dynamic interfaces

The question behind this small experiment is: can an agent use meaning and a few interface hints carried with data to build a useful interaction through an existing UI toolkit? An agent is capable of choosing a presentation. Hints can spare it repeated guesswork about what a field represents or which interaction is usually useful, without attempting to specify every screen or conversation.

The present code tests a narrow part of that idea: scripted proposals, explicit form editor annotations, registered React components and a validated edit round trip. The [working OKN extension](okn-example.md) adds a bounded public query and an RDF-compiled comparison-chart/table choice with scripted intent and explicit result checks. It does not test a live agent's ability to choose a layout, infer user intent or select a chart. Those are exploratory directions, not shipped features.

## Six distinct roles

| Role | What it contributes | Boundary in this prototype |
| --- | --- | --- |
| Data semantics | Stable terms identify a field, its meaning and relationships across views. | Reusing ontology IRIs does not execute ontology inference or establish truth. |
| Validation | Shapes test declared requirements such as datatype, count, length and allowed values against a candidate graph. | Only the bounded supported profile is tested; conformance is relative to those shapes and this engine. |
| Presentation hints | Labels, groups, order and editor annotations communicate presentation intent. | They do not automatically become SHACL constraints or access rules. |
| Agent/application choice | Select a suitable interaction using the task, data, hints and supported capabilities. | Here, the driver is scripted and editor mappings are explicit; open-ended agent choice is not implemented. |
| Component rendering | Approved React components make the chosen descriptor interactive through CopilotKit/AG-UI. | No arbitrary code is loaded from shape metadata. |
| Edit readback | Return typed edits, construct a candidate graph, validate, review and save. | Validation checks declared structure; it does not prove factual accuracy or decide who is entitled to edit. |

Shared identity is useful when labels change. In [`server/prism.mjs`](../e2e-demo/server/prism.mjs), the same field and predicate IDs receive different labels and groupings for the two simulated personas. Domain constraints live in [`shapes/prism/domain.ttl`](../e2e-demo/shapes/prism/domain.ttl), presentation annotations in [`shapes/prism/ui.ttl`](../e2e-demo/shapes/prism/ui.ttl), and illustrative read/write policy in the server's `POLICIES` object. These are deliberately different concerns. The persona selector is not authentication.

## A form example that exists in the code

This shortened excerpt uses the same terms as [`shapes/record.ttl`](../e2e-demo/shapes/record.ttl); it is explanatory, not a complete runnable profile:

```turtle
@prefix ex: <https://example.org/shui-demo/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix shui: <http://www.w3.org/ns/shacl-ui#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:TitleShape sh:path ex:title ;
    sh:datatype xsd:string ; sh:minCount 1 ; sh:maxCount 1 ;
    sh:name "Title" ; sh:order 1 ;
    shui:editor shui:TextFieldEditor .
```

`ex:title` is this synthetic demo's predicate, not a broadly standardized domain term. `sh:path` connects the property shape to that predicate. The datatype and count constraints participate in validation. `sh:name` and `sh:order` supply descriptive/presentation metadata. `shui:editor` conveys the intended editor; selecting that editor does not itself validate the value.

The current compiler in [`server/rdf.mjs`](../e2e-demo/server/rdf.mjs) is intentionally stricter than the broader hint idea: it requires an explicit supported editor and rejects unknown profiles. That is an application implementation boundary, not evidence that a UI preference is universally mandatory under SHACL. [`src/main.tsx`](../e2e-demo/src/main.tsx) maps supported editor IDs to an input or select and registers the form with CopilotKit. The role example has its own bounded compiler and renderer in [`server/prism.mjs`](../e2e-demo/server/prism.mjs) and [`src/prism.tsx`](../e2e-demo/src/prism.tsx).

After an edit, the UI sends typed RDF terms in shared state on the next AG-UI request. [`server/service.mjs`](../e2e-demo/server/service.mjs) builds a candidate graph, validates it and binds review to the exact candidate and revisions. Confirmation triggers fresh validation and local persistence. [`server/http.mjs`](../e2e-demo/server/http.mjs) carries snapshots, deltas and tool calls over SSE. Human review, allowed edit fields, revision checks and save policy are application behavior; SHACL alone does not implement them.

## Vocabulary boundaries

- **SHACL:** `sh:path`, datatype/cardinality constraints and descriptive metadata such as `sh:name`, `sh:description`, `sh:group` and `sh:order` have different roles. A term's presence in a shape does not mean it imposes a validation condition.
- **SHACL 1.2 draft features:** the code exercises a pinned experimental subset, including `sh:singleLine` and a dynamic `sh:in` expression using `shnex:pathValues`/`shnex:focusNode`. Support is limited to the tested patterns; see [support.md](support.md).
- **SHACL UI draft vocabulary:** the demo uses `shui:editor`, `shui:propertyRole` and selected editor/role IRIs in `http://www.w3.org/ns/shacl-ui#`, pinned to the published 2026-05-26 draft vocabulary. It does not claim full SHUI support or automatic compatibility with newer drafts.
- **DASH conventions:** DASH is a related design reference for shape-associated UI metadata/editor conventions. This code does not consume a DASH profile, implement DASH editor discovery or ship a DASH renderer. DASH and SHUI are not treated as interchangeable namespaces.
- **Prototype terms:** `ex:*` synthetic predicates, `d:*` fixture/shape IDs and the `hint:*` terms below are demo-owned. The role fixture's `sh:agentInstruction` sentinel, and the compiler allowlist entries for `sh:agentInstruction`/`sh:intent`, are non-validating experimental annotations; their spelling in the `sh:` namespace is not a claim of standardized support. The sentinel is deliberately excluded from agent context and never executed. Do not use it as an instruction mechanism.

Neither vocabulary annotations nor validation establish that an observation is true, authorize disclosure, or determine a uniquely correct visualization. Source quality, permissions, task context and rendering choices need their own checks.

## Conceptual time-series example — no time-series implementation

Consider three synthetic temperature observations, with a gap in the last reading. This standalone illustrative Turtle is not loaded by the current form compiler. All `ex:*` domain terms and `hint:*` hints here are invented for explanation; no chart-hint standard is claimed.

```turtle
@prefix ex: <https://example.org/series/> .
@prefix hint: <https://example.org/ui-hints/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:series hint:preferredView hint:TimeSeries ;
    hint:timeField ex:time ; hint:valueField ex:value ;
    hint:unitField ex:unit ; hint:groupField ex:sensor ;
    ex:observation ex:a, ex:b, ex:c .
ex:a ex:time "2026-10-01T09:00:00Z"^^xsd:dateTime ;
    ex:value "20.0"^^xsd:decimal ; ex:unit ex:degreeCelsius ;
    ex:sensor ex:sensorA .
ex:b ex:time "2026-10-01T09:07:00Z"^^xsd:dateTime ;
    ex:value "20.4"^^xsd:decimal ; ex:unit ex:degreeCelsius ;
    ex:sensor ex:sensorA .
ex:c ex:time "2026-10-01T09:30:00Z"^^xsd:dateTime ;
    ex:unit ex:degreeCelsius ; ex:sensor ex:sensorA .
```

The semantics distinguish observation time, measured value, unit and sensor identity. A declared shape could require a parseable time, numeric values when present, and a unit, with an explicit rule about whether missing readings are allowed. A view hint suggests time on one axis and temperature on the other. The agent/application still needs to inspect actual values, the user's task and renderer capabilities before choosing a view:

- **Irregular sampling:** 7-minute and 23-minute intervals should not look equally spaced on a temporal axis. A line can imply interpolation; points may better communicate what was observed.
- **Missing values:** `ex:c` has no value. Do not silently convert that absence into zero or connect across it without a deliberate gap/interpolation policy. A shape requiring a value would reject it; a shape permitting missingness would not make the missing value known.
- **Aggregation:** hourly averages, sums and last observations answer different questions. A time-series hint does not choose an aggregation function or justify resampling.
- **Units and groups:** verify compatible units before combining readings; convert explicitly or separate series. Grouping by sensor can avoid conflating measurements. A unit IRI names a unit but does not perform conversion.
- **Uncertainty:** if supplied, distinguish an interval, standard deviation or measurement tolerance before selecting error bars or a band. A generic uncertainty label does not supply that interpretation.

A capable agent might choose a scatter plot, a line with explicit gaps, separate panels or a table. Small hints narrow plausible options and make decisions more consistent; they remain guidance rather than proof. A future edit interaction would map changed values back to observations and run declared constraints plus application review/policy checks, just as the existing forms do. The working OKN extension renders a categorical comparison chart; time-series rendering, aggregation, magnitude conversion and chart edit readback are **not implemented here**.

The useful separation is: meaning tells us what the data says; validation tests selected requirements; hints suggest presentation; the agent/application chooses; components render; edits return through validation and review. None of these layers substitutes for all the others.
