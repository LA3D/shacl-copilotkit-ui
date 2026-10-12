import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Engine } from 'shacl-engine';
import { factory, named, parse, serialize, XSD } from './rdf.mjs';

export const ENDPOINT = 'https://apps.okn.us/federation/sparql';
export const GRAPH = 'https://purl.org/okn/frink/kg/ufokn';
export const FEATURES = ['9mvu6s0twh5x', '9mvu9ztt54v1', '9mvu9zwtgy1s'].map(id => 'https://ufokn.org/id/urmi/' + id);
export const QUERY = await fs.readFile(new URL('../fixtures/okn/query.rq', import.meta.url), 'utf8');
export const QUERY_HASH = createHash('sha256').update(QUERY).digest('hex');
export const QUESTIONS = {
  compare: 'Compare predicted flood depth for these three features.',
  evidence: 'Show the supporting records and units.'
};
export const HINTS = z.object({ namespace: z.literal('https://example.org/okn-ui-hints/'), preferredView: z.literal('comparison'),
  categoryField: z.literal('feature'), quantityField: z.literal('depth'), unit: z.literal('http://qudt.org/vocab/unit/M'),
  evidenceView: z.literal('table'), note: z.string().max(200) }).strict().parse(JSON.parse(await fs.readFile(new URL('../fixtures/okn/hints.json', import.meta.url), 'utf8')));
export const ViewSchema = z.object({ kind: z.enum(['comparison', 'table']), question: z.enum(['compare', 'evidence']),
  categoryField: z.literal('feature'), valueField: z.literal('depth'), unit: z.literal('http://qudt.org/vocab/unit/M'),
  datasetId: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const RequestSchema = z.object({ question: z.enum(['compare', 'evidence']), source: z.enum(['live', 'snapshot']) }).strict();
const Binding = z.object({ type: z.enum(['uri', 'literal', 'typed-literal']), value: z.string().max(500), datatype: z.string().optional() }).strict();
const ResultSchema = z.object({ head: z.object({ vars: z.array(z.string()) }), results: z.object({ bindings: z.array(z.object({
  feature: Binding, obs: Binding, time: Binding, depth: Binding, unitCode: Binding, quantityKindText: Binding
}).strict()).max(12) }) }).passthrough();
const DEPTH = 'http://qudt.org/vocab/quantitykind/Depth';
const DEMO = 'https://example.org/okn-ui/';
const SOSA = 'http://www.w3.org/ns/sosa/';
const QUDT = 'http://qudt.org/schema/qudt/';
const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const PROV = 'http://www.w3.org/ns/prov#wasDerivedFrom';
const engine = new Engine(await parse(await fs.readFile(new URL('../shapes/okn.ttl', import.meta.url), 'utf8')), { factory });
export const SNAPSHOT = JSON.parse(await fs.readFile(new URL('../fixtures/okn/snapshot.json', import.meta.url), 'utf8'));
if (SNAPSHOT.endpoint !== ENDPOINT || SNAPSHOT.graph !== GRAPH || SNAPSHOT.querySha256 !== QUERY_HASH || !Number.isFinite(Date.parse(SNAPSHOT.retrievedAt))) throw new Error('Snapshot provenance does not match query');

export function normalize(result) {
  const bindings = ResultSchema.parse(result).results.bindings;
  const rows = bindings.map(b => {
    if (b.feature.type !== 'uri' || !FEATURES.includes(b.feature.value) || b.obs.type !== 'uri' || !/^uri:WEN-OKN_impacts_observation_[a-z0-9]+_\d+$/.test(b.obs.value)) throw new Error('Unexpected observation identity');
    for (const key of ['time', 'depth', 'unitCode', 'quantityKindText']) if (b[key].type === 'uri') throw new Error('Expected source literal');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(b.time.value)) throw new Error('Unexpected source timestamp syntax');
    if (!/^\d+(?:\.\d+)?$/.test(b.depth.value) || !Number.isFinite(Number(b.depth.value))) throw new Error('Invalid numeric depth');
    if (b.unitCode.value !== 'MTR' || b.quantityKindText.value !== DEPTH) throw new Error('Unsupported unit or quantity kind');
    return { feature: b.feature.value, label: b.feature.value.split('/').at(-1), observation: b.obs.value,
      sourceTime: b.time.value, sourceDepth: b.depth.value, depth: Number(b.depth.value), unitCode: b.unitCode.value,
      unit: HINTS.unit, quantityKind: DEPTH, raw: b };
  });
  // Collapse only identical projected bindings. Preserve differing values/times as evidence rows.
  return [...new Map(rows.map(row => [JSON.stringify(row.raw), row])).values()].sort((a, b) => a.feature.localeCompare(b.feature) || a.sourceTime.localeCompare(b.sourceTime) || a.observation.localeCompare(b.observation));
}
export function chooseView(rows, question, datasetId) {
  const comparable = rows.length > 0 && new Set(rows.map(r => r.feature)).size === rows.length && new Set(rows.map(r => r.sourceTime)).size === 1;
  const kind = question === 'compare' && comparable ? HINTS.preferredView : HINTS.evidenceView;
  const reason = !rows.length ? 'No matching results: show an empty evidence table.' : question === 'evidence'
    ? 'The question asks for sources and units: select the evidence table.' : comparable
      ? 'One shared source timestamp, one value per feature, compatible units: select a comparison chart, not a time series.'
      : 'The result is not one value per feature at a shared time: preserve the evidence in a table; do not aggregate implicitly.';
  return { view: ViewSchema.parse({ kind, question, categoryField: HINTS.categoryField, valueField: HINTS.quantityField, unit: HINTS.unit, datasetId }), reason };
}
export async function derive(rows) {
  const graph = factory.dataset();
  const add = (s, p, o) => graph.add(factory.quad(named(s), named(p), o));
  rows.forEach((row, index) => {
    const id = DEMO + 'prediction-' + index, quantity = id + '/quantity';
    add(id, TYPE, named(DEMO + 'DerivedPredictionView')); add(id, TYPE, named(SOSA + 'Observation'));
    add(id, SOSA + 'hasFeatureOfInterest', named(row.feature));
    add(id, SOSA + 'observedProperty', named(DEMO + 'predictedFloodDepth'));
    add(id, SOSA + 'hasResult', named(quantity)); add(id, PROV, named(row.observation));
    // The source does not establish time semantics/timezone. Do not assert SOSA resultTime/phenomenonTime.
    add(id, DEMO + 'sourceTimestamp', factory.literal(row.sourceTime));
    add(quantity, TYPE, named(QUDT + 'QuantityValue'));
    add(quantity, QUDT + 'numericValue', factory.literal(row.sourceDepth, named(XSD + 'decimal')));
    add(quantity, QUDT + 'unit', named(row.unit)); add(quantity, QUDT + 'hasQuantityKind', named(row.quantityKind));
  });
  const report = await engine.validate({ dataset: graph });
  if (!report.conforms) throw new Error('Derived graph failed the local SHACL profile');
  return serialize(graph);
}
export async function fetchResult(fetchImpl = fetch) {
  const url = new URL(ENDPOINT); url.searchParams.set('query', QUERY);
  const response = await fetchImpl(url, { headers: { Accept: 'application/sparql-results+json' }, redirect: 'error', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Endpoint HTTP ${response.status}`);
  if (!response.body) throw new Error('Endpoint response has no body');
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 128_000) throw new Error('Endpoint response exceeds 128 kB limit');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createOknService({ fetchImpl = fetch, now = () => Date.now(), snapshot = SNAPSHOT } = {}) {
  let cached, pending;
  async function live() {
    if (cached && now() - cached.at < 60_000) return cached.value;
    if (pending) return pending;
    pending = (async () => {
      let value;
      try {
        const result = await fetchResult(fetchImpl); normalize(result);
        value = { result, source: { mode: 'live', retrievedAt: new Date(now()).toISOString(), problem: null } };
      } catch (e) {
        value = { result: snapshot.result, source: { mode: 'fallback', retrievedAt: snapshot.retrievedAt,
          problem: e.name === 'TimeoutError' || e.name === 'AbortError' ? 'Live request timed out.' : e.message.startsWith('Endpoint HTTP') ? e.message : 'Live response unavailable or outside the supported profile.' } };
      }
      cached = { at: now(), value }; return value;
    })().finally(() => { pending = undefined; });
    return pending;
  }
  return {
    async run(input) {
      const request = RequestSchema.parse(input.forwardedProps);
      const data = request.source === 'snapshot'
        ? { result: snapshot.result, source: { mode: 'snapshot', retrievedAt: snapshot.retrievedAt, problem: null } } : await live();
      const rows = normalize(data.result);
      const datasetId = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
      const { view, reason } = chooseView(rows, request.question, datasetId);
      return { rows, view, reason, questionText: QUESTIONS[request.question], query: QUERY, queryHash: QUERY_HASH,
        hints: HINTS, endpoint: ENDPOINT, graph: GRAPH, source: data.source,
        derivedGraph: await derive(rows), validation: 'Local SHACL profile passed; structural checks only.',
        notice: 'Scripted view selection · prediction data · read-only · no live model' };
    }
  };
}
