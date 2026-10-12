# SHACL + CopilotKit UI experiments

This is a **very simple exploratory prototype of dynamically agent-driven user interfaces**: represent small interface hints in data, then connect that data to a UI toolkit through CopilotKit and AG-UI. An agent can make presentation decisions; hints give it useful context, reduce ambiguity and help similar situations receive consistent treatment. The aim is not to prescribe every interaction or encode a uniquely correct interface.

**Current implementation:** two synthetic form examples with a deterministic scripted driver, explicit editor choices and approved React components. There is no live model deciding layouts and no implemented chart renderer. The code explores the plumbing for the broader idea; it is not a framework or production system. No model credentials are needed.

## Why semantics and small hints help

Ontology terms give fields and relationships shared meaning and stable identity, even when different views use different labels. SHACL shapes express selected validation constraints and structural metadata. UI annotations convey presentation intent. These roles are related, but a preferred editor is not a data-validity rule, and a valid RDF graph is not proof that its assertions are factually correct.

In the working example, `sh:path ex:title` identifies the field, `sh:minCount 1` requires a value, and `shui:editor shui:TextFieldEditor` selects the demo's text editor. The application chooses which editors it supports and how to render them. Its server code separately enforces edit allowlists and reviewed saves; SHACL does not supply identity or authorization.

For dynamic visualization, a time field, numeric measure and unit could suggest a time-series view. A small hint could reinforce that choice while leaving an agent free to choose points, lines, groups or a table after checking the actual data and task. Irregular sampling, missing values, aggregation and incompatible units can change that decision. **This chart example is conceptual; this repository currently implements forms only.** See [semantics, hints and dynamic visualization](docs/semantics-and-hints.md) for synthetic examples and links to the actual code.

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

- `/`: propose a synthetic record edit, invalidate a required title or catalog-dependent option, correct it, review the exact change and confirm a local save.
- `/?view=prism&persona=command`: compare Unit command and Embedded medical presentations of the same invented graph. Each simulated role has its own read/write projection.

Local stores are created under `e2e-demo/data/` on the first save. Stop the server and move that directory aside to reset to immutable synthetic Turtle fixtures. Logs under `e2e-demo/evidence/` may contain entered text and are ignored by Git; use synthetic inputs only.

With no other server using port 4173, run both transport checks:

```sh
cd e2e-demo # from repository root
node test/run-transport.mjs
```

The runner starts and stops its own server. Existing service tests use temporary stores. Type checks, lint, backend tests, build and transport checks are configured in GitHub Actions.

## Included capabilities and boundaries

| Implemented in this repository | Design only / excluded |
| --- | --- |
| Stable shape IDs, direct predicate paths, grouped/ordered fields, explicit SHUI editor annotations | General SHUI conformance, scoring-based editor discovery, arbitrary shapes |
| CopilotKit registered tool rendering, AG-UI SSE snapshots and RFC 6902 state deltas | Live LLM, production CopilotKit runtime integration, DASH/A2UI renderer |
| RDF term preservation, candidate-graph validation, field-routed errors | Full SHACL 1.2 coverage, Rules execution, general node expressions |
| Server catalog-dependent choices using nested simple `pathValues` expressions | Sequence-path expression support; engine fails to compile the tested sequence form |
| Exact-candidate review, revision checks, atomic local save, bounded persisted idempotency ledger | Distributed transactions, production authentication or authorization |
| Synthetic role-specific evidence views, hidden-node filtering before serialization, backend edit allowlists | Approved stakeholder policy, clinical use, diagnosis, prediction or operational decision support |

The role selector chooses a **simulated persona**, not an authenticated identity. Anyone who can access this local demo can select either role. It demonstrates projection and edit boundaries, not access control suitable for real records. Changing evidence does not automatically recompute the characterization.

## Architecture

Trusted local Turtle → bounded descriptor/compiler → approved React fields. CopilotKit's `useRenderTool`/`useRenderToolCall` render registered components; `useAgent` carries shared draft state through an AG-UI `HttpAgent`. The provider uses the explicitly development-only `agents__unsafe_dev_only` extension point.

Human edits are local until sent on an AG-UI request. The server assembles a candidate RDF graph, validates it with the pinned experimental `shacl-engine`, and returns field feedback. Review binds the exact draft to a thread and current record/catalog revisions. Save requires that review plus fresh validation. The server writes a temporary JSON file and renames it; proposals and reviews do not save records. The role-view extension separates domain shapes, presentation annotations and illustrative server policies.

- `e2e-demo/src/`: two working UI examples and approved React renderers.
- `e2e-demo/server/`: HTTP/SSE transport, profile compilation, validation and save workflow.
- `e2e-demo/shapes/`: synthetic examples and bounded constraints.
- `e2e-demo/test/`: original backend and transport checks plus an automated server runner.
- `node-experiment/`: original Node compatibility investigation.
- `fixture/`: synthetic RDF preservation and candidate-graph examples.
- `docs/`: support limits, source provenance and reproducibility notes.

## SHACL draft support

This is a pinned experiment against the SHUI first public working draft of 2026-05-26 and SHACL Core working draft of 2026-10-08, not a standards-conformant SHACL 1.2 product. The UI uses the published hash namespace `http://www.w3.org/ns/shacl-ui#`; later draft vocabulary can differ. Unknown constraints/editors are rejected by the demo profile. `sh:rootClass` is deliberately excluded because the original separate-graph tests expose an engine defect. The engine's package label `1.0.2` does **not** identify the experimental source; the immutable commit pin does.

See [support and experimental results](docs/support.md), [provenance](docs/provenance.md) and [third-party notices](THIRD_PARTY.md). Original project code is licensed under [MIT](LICENSE). Third-party notices and dependency licenses remain applicable.

## Public references

- [SHACL Core](https://www.w3.org/TR/shacl12-core/)
- [SHACL User Interfaces](https://www.w3.org/TR/shacl12-ui/)
- [DASH vocabulary](https://datashapes.org/dash) — design reference, not a shipped renderer
- [CopilotKit source](https://github.com/CopilotKit/CopilotKit)
- [AG-UI protocol](https://github.com/ag-ui-protocol/ag-ui)
- [Pinned validator](https://github.com/rdf-ext/shacl-engine/tree/1d111fc772a71ec2118eed2974709c2b04f47510)
- [Pinned W3C test corpus](https://github.com/w3c/data-shapes/tree/4f88f8c5398a87f7957260593f1f0742b5924a65)
