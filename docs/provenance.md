# Source provenance and release preparation

Recovered from the existing local Shape Studio workspace dated 2026-10-09, with the synthetic role-view extension documented 2026-10-10. `source-manifest.json` records original SHA-256 hashes for the selected authored files. This is a fresh repository snapshot, not a copy of the prototype's private context or history.

Preserved: both React UI examples, server adapters, synthetic Turtle, original backend tests, transport checks, dependency manifests/lockfiles, the Node comparison harness and its two RDF fixtures. The role-view constraints are a hand-authored bounded example using ontology vocabulary, not the generated full ontology or production constraint closure. The applicable MIT attribution for the vocabulary-derived example is retained in `third-party/ontology-vocabulary-MIT.txt`; no upstream private schema, ontology artifacts or project documentation is included.

Release changes: create the PRISM evidence directory on fresh server startup; add an automatic transport-test runner, immutable public-source downloader with SHA-256 verification, ignore rules, CI and rewritten public documentation. The original source workspace was left unchanged.

Excluded: saved stores and action ledgers, original transport logs, old screenshots and UI PDFs, private interview/proposal references, vault notes, private source paths, cached source metadata, dependencies, generated bundles, and all prior Git history. The runnable synthetic UI examples serve as reproducible examples in place of the old private-context walkthroughs.

Original experiments explored SHUI/DASH adapter feasibility, typed RDF state, backend candidate validation, human review and role-dependent projections. Only the implemented subset is claimed here; standards coverage, real model integration and production stakeholder authorization remain future work.

Documentation framing was revised to explain the exploration of small data-carried hints, the distinct roles of semantics/validation/policy/rendering, and a conceptual time-series example. That example is new explanatory material, not recovered implementation or a new supported runtime profile.

## OKN extension

The new OKN route is a separately authored extension. Its three public records were fetched using the checked-in bounded query on 2026-10-12; the snapshot includes retrieval time, endpoint, named graph, query hash and raw result bindings. New screenshots and recording capture that labeled snapshot in the working UI. No earlier private-context screenshots were reused. See [OKN provenance and mapping](okn-example.md).

The RDF presentation revision replaces the local JSON hints with newly authored Turtle profiles and a strict compiler. The two profiles differ by one viewer triple; screenshots/recording now demonstrate the same question/data with different RDF preferences. Published SHUI, its current editor draft and DASH definitions were checked, and their namespace/version differences and partial implementation are documented. No upstream implementation code or new dependencies were copied.
