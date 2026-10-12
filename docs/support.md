# Support and reproducibility

This is a small exploration of data-carried interface hints, not a general UI framework. The current scripted driver and explicit editor mapping do not demonstrate autonomous presentation selection. The time-series discussion in [semantics-and-hints.md](semantics-and-hints.md) remains conceptual. The [OKN extension](okn-example.md) implements RDF viewer preferences, column paths and chart mappings; scripted questions select only an intent.

## Local release checks (2026-10-12)

Fresh `npm ci --ignore-scripts --no-audit --no-fund` completed for both lockfiles on macOS arm64, Node 26.8.2 / npm 11.19.1. The demo passed TypeScript, ESLint, all 21 backend tests and the Vite production build. Build warnings concern dependency `use client` directives and large chunks; no bundle optimization or dependency upgrade is claimed. The six original transport checks and eight role-view transport checks also passed against a fresh loopback server, which was stopped afterward. CI targets Node 24 on Linux and must be assessed separately from this local result.

## Original Node compatibility investigation

From repository root:

```sh
python3 scripts/fetch-upstream.py
cd node-experiment
npm ci --ignore-scripts --no-audit --no-fund
node run-comparison.mjs
```

The original harness intentionally reports its actual failures and exits **1**. On the release check it produced **48 passed, 2 failed, 2 unsupported** (52 cases). All nine selected W3C cases passed; that is a selected subset, not the complete W3C suite. Results and raw RDF reports are generated under ignored `node-experiment/results/`.

The two failures are `rootClass-transitive` and `rootClass-hierarchy-shapes-only`, where the needed class hierarchy is in the separate shapes graph. The same hierarchy in the data graph passes. The UI adapter excludes `sh:rootClass`; it does not patch or pretend to fix the upstream engine.

The unsupported cases are an unknown constraint (silently ignored by the engine) and an unknown node expression (explicit compilation failure). A raw conforms result when a constraint is ignored is not feature support. The application uses a bounded allowlist to reject unsupported profiles before validation.

The passing canaries exercise `singleLine` control characters, `subsetOf` with predicate/sequence/inverse paths, `closed sh:ByTypes`, dynamic `sh:in`, candidate validation including an off-form target, lexical integer `007`, language-tagged literals and multiple source IRIs. They are experimental coverage, not a full conformance claim. General JSON-LD serialization is not tested by the Node harness.

A separate limitation recorded in the original demo is sequence-form `shnex:pathValues` compilation; the working form uses nested simple paths. The compatibility harness's sequence **property-path** tests are not evidence for sequence **node-expression** support.

## UI scope

The original UI supports one string and two IRI fields; the role extension supports bounded string edits on distinct focus nodes. Shape and field identities remain stable, and hidden RDF terms survive edits. There is no general multivalue UI, arbitrary complex editable path, scoring-based widget selection, general DASH/A2UI renderer or full SHUI implementation. The OKN extension supports a bounded SHUI viewer subset plus explicit DASH viewer aliases; see [terms and limits](okn-example.md#verified-terms-and-scope).

No live model, production ontology closure validation, medical inference, authenticated stakeholder policy, load/security audit, browser matrix or physical mobile-device testing is included. Prior screenshots/PDFs are deliberately not reproduced as current verification evidence. The original release check reran backend/build/transport checks, not the historical form browser session. The OKN extension has a separate current browser check and genuine public-data screenshots/recording; see [okn-example.md](okn-example.md).
