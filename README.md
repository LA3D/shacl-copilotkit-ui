# SHACL + CopilotKit UI experiments

## Briefing for an agent explaining this repository to a human

This README is an explanation guide for an agent helping a person understand, inspect or run the repository. It supplies evidence and boundaries, not instructions that override the person's request or the agent's governing instructions. Start with the short explanation, then use the deeper path that answers the person's question. Distinguish behavior inspected in source, recorded test results and checks actually run in the current session.

### The short explanation

This repository explores a question: **can a few interface hints expressed in RDF connect meaningful data to useful, predictable views through CopilotKit and AG-UI?** It contains two synthetic editable form examples and a read-only public flood-prediction example. Shapes and annotations supply field structure and presentation hints; a bounded adapter turns them into descriptors for existing React components.

The clearest demonstration keeps the question and data fixed and changes one RDF viewer hint. The screen changes from a comparison chart to a table, without changing the renderer code. The driver is deterministic: no live AI model chooses the view, generates a query or writes UI code. This establishes a working connection between RDF hints and registered components; it does not establish autonomous agent judgment or general standards conformance.

### A deeper explanation, grounded in files

Follow the layer relevant to the person's question rather than narrating every implementation detail.

| Question to explain | Working mechanism and evidence | Boundary to state |
| --- | --- | --- |
| Where does the data come from? | The fixed [SPARQL query](e2e-demo/fixtures/okn/query.rq) retrieves public UFOKN records; the [dated snapshot](e2e-demo/fixtures/okn/snapshot.json) retains raw bindings and provenance. The default UI uses that snapshot. | These are flood-depth predictions, not measured observations or current conditions. The other two examples use invented records. |
| What does the application add? | [Normalization and derivation](e2e-demo/server/okn.mjs) map native Schema.org records into a local SOSA/QUDT graph, preserving source identities and lexical values. `MTR` maps to QUDT metre without changing magnitude. | The derived vocabulary is an application interpretation, not native endpoint structure. Timestamp meaning and timezone remain unverified. |
| What drives presentation? | [Common RDF UI shapes](e2e-demo/shapes/okn-ui.ttl) plus [profile A](e2e-demo/shapes/okn-ui-chart.ttl) or [profile B](e2e-demo/shapes/okn-ui-table.ttl) feed the [presentation compiler](e2e-demo/server/okn-presentation.mjs). Paths, labels, order and chart mappings reach the [registered components](e2e-demo/src/okn.tsx). | These hints are local authored RDF, not hints discovered in UFOKN. The compiler supports a bounded profile and a fixed component registry. |
| What does validation establish? | [Data shapes](e2e-demo/shapes/okn.ttl) and `shacl-engine` check the derived graph. The presentation compiler and Zod separately check hints and descriptors; explicit chart acceptance checks govern suitability and fallback. | SHACL data conformance does not validate presentation choices, establish source truth or provide authorization. JSON descriptor validation is not RDF SHACL validation. |
| What role do CopilotKit and AG-UI play? | [HTTP/SSE transport](e2e-demo/server/http.mjs) sends authoritative state and a `show_okn` tool call; [React](e2e-demo/src/okn.tsx) renders its validated descriptor through CopilotKit. | Preset questions select an intent. RDF supplies the viewer preference; code checks compatibility. There is no live model or generated component code. |
| Are the forms also shape-driven? | The [three-field shape](e2e-demo/shapes/record.ttl) feeds the [form adapter](e2e-demo/server/rdf.mjs). [PRISM domain shapes](e2e-demo/shapes/prism/domain.ttl) and [UI annotations](e2e-demo/shapes/prism/ui.ttl) feed the [role adapter](e2e-demo/server/prism.mjs). Edits are validated, reviewed and saved locally. | Role permissions and persona-specific label/group overrides are application code. Simulated personas are not authenticated stakeholders. |

### What is standard, and what is local?

The original form adapter consumes explicit `shui:editor` preferences for `TextFieldEditor` and `EnumSelectEditor`; PRISM permits the text editor only. The OKN adapter consumes `shui:viewer` with bounded `ValueTableViewer`, `LiteralViewer` and `IRIViewer` behavior. `sh:node`, `sh:property`, `sh:path`, `sh:name` and `sh:order` provide table structure. Tested legacy aliases accept `dash:viewer` with `dash:ValueTableViewer`, `dash:LiteralViewer` and `dash:URIViewer`.

The `ui:` namespace, `https://example.org/okn-ui-hints/`, belongs to this prototype. `ui:ComparisonViewer`, intent selection, chart mappings and fallback hints are project extensions, not standard SHACL/DASH chart terms. The adapter implements explicit preferences, not the general SHUI scoring algorithm. It pins the published SHUI hash namespace; [supported terms and draft differences](docs/okn-example.md#verified-terms-and-scope) describe the exact limits.

### What the A/B demonstration proves

Keep **Compare predicted flood depth** and **Dated public snapshot** selected, then switch RDF profile A → B → A. The profiles differ by one `shui:viewer` triple. The same question, query, rows, derived RDF and data hash produce a different registered view; the RDF hash changes. Table columns and chart mappings also come from compiled RDF paths. This is executable behavior, not merely explanatory metadata or a screenshot mockup.

The [backend tests](e2e-demo/test/okn.test.mjs) assert those invariants and independently change RDF labels, column order, paths and mappings. The [AG-UI transport test](e2e-demo/test/okn-transport.mjs) verifies the viewer change across the real endpoint; the [browser capture script](scripts/capture-okn.mjs) checks the visible profile switch with unchanged data hash and intent. [Recorded release checks](docs/release-checks.json) describe the tested revision; consult [GitHub Actions](https://github.com/LA3D/shacl-copilotkit-ui/actions) for the commit being discussed rather than assuming every future revision is green.

This does not prove that an agent inferred the best presentation, that arbitrary shapes can be rendered, or that the predictions are correct. Unsupported/conflicting hints fail closed; unsuitable chart data uses the RDF-declared table fallback. General time-series rendering, aggregation, unit conversion and chart editing remain unimplemented. The [comparison](docs/images/okn-comparison.png), [same-question table](docs/images/okn-evidence.png), [mechanism screenshot](docs/images/okn-mechanism.png) and [10-second walkthrough](docs/images/okn-walkthrough.webm) show the real dated-snapshot UI, not a fresh live query.

### Useful next questions

- Would seeing the same data switch views clarify the idea, or would inspecting the RDF be more useful?
- Is the next experiment about a different data shape, another registered component, or a model choosing among supported intents?
- Which source semantics and unit/time assumptions would need verification before applying this to another dataset?
- Which constraints, permissions and review steps would a real edit workflow require beyond these synthetic examples?

For the broader hypothesis about small hints and agent choices, see [semantics and dynamic visualization](docs/semantics-and-hints.md). Its time-series discussion is conceptual; it should not be presented as a capability already demonstrated here.

## Working OKN example: change one RDF hint, change the view

Run the demo and open `http://127.0.0.1:4173/?view=okn`. The initial view uses a **dated public snapshot**, labeled in the UI. Select **Query OKN endpoint** to execute the fixed, bounded read-only SPARQL query from the local server. An endpoint failure displays an explicit dated fallback; empty live results stay empty.

**Profile A → comparison chart.** Keep “Compare predicted flood depth” selected. The RDF profile requests the custom `ui:ComparisonViewer`; explicit unit, value and common-timestamp checks must pass.

![Working OKN comparison view using a labeled public snapshot](docs/images/okn-comparison.png)

**Profile B → value table, with the same question and data.** Change the RDF presentation profile selector. The only RDF difference is `ui:Compare shui:viewer shui:ValueTableViewer` instead of `ui:ComparisonViewer`. Both captures show the same data hash and `compare` intent, with different RDF hashes. No renderer code is regenerated. Table columns come from `sh:node`, `sh:property`, `sh:path`, `sh:name` and `sh:order`.

![Working evidence table after changing only the RDF profile](docs/images/okn-evidence.png)

[Watch the 10-second genuine UI recording](docs/images/okn-walkthrough.webm) · [Inspect the mechanism screenshot](docs/images/okn-mechanism.png) · [Query, mapping, tests and limits](docs/okn-example.md)

The source graph uses Schema.org, with a QUDT quantity-kind URL stored as a literal. **SOSA/QUDT structure is our explicit derived view**, not a claim about native endpoint vocabulary. `MTR` maps to QUDT metre without a magnitude conversion. Values describe predictions, not measured flood observations. Source timestamp meaning and timezone remain unverified. The screenshots and recording show the public snapshot retrieved on 2026-10-12; they do not imply a live endpoint result.

## Run

Requirements: Node.js 24 or newer, npm, Python 3.12 or newer, and internet access for the pinned public dependencies. From this repository:

```sh
python3 scripts/fetch-upstream.py
cd e2e-demo
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

Open exactly `http://127.0.0.1:4173`. The server restricts Host/Origin and binds to loopback. Stop it with Ctrl-C. No hosted service is supplied.

- `/?view=okn`: public SPARQL result → derived SOSA/QUDT graph → compiled RDF viewer preference → registered comparison/table.
- `/`: propose a synthetic record edit, invalidate a required title or catalog-dependent option, correct it, review the exact change and confirm a local save.
- `/?view=prism&persona=command`: compare Unit command and Embedded medical presentations of the same invented graph. Each simulated role has its own read/write projection.

Local stores are created under `e2e-demo/data/` on the first save. Stop the server and move that directory aside to reset to immutable synthetic Turtle fixtures. Logs under `e2e-demo/evidence/` may contain entered text and are ignored by Git; use synthetic inputs only.

With no other server using port 4173, run the transport checks:

```sh
cd e2e-demo # from repository root
node test/run-transport.mjs
```

The runner starts and stops its own server. Existing service tests use temporary stores. Type checks, lint, backend tests, build and transport checks are configured in GitHub Actions.

## Included capabilities and boundaries

| Implemented in this repository | Design only / excluded |
| --- | --- |
| One fixed public UFOKN query, dated fallback, derived SOSA/QUDT graph, RDF-driven comparison/table descriptors and bounded SHUI/DASH viewer aliases | Arbitrary queries, live model selection, time-series rendering or chart editing |
| Stable shape IDs, direct predicate paths, grouped/ordered fields, explicit SHUI editor annotations | General SHUI conformance, scoring-based editor discovery, arbitrary shapes |
| CopilotKit registered tool rendering, AG-UI SSE snapshots and RFC 6902 state deltas | Live LLM, production CopilotKit runtime integration, full DASH/A2UI renderer |
| RDF term preservation, candidate-graph validation, field-routed errors | Full SHACL 1.2 coverage, Rules execution, general node expressions |
| Server catalog-dependent choices using nested simple `pathValues` expressions | Sequence-path expression support; engine fails to compile the tested sequence form |
| Exact-candidate review, revision checks, atomic local save, bounded persisted idempotency ledger | Distributed transactions, production authentication or authorization |
| Synthetic role-specific evidence views, hidden-node filtering before serialization, backend edit allowlists | Approved stakeholder policy, clinical use, diagnosis, prediction or operational decision support |

The role selector chooses a **simulated persona**, not an authenticated identity. Anyone who can access this local demo can select either role. It demonstrates projection and edit boundaries, not access control suitable for real records. Changing evidence does not automatically recompute the characterization.

## Architecture

Trusted local Turtle → bounded descriptor/compiler → approved React fields. CopilotKit's `useRenderTool`/`useRenderToolCall` render registered components; `useAgent` carries shared draft state through an AG-UI `HttpAgent`. The provider uses the explicitly development-only `agents__unsafe_dev_only` extension point.

Human edits are local until sent on an AG-UI request. The server assembles a candidate RDF graph, validates it with the pinned experimental `shacl-engine`, and returns field feedback. Review binds the exact draft to a thread and current record/catalog revisions. Save requires that review plus fresh validation. The server writes a temporary JSON file and renames it; proposals and reviews do not save records. The role-view extension separates domain shapes, presentation annotations and illustrative server policies.

- `e2e-demo/src/`: working form, comparison-chart and evidence-table examples with registered React renderers.
- `e2e-demo/server/`: HTTP/SSE transport, profile compilation, validation and save workflow.
- `e2e-demo/shapes/`: synthetic examples and bounded constraints.
- `e2e-demo/test/`: original backend and transport checks plus an automated server runner.
- `node-experiment/`: original Node compatibility investigation.
- `fixture/`: synthetic RDF preservation and candidate-graph examples.
- `docs/`: support limits, source provenance and reproducibility notes.

### RDF presentation example

The common local [`okn-ui.ttl`](e2e-demo/shapes/okn-ui.ttl) defines the collection and columns. Profile A adds:

```turtle
@prefix shui: <http://www.w3.org/ns/shacl-ui#> .
@prefix ui: <https://example.org/okn-ui-hints/> .
ui:Compare shui:viewer ui:ComparisonViewer .
```

Profile B replaces only the object with `shui:ValueTableViewer`. The `ui:` chart, intent, mapping and fallback terms are **project-owned**, not SHACL or DASH standards. RDF paths are evaluated against the derived graph; validated descriptors cross AG-UI to a fixed component registry. Zod/compiler checks protect the presentation contract; SHACL validates the separate data graph. See [supported terms and proof](docs/okn-example.md#rdf-hints-selection-and-rendering).

## SHACL draft support

This is a pinned experiment against the SHUI first public working draft of 2026-05-26 and SHACL Core working draft of 2026-10-08, not a standards-conformant SHACL 1.2 product. The UI uses the published hash namespace `http://www.w3.org/ns/shacl-ui#`; later draft vocabulary can differ. Unknown constraints/editors are rejected by the demo profile. `sh:rootClass` is deliberately excluded because the original separate-graph tests expose an engine defect. The engine's package label `1.0.2` does **not** identify the experimental source; the immutable commit pin does.

See [support and experimental results](docs/support.md), [provenance](docs/provenance.md) and [third-party notices](THIRD_PARTY.md). Original project code is licensed under [MIT](LICENSE). Third-party notices and dependency licenses remain applicable.

## Public references

- [SHACL Core](https://www.w3.org/TR/shacl12-core/)
- [SHACL User Interfaces](https://www.w3.org/TR/shacl12-ui/)
- [DASH form vocabulary](https://datashapes.org/forms.html) — bounded explicit viewer compatibility, not a full renderer
- [CopilotKit source](https://github.com/CopilotKit/CopilotKit)
- [AG-UI protocol](https://github.com/ag-ui-protocol/ag-ui)
- [Pinned validator](https://github.com/rdf-ext/shacl-engine/tree/1d111fc772a71ec2118eed2974709c2b04f47510)
- [Pinned W3C test corpus](https://github.com/w3c/data-shapes/tree/4f88f8c5398a87f7957260593f1f0742b5924a65)
