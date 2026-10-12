import test from 'node:test';
import assert from 'node:assert/strict';
import { createOknService, normalize, derive, fetchResult, ViewSchema, SNAPSHOT, QUERY, ENDPOINT } from '../server/okn.mjs';
import { PRESENTATIONS, compilePresentation, present, UI, SHUI, DASH, CHART, TABLE } from '../server/okn-presentation.mjs';
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
test('repeated bindings deduplicate, conflicting values and multiple times use evidence table', async () => {
  const duplicate = normalize(modify(rows => rows.push(rows[0]))); assert.equal(duplicate.length, 3);
  for (const changed of [modify(rows => { rows[0].time.value = '2024-10-29T09:00:00'; }), modify(rows => { const extra = structuredClone(rows[0]); extra.depth.value = '0.5'; rows.push(extra); })]) {
    const selected = present(await derive(normalize(changed), true), PRESENTATIONS.chart, 'compare', 'a'.repeat(64));
    assert.equal(selected.view.kind, 'table'); assert.match(selected.reason, /do not aggregate/);
  }
});
test('local SHACL profile rejects a malformed derived quantity', async () => {
  const rows = normalize(SNAPSHOT.result); rows[0].sourceDepth = '-1';
  await assert.rejects(derive(rows), /SHACL/);
});

test('only an RDF viewer triple changes: same query, question, rows and graph select another registered view', async () => {
  const service=createOknService();
  const a=await service.run(request());
  const b=await service.run({forwardedProps:{...request().forwardedProps,profile:'table'}});
  assert.equal(a.view.question,b.view.question); assert.equal(a.query,b.query);
  assert.deepEqual(a.rows,b.rows); assert.equal(a.derivedGraph,b.derivedGraph);
  assert.equal(a.view.datasetId,b.view.datasetId); assert.notEqual(a.view.profileHash,b.view.profileHash);
  assert.equal(a.view.viewer,CHART); assert.equal(b.view.viewer,TABLE);
  assert.deepEqual(a.records,b.records); assert.deepEqual(a.view.columns,b.view.columns);
  assert.equal(PRESENTATIONS.chart.turtle.replace('ui:Compare shui:viewer ui:ComparisonViewer','ui:Compare shui:viewer shui:ValueTableViewer'),PRESENTATIONS.table.turtle);
});
test('RDF labels, column order, paths and chart mappings are interpreted rather than decorative', async () => {
  const original=PRESENTATIONS.chart.turtle;
  const changed=original.replace('sh:name "Feature" ; sh:order 1','sh:name "Feature identity" ; sh:order 6').replaceAll('ui:category ui:Feature','ui:category ui:Source');
  const profile=await compilePresentation(changed);
  const graph=await derive(normalize(SNAPSHOT.result),true);
  const selected=present(graph,profile,'compare','a'.repeat(64));
  assert.equal(selected.view.columns.at(-1).label,'Feature identity');
  assert.equal(selected.view.mappings.category,UI+'Source');
  assert.match(selected.records[0][selected.view.mappings.category].value,/uri:WEN/);
  const swap=await compilePresentation(original.replace('sh:path sosa:hasFeatureOfInterest','sh:path prov:wasDerivedFrom'));
  assert.match(present(graph,swap,'compare','a'.repeat(64)).records[0][UI+'Feature'].value,/uri:WEN/);
});
test('bounded DASH viewer compatibility maps verified table, lexical and URI viewers', async () => {
  const turtle=PRESENTATIONS.table.turtle.replaceAll('shui:viewer','<'+DASH+'viewer>').replaceAll('shui:ValueTableViewer','<'+DASH+'ValueTableViewer>').replaceAll('shui:LiteralViewer','<'+DASH+'LiteralViewer>').replaceAll('shui:IRIViewer','<'+DASH+'URIViewer>');
  const profile=await compilePresentation(turtle);
  const result=present(await derive(normalize(SNAPSHOT.result),true),profile,'compare','a'.repeat(64));
  assert.equal(result.view.viewer,TABLE); assert.equal(result.view.declaredViewer,DASH+'ValueTableViewer');
  assert.equal(result.view.columns[0].viewer,SHUI+'IRIViewer');
});
test('unsupported, conflicting, misplaced and absent RDF hints are rejected before rendering', async () => {
  const t=PRESENTATIONS.chart.turtle;
  for(const bad of [t.replace('ui:ComparisonViewer','ui:ExecutableViewer'),
    t+'\nui:Compare shui:viewer shui:ValueTableViewer .',
    t+'\nui:Compare <'+DASH+'viewer> <'+DASH+'ValueTableViewer> .',
    t+'\nui:Compare ui:javascript "alert(1)" .',
    t.replace('ui:forIntent ui:evidence','ui:forIntent ui:compare'),
    t.replaceAll('ui:measure ui:Depth','ui:measure ui:Missing'),
    t.replaceAll('ui:measure ui:Depth','ui:measure ui:Feature'),
    t.replaceAll('ui:fallbackViewer shui:ValueTableViewer','ui:fallbackViewer ui:ComparisonViewer'),
    t.replace('ui:Compare shui:viewer ui:ComparisonViewer .',''),
    t+'\nui:Typo shui:viewer shui:ValueTableViewer .',
    t+'\nui:Feature ui:measure ui:Depth .']) await assert.rejects(compilePresentation(bad));
});
test('invalid profile and injected client RDF cannot change authoritative descriptors', async () => {
  const service=createOknService();
  await assert.rejects(service.run({forwardedProps:{...request().forwardedProps,profile:'remote'}}));
  await assert.rejects(service.run({forwardedProps:{...request().forwardedProps,hints:'execute'}}));
  const valid=await service.run({...request(),state:{hints:'execute',records:[],view:{viewer:'script'}}});
  assert.equal(valid.view.viewer,CHART);
});
test('data/view mismatches fail closed; unsuitable chart mappings use the RDF fallback', async () => {
  const graph=await derive(normalize(SNAPSHOT.result),true), t=PRESENTATIONS.chart.turtle;
  const badViewer=await compilePresentation(t.replace('sh:order 3 ; shui:viewer shui:LiteralViewer','sh:order 3 ; shui:viewer shui:IRIViewer'));
  assert.throws(()=>present(graph,badViewer,'compare','a'.repeat(64)),/incompatible/);
  const missing=await compilePresentation(t.replace('sh:path sosa:hasFeatureOfInterest','sh:path ui:absent'));
  assert.throws(()=>present(graph,missing,'compare','a'.repeat(64)),/exactly one/);
  const badMeasure=await compilePresentation(t.replaceAll('ui:measure ui:Depth ; ui:unit ui:Unit ; ui:time ui:Time','ui:measure ui:Time ; ui:unit ui:Unit ; ui:time ui:Depth'));
  const safe=present(graph,badMeasure,'compare','a'.repeat(64));
  assert.equal(safe.view.viewer,TABLE); assert.match(safe.reason,/suitability failed/);
});
