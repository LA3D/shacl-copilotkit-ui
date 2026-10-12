import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import Environment from '@rdfjs/environment';
import DataModelFactory from '@rdfjs/data-model/Factory.js';
import DatasetFactory from '@rdfjs/dataset/Factory.js';
import TermSetFactory from '@rdfjs/term-set/Factory.js';
import GrapoiFactory from 'grapoi/Factory.js';
import ParserN3 from '@rdfjs/parser-n3';
import toNT from '@rdfjs/to-ntriples';
import { Engine } from 'shacl-engine';

export const EX = 'https://example.org/shui-demo/';
export const SH = 'http://www.w3.org/ns/shacl#';
const SHUI = 'http://www.w3.org/ns/shacl-ui#';
const NEX = 'http://www.w3.org/ns/shacl-node-expr#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
export const XSD = 'http://www.w3.org/2001/XMLSchema#';
export const factory = new Environment([DataModelFactory, DatasetFactory, TermSetFactory, GrapoiFactory]);
export const named = iri => factory.namedNode(iri);
export const encode = t => t.termType === 'NamedNode' ? { kind: 'iri', value: t.value }
  : { kind: 'literal', value: t.value, datatype: t.datatype.value, language: t.language };
export const decode = t => t.kind === 'iri' ? named(t.value) : factory.literal(t.value, t.language || named(t.datatype));
export const serialize = ds => toNT(ds);
export async function parse(text) {
  const quads = [];
  for await (const q of new ParserN3().import(Readable.from([text]))) quads.push(q);
  return factory.dataset(quads);
}
const objects = (ds, s, p) => [...ds.match(typeof s === 'string' ? named(s) : s, named(p))].map(q => q.object);
function one(ds, s, p, required = true) {
  const values = objects(ds, s, p);
  if (values.length > 1 || (required && !values.length)) throw new Error(`Unsupported profile cardinality: ${p}`);
  return values[0];
}
function list(ds, head) {
  const out = [], seen = new Set();
  while (head.value !== RDF + 'nil') {
    if (seen.has(head.value) || out.length > 20) throw new Error('Unsupported cyclic/large RDF list');
    seen.add(head.value); out.push(one(ds, head, RDF + 'first')); head = one(ds, head, RDF + 'rest');
  }
  return out;
}
export function compileDescriptor(ds) {
  const predicates = new Set([
    RDF + 'type', RDF + 'first', RDF + 'rest', RDFS + 'label',
    ...['targetNode', 'property', 'path', 'name', 'description', 'datatype', 'nodeKind', 'minCount', 'maxCount',
      'minLength', 'maxLength', 'singleLine', 'group', 'order', 'in', 'intent', 'agentInstruction'].map(x => SH + x),
    SHUI + 'editor', SHUI + 'propertyRole', NEX + 'pathValues', NEX + 'focusNode'
  ]);
  for (const q of ds) if (!predicates.has(q.predicate.value)) {
    throw new Error(`Unsupported profile predicate: ${q.predicate.value}${q.predicate.value === SH + 'rootClass' ? ' (excluded: known graph-scope defect)' : ''}`);
  }
  const root = EX + 'RecordShape';
  if (one(ds, root, SH + 'targetNode').value !== EX + 'record-001') throw new Error('Unsupported focus node');
  const label = iri => one(ds, iri, RDFS + 'label', false)?.value ?? iri.slice(iri.lastIndexOf('/') + 1);
  const fields = objects(ds, root, SH + 'property').map(shape => {
    if (shape.termType !== 'NamedNode') throw new Error('Property shape must have a stable IRI');
    const path = one(ds, shape, SH + 'path');
    if (path.termType !== 'NamedNode') throw new Error('Editable property paths must be direct predicates');
    const editor = one(ds, shape, SHUI + 'editor').value;
    if (![SHUI + 'TextFieldEditor', SHUI + 'EnumSelectEditor'].includes(editor)) throw new Error('Unsupported editor');
    const minCount = Number(one(ds, shape, SH + 'minCount').value);
    const maxCount = Number(one(ds, shape, SH + 'maxCount').value);
    if (minCount !== 1 || maxCount !== 1) throw new Error('Demo fields require one value');
    const datatype = one(ds, shape, SH + 'datatype', false)?.value;
    const nodeKind = one(ds, shape, SH + 'nodeKind', false)?.value;
    if (datatype !== XSD + 'string' && nodeKind !== SH + 'IRI') throw new Error('Unsupported field value type');
    const group = one(ds, shape, SH + 'group');
    const field = { id: shape.value, path: path.value, label: one(ds, shape, SH + 'name').value,
      description: one(ds, shape, SH + 'description').value, group: label(group.value),
      order: Number(one(ds, shape, SH + 'order').value), editor, datatype: datatype ?? null,
      role: one(ds, shape, SHUI + 'propertyRole', false)?.value ?? null, required: true,
      options: [], dependsOn: null, optionPredicate: null };
    const enumeration = one(ds, shape, SH + 'in', false);
    if (enumeration) {
      const expression = one(ds, enumeration, NEX + 'pathValues', false);
      if (expression) {
        const focus = one(ds, enumeration, NEX + 'focusNode');
        const dependsOn = one(ds, focus, NEX + 'pathValues');
        if (expression.value !== EX + 'allowed' || dependsOn.value !== EX + 'status' || objects(ds, focus, NEX + 'focusNode').length) throw new Error('Unsupported dynamic expression');
        field.dependsOn = dependsOn.value; field.optionPredicate = expression.value;
      } else field.options = list(ds, enumeration).map(t => ({ value: t.value, label: label(t.value) }));
    }
    return field;
  }).sort((a, b) => a.order - b.order);
  if (fields.length !== 3 || new Set(fields.map(f => f.path)).size !== 3) throw new Error('Unsupported field set');
  return { id: root, focus: EX + 'record-001', profile: 'SHUI FPWD 2026-05-26 · bounded demo', fields };
}
export async function loadProfile() {
  const shapes = await parse(await fs.readFile(new URL('../shapes/record.ttl', import.meta.url), 'utf8'));
  const base = await parse(await fs.readFile(new URL('../shapes/base.ttl', import.meta.url), 'utf8'));
  const descriptor = compileDescriptor(shapes);
  return { shapes, base, descriptor, engine: new Engine(shapes, { factory }) };
}
export function draftFromGraph(profile, graph) {
  return Object.fromEntries(profile.descriptor.fields.map(f => [f.path, objects(graph, profile.descriptor.focus, f.path).map(encode)]));
}
export function assertDraft(profile, draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw new Error('Draft must be an RDF field map');
  const paths = profile.descriptor.fields.map(f => f.path);
  if (Object.keys(draft).length !== paths.length || Object.keys(draft).some(p => !paths.includes(p))) throw new Error('Unauthorized or missing draft property');
  for (const values of Object.values(draft)) {
    if (!Array.isArray(values) || values.length > 8) throw new Error('Invalid RDF value array');
    for (const t of values) {
      if (!t || typeof t.value !== 'string' || t.value.length > 1000) throw new Error('Invalid RDF term');
      const allowed = t.kind === 'iri' ? ['kind', 'value'] : ['kind', 'value', 'datatype', 'language'];
      if (Object.keys(t).some(k => !allowed.includes(k))) throw new Error('Unknown RDF term property');
      if (t.kind === 'iri') { if (!/^https:\/\//.test(t.value)) throw new Error('Demo IRIs must be absolute HTTPS IRIs'); }
      else if (t.kind !== 'literal' || t.datatype !== XSD + 'string' || t.language !== '') throw new Error('Unsupported editable RDF literal');
    }
  }
}
export function candidateGraph(profile, base, draft) {
  assertDraft(profile, draft);
  const paths = new Set(profile.descriptor.fields.map(f => f.path));
  const graph = factory.dataset([...base].filter(q => q.subject.value !== profile.descriptor.focus || !paths.has(q.predicate.value)));
  for (const [path, terms] of Object.entries(draft)) for (const term of terms) graph.add(factory.quad(named(profile.descriptor.focus), named(path), decode(term)));
  return graph;
}
export function catalog(revision) {
  const values = revision % 2 ? { planned: ['phone', 'visit'], active: ['video', 'message'] }
    : { planned: ['video'], active: ['message'] };
  const labels = { phone: 'Phone', visit: 'In person', video: 'Video call', message: 'Secure message' };
  return Object.fromEntries(Object.entries(values).map(([status, options]) => [EX + status, options.map(v => ({ value: EX + v, label: labels[v] }))]));
}
export async function validate(profile, base, draft, catalogRevision) {
  const candidate = candidateGraph(profile, base, draft);
  const graph = factory.dataset([...candidate]);
  for (const [status, options] of Object.entries(catalog(catalogRevision))) for (const option of options) graph.add(factory.quad(named(status), named(EX + 'allowed'), named(option.value)));
  const report = await profile.engine.validate({ dataset: graph });
  const errors = report.results.map(r => {
    const sourceShape = r.shape.ptr.term.value;
    const field = profile.descriptor.fields.find(f => f.id === sourceShape);
    const component = r.constraintComponent.value;
    const message = component.endsWith('MinCountConstraintComponent') ? `${field?.label ?? 'Value'} is required.`
      : component.endsWith('InConstraintComponent') ? 'Choose a currently available option.'
      : component.endsWith('SingleLineConstraintComponent') ? 'Use a single line.'
      : component.endsWith('MaxLengthConstraintComponent') ? 'Use 120 characters or fewer.'
      : component.endsWith('MaxCountConstraintComponent') ? 'Only one value is allowed.' : 'This value does not satisfy the shape.';
    return { focus: r.focusNode.term.value, sourceShape, path: field?.path ?? null, component, message };
  });
  return { candidate, validation: { conforms: report.conforms, errors, report: serialize(report.dataset) } };
}
