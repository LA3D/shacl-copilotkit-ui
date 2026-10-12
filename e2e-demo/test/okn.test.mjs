import test from 'node:test';
import assert from 'node:assert/strict';
import { createOknService, normalize, derive, chooseView, fetchResult, ViewSchema, SNAPSHOT, QUERY, ENDPOINT } from '../server/okn.mjs';
const request = (question = 'compare', source = 'snapshot') => ({ forwardedProps: { question, source } });
const response = (body = SNAPSHOT.result) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/sparql-results+json' } });
const modify = fn => { const result = structuredClone(SNAPSHOT.result); fn(result.results.bindings); return result; };

test('snapshot normalization preserves raw strings, source identities and MTR mapping', async () => {
  const state = await createOknService().run(request());
  assert.equal(state.rows.length, 3); assert.deepEqual(state.rows.map(r => r.depth), [0.276, 0.095, 0.095]);
  assert.equal(state.rows[0].sourceTime, '2024-10-29T08:00:00');
  assert.equal(state.rows[0].sourceDepth, '0.276'); assert.equal(state.rows[0].unitCode, 'MTR');
  assert.equal(state.source.mode, 'snapshot'); assert.equal(state.source.retrievedAt, SNAPSHOT.retrievedAt);
  assert.equal(state.view.kind, 'comparison'); assert.equal(state.view.unit, 'http://qudt.org/vocab/unit/M');
  assert.match(state.derivedGraph, /sosa\/hasFeatureOfInterest/); assert.match(state.derivedGraph, /qudt\/numericValue/);
  assert.match(state.derivedGraph, /prov#wasDerivedFrom/); assert.match(state.derivedGraph, /DerivedPredictionView/);
  assert.doesNotMatch(state.derivedGraph, /sosa\/(resultTime|phenomenonTime|madeBySensor)/);
});
test('changed question and repeated calls select safe views of the same authoritative data', async () => {
  const s = createOknService(); const first = await s.run(request());
  const forged = { ...request('evidence'), state: { rows: [{ depth: 999 }], view: { kind: 'script' } } };
  const second = await s.run(forged); const third = await s.run(request());
  assert.equal(second.view.kind, 'table'); assert.deepEqual(first.rows, second.rows);
  assert.equal(first.view.datasetId, second.view.datasetId); assert.deepEqual(first.view, third.view);
});
test('arbitrary question, endpoint, query and executable view specs are rejected', async () => {
  const s = createOknService();
  for (const props of [{ question: 'run code', source: 'snapshot' }, { question: 'compare', source: 'snapshot', endpoint: 'https://example.org' }, { question: 'compare', source: 'snapshot', query: 'DELETE WHERE {?s ?p ?o}' }]) await assert.rejects(s.run({ forwardedProps: props }));
  const state = await s.run(request());
  assert.equal(ViewSchema.safeParse({ ...state.view, kind: 'script' }).success, false);
  assert.equal(ViewSchema.safeParse({ ...state.view, javascript: 'alert(1)' }).success, false);
});
test('live query is fixed, read-only, bounded and cached across question switches', async () => {
  let calls = 0, clock = 100000;
  const s = createOknService({ now: () => clock, fetchImpl: async (url, options) => {
    calls++; assert.equal(url.origin + url.pathname, ENDPOINT); assert.equal(url.searchParams.get('query'), QUERY);
    assert.match(QUERY, /LIMIT 12/); assert.equal(options.redirect, 'error'); assert.ok(options.signal); return response();
  } });
  assert.equal((await s.run(request('compare', 'live'))).source.mode, 'live');
  await s.run(request('evidence', 'live')); assert.equal(calls, 1);
  clock += 60001; await s.run(request('compare', 'live')); assert.equal(calls, 2);
});
test('concurrent live requests share one bounded fetch', async () => {
  let calls = 0;
  const s = createOknService({ fetchImpl: async () => { calls++; await new Promise(r => setTimeout(r, 10)); return response(); } });
  const results = await Promise.all([s.run(request('compare', 'live')), s.run(request('evidence', 'live'))]);
  assert.equal(calls, 1); assert.deepEqual(results[0].rows, results[1].rows);
});
test('HTTP failure and timeout produce visibly dated fallback, no repeated retry within cache TTL', async () => {
  for (const fetchImpl of [async () => new Response('', { status: 429 }), async () => { throw new DOMException('timeout', 'TimeoutError'); }]) {
    let calls = 0;
    const s = createOknService({ fetchImpl: async (...args) => { calls++; return fetchImpl(...args); } });
    const state = await s.run(request('compare', 'live'));
    assert.equal(state.source.mode, 'fallback'); assert.ok(state.source.problem); assert.equal(state.source.retrievedAt, SNAPSHOT.retrievedAt);
    await s.run(request('evidence', 'live')); assert.equal(calls, 1);
  }
});
test('empty live results stay empty and do not silently substitute snapshot', async () => {
  const s = createOknService({ fetchImpl: async () => response(modify(rows => rows.splice(0))) });
  const state = await s.run(request('compare', 'live'));
  assert.equal(state.source.mode, 'live'); assert.equal(state.rows.length, 0); assert.equal(state.view.kind, 'table');
  assert.match(state.reason, /No matching results/);
});
test('malformed, oversized and unsupported-unit results are rejected or clearly fall back', async () => {
  for (const bad of [modify(rows => { rows[0].unitCode.value = 'FT'; }), modify(rows => { rows[0].depth.value = 'NaN'; }), modify(rows => { rows.push(...Array(15).fill(rows[0])); })]) {
    assert.throws(() => normalize(bad));
    const state = await createOknService({ fetchImpl: async () => response(bad) }).run(request('compare', 'live'));
    assert.equal(state.source.mode, 'fallback');
  }
  await assert.rejects(fetchResult(async () => new Response('x'.repeat(128001))), /128 kB/);
});
test('repeated bindings deduplicate, conflicting values and multiple times use evidence table', () => {
  const duplicate = normalize(modify(rows => rows.push(rows[0]))); assert.equal(duplicate.length, 3);
  for (const changed of [modify(rows => { rows[0].time.value = '2024-10-29T09:00:00'; }), modify(rows => { const extra = structuredClone(rows[0]); extra.depth.value = '0.5'; rows.push(extra); })]) {
    const selected = chooseView(normalize(changed), 'compare', 'a'.repeat(64));
    assert.equal(selected.view.kind, 'table'); assert.match(selected.reason, /do not aggregate/);
  }
});
test('local SHACL profile rejects a malformed derived quantity', async () => {
  const rows = normalize(SNAPSHOT.result); rows[0].sourceDepth = '-1';
  await assert.rejects(derive(rows), /SHACL/);
});
