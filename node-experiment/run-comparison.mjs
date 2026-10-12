import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import toNT from '@rdfjs/to-ntriples'
import { datasetEqual } from 'rdf-test/assert.js'
import Engine from './upstream/shacl-engine-1d111fc772a71ec2118eed2974709c2b04f47510/Engine.js'
import Test from './upstream/shacl-engine-1d111fc772a71ec2118eed2974709c2b04f47510/test/support/Test.js'
import rdf from './upstream/shacl-engine-1d111fc772a71ec2118eed2974709c2b04f47510/test/support/factory.js'
import { parseString, normalizeReport } from './upstream/shacl-engine-1d111fc772a71ec2118eed2974709c2b04f47510/test/support/utils.js'

const ENGINE = '1d111fc772a71ec2118eed2974709c2b04f47510'
const W3C = '4f88f8c5398a87f7957260593f1f0742b5924a65'
const base = new URL('./', import.meta.url)
const out = new URL('./results/', base)
await fs.mkdir(out, { recursive: true })
const SH = 'http://www.w3.org/ns/shacl#'
const EX = 'https://example.org/node-canary/'
const prefixes = `@prefix ex: <${EX}> .
@prefix sh: <${SH}> .
@prefix shnex: <http://www.w3.org/ns/shacl-node-expr#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n`
const parse = text => parseString('text/turtle', prefixes + text)
const cases = []
const hashes = {}

function term(t) {
  if (!t) return null
  if (t.termType === 'Literal') return { kind: 'literal', value: t.value, datatype: t.datatype.value, language: t.language }
  return { kind: t.termType, value: t.value }
}
function project(report) {
  return report.results.map(r => ({
    focus: r.focusNode.terms.map(term), sourceShape: r.shape.ptr.terms.map(term),
    constraint: r.constraintComponent.value, severity: r.severity.value,
    value: r.value?.terms.map(term) ?? [],
    path: r.path?.map(p => ({ start: p.start, end: p.end, quantifier: p.quantifier, predicates: p.predicates.map(term) })),
    messages: r.message.map(m => m.value)
  }))
}
async function saveReport(id, report) {
  await fs.writeFile(new URL(id + '.nt', out), toNT(report.dataset))
}
function record(row) {
  cases.push(row)
  console.log(`${row.status.padEnd(11)} ${row.id}${row.error ? ': ' + row.error.split('\n')[0] : ''}`)
}
async function custom(id, feature, shapes, data, expected, options = {}) {
  const row = { id, feature, source: 'custom canary', expectedConforms: expected }
  let reachedValidation = false
  let returnedReport = false
  try {
    const shapeGraph = typeof shapes === 'string' ? await parse(shapes) : shapes
    const dataGraph = typeof data === 'string' ? await parse(data) : data
    await fs.writeFile(new URL(id + '-shapes.nt', out), toNT(shapeGraph))
    await fs.writeFile(new URL(id + '-data.nt', out), toNT(dataGraph))
    const engine = options.engine ?? new Engine(shapeGraph, { factory: rdf })
    reachedValidation = true
    const report = await engine.validate({ dataset: dataGraph })
    returnedReport = true
    row.rawConforms = report.conforms
    row.results = project(report)
    row.resultCount = row.results.length
    await saveReport(id, report)
    if (options.expectError) {
      throw new Error('Expected rejection of unknown expression, but validation returned a report')
    } else if (options.unsupported) {
      row.status = 'unsupported'
      row.explanation = 'Unknown constraint is ignored by engine; raw conformance is not support. Application capability guard must reject this profile.'
      assert.equal(report.conforms, true)
    } else {
      assert.equal(report.conforms, expected)
      if (options.component) assert(row.results.some(r => r.constraint === SH + options.component))
      if (options.check) await options.check(report)
      row.status = 'passed'
    }
  } catch (error) {
    const explicitlyRejected = options.expectError && reachedValidation && !returnedReport && /Unable to compile node expression/.test(error.message)
    row.status = explicitlyRejected ? 'unsupported' : 'failed'
    row.error = error.stack
    row.explanation = explicitlyRejected ? 'Engine explicitly rejected this unsupported expression; not a conforms result.' : undefined
  }
  record(row)
  return row
}

// Exactly the requested new W3C corpus. No vendored old corpus is substituted.
const selected = [
  'core/property/singleLine-001.ttl', 'core/property/rootClass-001.ttl',
  'core/property/subsetOf-001.ttl', 'core/property/subsetOf-002.ttl',
  'core/node/closed-001.ttl', 'core/node/closed-002.ttl',
  'core/node/closed-003.ttl', 'core/node/closed-004.ttl',
  'core/property/in-001.ttl'
]
for (const file of selected) {
  const url = new URL(`./upstream/data-shapes-${W3C}/shacl12-test-suite/tests/${file}`, base)
  const bytes = await fs.readFile(url)
  hashes[file] = createHash('sha256').update(bytes).digest('hex')
  const tests = await Test.loadTests(url)
  for (const t of tests) {
    const id = 'w3c-' + file.replaceAll('/', '-').replace('.ttl', '')
    const row = { id, feature: file.split('/').at(-1), source: file, assertion: 'Full expected report graph, normalized using upstream harness, compared by RDF isomorphism' }
    try {
      const engine = new Engine(t.shapes, { factory: rdf, ...t.options })
      const report = await engine.validate({ dataset: t.data })
      row.rawConforms = report.conforms
      row.resultCount = report.results.length
      row.results = project(report)
      await saveReport(id, report)
      const expected = normalizeReport(report, t.result)
      datasetEqual(report.dataset, expected)
      row.status = 'passed'
    } catch (error) {
      row.status = 'failed'
      row.error = error.stack
    }
    record(row)
  }
}

// No RDF parser ambiguity for control characters: serialize each literal explicitly.
for (const enabled of [true, false]) {
  for (const [name, value] of [['plain', 'one line'], ['LF', 'a\nb'], ['CR', 'a\rb'], ['FF', 'a\fb'], ['VT', 'a\vb'], ['trailing-LF', 'a\n'], ['trailing-CR', 'a\r'], ['trailing-FF', 'a\f'], ['trailing-VT', 'a\v']]) {
    await custom(`singleLine-${enabled}-${name}`, 'singleLine',
      `ex:S a sh:NodeShape ; sh:targetNode ex:n ; sh:property ex:P . ex:P sh:path ex:p ; sh:singleLine ${enabled} .`,
      `ex:n ex:p ${toNT(rdf.literal(value))} .`, !enabled || name === 'plain',
      enabled && name !== 'plain' ? { component: 'SingleLineConstraintComponent' } : {})
  }
}

const rootShape = `ex:S a sh:NodeShape ; sh:targetNode ex:n ; sh:property ex:P . ex:P sh:path ex:p ; sh:rootClass ex:Root .`
const hierarchy = `ex:Child rdfs:subClassOf ex:Root . ex:Grandchild rdfs:subClassOf ex:Child .`
for (const [name, value, expected] of [['root', 'Root', true], ['transitive', 'Grandchild', true], ['unrelated', 'Other', false]]) {
  await custom('rootClass-' + name, 'rootClass', rootShape, hierarchy + `ex:n ex:p ex:${value} .`, expected,
    expected ? {} : { component: 'RootClassConstraintComponent' })
}
await custom('rootClass-hierarchy-both', 'rootClass graph placement', rootShape + hierarchy,
  hierarchy + 'ex:n ex:p ex:Grandchild .', true)
await custom('rootClass-hierarchy-shapes-only', 'rootClass graph placement', rootShape + hierarchy,
  'ex:n ex:p ex:Grandchild .', false, { component: 'RootClassConstraintComponent' })

for (const [name, relation, dataValid, dataInvalid] of [
  ['predicate', 'ex:q', 'ex:n ex:p "A" ; ex:q "A", "B" .', 'ex:n ex:p "Z" ; ex:q "A" .'],
  ['sequence', '(ex:link ex:q)', 'ex:n ex:p "A" ; ex:link ex:ref . ex:ref ex:q "A" .', 'ex:n ex:p "Z" ; ex:link ex:ref . ex:ref ex:q "A" .'],
  ['inverse', '[sh:inversePath ex:back]', 'ex:n ex:p ex:a . ex:a ex:back ex:n .', 'ex:n ex:p ex:a . ex:b ex:back ex:n .']
]) {
  const shape = `ex:S a sh:NodeShape ; sh:targetNode ex:n ; sh:property ex:P . ex:P sh:path ex:p ; sh:subsetOf ${relation} .`
  await custom('subsetOf-' + name + '-valid', 'subsetOf/path', shape, dataValid, true)
  await custom('subsetOf-' + name + '-invalid', 'subsetOf/path', shape, dataInvalid, false, { component: 'SubsetOfConstraintComponent' })
}

const closedShapes = `ex:S a sh:NodeShape ; sh:targetNode ex:n ; sh:closed sh:ByTypes .
ex:Root a rdfs:Class, sh:NodeShape ; sh:property [ sh:path ex:p ] .
ex:Child a rdfs:Class, sh:NodeShape ; sh:property [ sh:path ex:q ] .
ex:Target a sh:NodeShape ; sh:targetClass ex:Child ; sh:node ex:Inherited .
ex:Inherited a sh:NodeShape ; sh:property [ sh:path ex:r ] .`
await custom('ByTypes-inheritance-valid', 'closed ByTypes/inheritance', closedShapes,
  'ex:Child rdfs:subClassOf ex:Root . ex:n a ex:Child ; ex:p 1 ; ex:q 2 ; ex:r 3 .', true)
await custom('ByTypes-inheritance-invalid', 'closed ByTypes/inheritance', closedShapes,
  'ex:Child rdfs:subClassOf ex:Root . ex:n a ex:Child ; ex:p 1 ; ex:q 2 ; ex:r 3 ; ex:extra 4 .', false, { component: 'ClosedConstraintComponent' })

const dynamicShapes = await parse(`ex:S a sh:NodeShape ; sh:targetNode ex:n ; sh:property ex:P .
ex:P sh:path ex:choice ; sh:minCount 1 ; sh:in [ shnex:pathValues ex:allowed ; shnex:focusNode ex:catalog ] .`)
const dynamicEngine = new Engine(dynamicShapes, { factory: rdf })
for (const [name, data, expected] of [
  ['A-allowed', 'ex:n ex:choice ex:A . ex:catalog ex:allowed ex:A .', true],
  ['catalog-now-B', 'ex:n ex:choice ex:A . ex:catalog ex:allowed ex:B .', false],
  ['choose-B', 'ex:n ex:choice ex:B . ex:catalog ex:allowed ex:B .', true],
  ['catalog-empty', 'ex:n ex:choice ex:B .', false],
  ['catalog-restored', 'ex:n ex:choice ex:A . ex:catalog ex:allowed ex:A .', true]
]) {
  await custom('dynamic-in-' + name, 'dynamic sh:in', dynamicShapes, data, expected,
    { engine: dynamicEngine, ...(expected ? {} : { component: 'InConstraintComponent' }) })
}

await custom('unknown-constraint', 'unknown constraint',
  'ex:S a sh:NodeShape ; sh:targetNode ex:n ; sh:property [ sh:path ex:p ; sh:nonexistentConstraint true ] .',
  'ex:n ex:p "invalid-by-intent" .', null, { unsupported: true })
await custom('unknown-node-expression', 'unknown expression',
  'ex:S a sh:NodeShape ; sh:targetNode ex:n ; sh:property [ sh:path ex:p ; sh:in [ shnex:nonexistentFunction true ] ] .',
  'ex:n ex:p "A" .', null, { expectError: true })

// Reuse the original synthetic form graph without modifying its files.
const originalBaseURL = new URL('../fixture/base.ttl', base)
const originalShapeURL = new URL('../fixture/shapes.ttl', base)
const originalBytes = await fs.readFile(originalBaseURL)
const originalData = await parseString('text/turtle', originalBytes.toString())
const originalShapes = await parseString('text/turtle', await fs.readFile(originalShapeURL, 'utf8'))
const focus = rdf.namedNode('https://example.org/shui-demo/record-001')
const count = rdf.namedNode('https://example.org/shui-demo/count')
const xsdInteger = rdf.namedNode('http://www.w3.org/2001/XMLSchema#integer')
function candidate(value) {
  const ds = rdf.dataset([...originalData].filter(q => !(q.subject.equals(focus) && q.predicate.equals(count))))
  ds.add(rdf.quad(focus, count, rdf.literal(value, xsdInteger)))
  return ds
}
await custom('candidate-base', 'candidate graph', originalShapes, originalData, true)
await custom('candidate-invalid', 'candidate graph', originalShapes, candidate('11'), false, {
  component: 'MaxInclusiveConstraintComponent',
  check: report => {
    const r = project(report)[0]
    assert.equal(r.focus[0].value, focus.value)
    assert.equal(r.sourceShape[0].value, 'https://example.org/shui-demo/CountShape')
    assert.equal(r.path[0].predicates[0].value, count.value)
  }
})
await custom('candidate-corrected', 'candidate graph', originalShapes, candidate('8'), true)
const offForm = rdf.dataset([...candidate('8')].filter(q => q.subject.value !== 'https://example.org/shui-demo/note-001' || q.predicate.value !== 'https://example.org/shui-demo/title'))
await custom('candidate-off-form-invalid', 'candidate graph', originalShapes, offForm, false, { component: 'MinCountConstraintComponent' })

try {
  const encode = t => term(t)
  const decode = t => t.kind === 'NamedNode' ? rdf.namedNode(t.value) : rdf.literal(t.value, t.language || rdf.namedNode(t.datatype))
  for (const q of originalData) assert(decode(JSON.parse(JSON.stringify(encode(q.object)))).equals(q.object))
  const originalCount = [...originalData.match(focus, count)][0].object
  assert.equal(originalCount.value, '007')
  const nt = toNT(originalData)
  const reparsed = await parseString('text/turtle', nt)
  datasetEqual(originalData, reparsed)
  assert.equal([...reparsed.match(focus, count)][0].object.value, '007')
  assert.equal([...originalData.match(focus, rdf.namedNode('https://example.org/shui-demo/source'))].length, 2)
  assert.deepEqual([...originalData.match(focus, rdf.namedNode('https://example.org/shui-demo/title'))].map(q => q.object.language).sort(), ['en', 'fr'])
  assert(originalBytes.equals(await fs.readFile(originalBaseURL)))
  await fs.writeFile(new URL('rdf-preservation-roundtrip.nt', out), nt)
  record({ id: 'rdf-preservation', feature: 'RDF preservation', status: 'passed', checks: ['lexical 007', 'datatype', 'language', 'multivalue IRIs', 'JSON term roundtrip', 'N-Triples graph roundtrip', 'base file unchanged'], limitation: 'No Node JSON-LD library roundtrip executed' })
} catch (error) { record({ id: 'rdf-preservation', feature: 'RDF preservation', status: 'failed', error: error.stack }) }

const summary = { generatedAt: new Date().toISOString(), engineCommit: ENGINE, declaredEnginePackageVersion: '1.0.2', w3cCommit: W3C,
  node: process.version, platform: process.platform, arch: process.arch,
  totals: { passed: cases.filter(c => c.status === 'passed').length, failed: cases.filter(c => c.status === 'failed').length, unsupported: cases.filter(c => c.status === 'unsupported').length },
  fixtureHashes: hashes, cases }
await fs.writeFile(new URL('results.json', out), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary.totals))
process.exitCode = summary.totals.failed ? 1 : 0
