# Third-party provenance

No upstream repository snapshot or dependency implementation is committed here. npm dependencies are installed from the two lockfiles; their individual licenses remain applicable.

- CopilotKit React core 1.78.0: MIT according to its installed package manifest. This demo uses a development-only integration surface and does not claim rights to separately licensed commercial features.
- Experimental `rdf-ext/shacl-engine`, commit `1d111fc772a71ec2118eed2974709c2b04f47510`: MIT, copyright 2023 Thomas Bergwinkl. Downloaded archives retain upstream `LICENSE.md`.
- W3C `data-shapes`, commit `4f88f8c5398a87f7957260593f1f0742b5924a65`: downloaded only for the comparison harness, not redistributed in Git. Consult upstream notices and [W3C licensing](https://www.w3.org/copyright/) before redistributing that corpus.
- Hand-authored ontology-vocabulary-derived demo: existing MIT notice, copyright 2026 LA3D, preserved in `third-party/ontology-vocabulary-MIT.txt`. Referencing namespace IRIs does not bundle or activate external ontology closures.

The downloader checks the exact archive hashes recorded during the original experiment. Archives, extracted trees, package caches and generated results remain ignored. No broad relicense of third-party code is intended.

- The three factual prediction records in `e2e-demo/fixtures/okn/snapshot.json` come from the public UFOKN named graph served by OKN. Source endpoint, graph, retrieval time and query hash accompany the raw bindings. They are attributed public source data, not a claim to relicense the upstream dataset under this project's MIT license. SOSA/QUDT namespace references and the local mapping do not bundle the complete ontologies. See `docs/okn-example.md`.
