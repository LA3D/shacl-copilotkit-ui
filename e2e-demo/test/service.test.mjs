import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadProfile, parse, compileDescriptor, EX, SH, XSD, serialize } from '../server/rdf.mjs';
import { createService } from '../server/service.mjs';

const profile = await loadProfile();
const title = value => [{ kind: 'literal', value, datatype: XSD + 'string', language: '' }];
async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shui-demo-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = path.join(dir, 'store.json');
  const service = await createService(profile, store);
  const run = (command, state, extra = {}) => service.run({ state, forwardedProps: { command, ...extra } }, 'test-thread');
  return { service, run, store, initial: service.bootstrap() };
}
test('trusted shape generates ordered approved fields, stable IRIs and label role', () => {
  assert.deepEqual(profile.descriptor.fields.map(f => f.label), ['Title', 'Status', 'Contact method']);
  assert.equal(profile.descriptor.fields[2].dependsOn, EX + 'status');
  assert.equal(profile.descriptor.fields[0].role, 'http://www.w3.org/ns/shacl-ui#LabelRole');
});
test('unsupported predicate and known rootClass defect are rejected before validation', async () => {
  for (const predicate of ['unknownConstraint', 'rootClass']) {
    const shape = await parse(serialize(profile.shapes) + `<${EX}TitleShape> <${SH}${predicate}> <${EX}Something> .`);
    assert.throws(() => compileDescriptor(shape), /Unsupported profile predicate/);
  }
});
test('unknown editor and complex editable paths are explicitly rejected', async () => {
  const ttl = await fs.readFile(new URL('../shapes/record.ttl', import.meta.url), 'utf8');
  const badEditor = await parse(ttl.replace('shui:TextFieldEditor', 'shui:UntrustedEditor'));
  assert.throws(() => compileDescriptor(badEditor), /Unsupported editor/);
  const complexPath = await parse(ttl.replace('sh:path ex:title', 'sh:path (ex:title ex:label)'));
  assert.throws(() => compileDescriptor(complexPath), /direct predicates/);
});
test('required title returns field-level report with focus, path and shape', async t => {
  const { run, initial, service } = await setup(t);
  initial.draft[EX + 'title'] = [];
  const result = await run('review', initial);
  assert.equal(result.validation.conforms, false); assert.equal(result.review, null);
  assert.deepEqual(result.validation.errors[0], { focus: EX + 'record-001', sourceShape: EX + 'TitleShape', path: EX + 'title', component: SH + 'MinCountConstraintComponent', message: 'Title is required.' });
  assert.equal(service.inspect().saveCount, 0);
});
test('singleLine and maxCount are enforced on untrusted candidates', async t => {
  const { run, initial } = await setup(t);
  initial.draft[EX + 'title'] = title('a\nb');
  assert((await run('validate', initial)).validation.errors.some(e => e.component.endsWith('SingleLineConstraintComponent')));
  initial.draft[EX + 'title'] = [...title('A'), ...title('B')];
  assert((await run('validate', initial)).validation.errors.some(e => e.component.endsWith('MaxCountConstraintComponent')));
});
test('status and server catalog changes invalidate stale dependent options', async t => {
  const { run, initial } = await setup(t);
  const changed = await run('catalog', initial);
  assert.equal(changed.catalogRevision, 2); assert.equal(changed.validation.conforms, false);
  changed.draft[EX + 'channel'] = [{ kind: 'iri', value: EX + 'video' }];
  assert.equal((await run('validate', changed)).validation.conforms, true);
  changed.draft[EX + 'status'] = [{ kind: 'iri', value: EX + 'active' }];
  assert.equal((await run('validate', changed)).validation.conforms, false);
});
test('proposal, human correction, review, fresh validation, atomic save and restart preserve RDF', async t => {
  const { run, initial, service, store } = await setup(t);
  const proposed = await run('propose', initial);
  assert.equal(service.inspect().saveCount, 0);
  proposed.draft[EX + 'title'] = title('Human-reviewed visit');
  const reviewed = await run('review', proposed);
  const saved = await run('save', reviewed, { reviewId: reviewed.review.id, actionId: 'save-once' });
  assert.equal(saved.recordRevision, 2); assert.equal(saved.saveCount, 1);
  assert.equal(saved.draft[EX + 'title'][0].value, 'Human-reviewed visit');
  const nt = service.inspect().ntriples;
  assert(nt.includes('"007"^^<http://www.w3.org/2001/XMLSchema#integer>'));
  assert(nt.includes('"Synthetic record"@en')); assert(nt.includes('"Dossier fictif"@fr'));
  assert(nt.includes('<https://example.org/shui-demo/source-A>')); assert(nt.includes('<https://example.org/shui-demo/source-B>'));
  const reloaded = await createService(profile, store);
  assert.equal(reloaded.bootstrap().recordRevision, 2);
  assert.deepEqual(reloaded.bootstrap().draft, saved.draft);
});
test('repeated save action is idempotent, including after service restart', async t => {
  const { run, initial, service, store } = await setup(t);
  const reviewed = await run('review', initial);
  const extras = { reviewId: reviewed.review.id, actionId: 'repeat' };
  await run('save', reviewed, extras); const replay = await run('save', reviewed, extras);
  assert.match(replay.notice, /already applied/); assert.equal(service.inspect().saveCount, 1);
  const reloaded = await createService(profile, store);
  await reloaded.run({ state: reviewed, forwardedProps: { command: 'save', ...extras } }, 'test-thread');
  assert.equal(reloaded.inspect().saveCount, 1);
});
test('save without review, altered candidate, and cross-thread review are rejected', async t => {
  const { run, initial, service } = await setup(t);
  await assert.rejects(run('save', initial, { reviewId: 'fake', actionId: 'fake' }), /review is required/);
  const reviewed = await run('review', initial);
  const tampered = structuredClone(reviewed); tampered.draft[EX + 'title'] = title('Changed after review');
  await assert.rejects(run('save', tampered, { reviewId: reviewed.review.id, actionId: 'tamper' }), /candidate changed/);
  await assert.rejects(service.run({ state: reviewed, forwardedProps: { command: 'save', reviewId: reviewed.review.id, actionId: 'other-thread' } }, 'other-thread'), /review is required/);
  assert.equal(service.inspect().saveCount, 0);
});
test('catalog change invalidates review, and cancel makes review unusable', async t => {
  const { run, initial, service } = await setup(t);
  const reviewed = await run('review', initial);
  await run('catalog', reviewed);
  await assert.rejects(run('save', reviewed, { reviewId: reviewed.review.id, actionId: 'stale-catalog' }), /review is required/);
  const proposed = await run('propose', service.bootstrap());
  const review2 = await run('review', proposed);
  const cancelled = await run('cancel', review2);
  assert.deepEqual(cancelled.draft, initial.draft);
  await assert.rejects(run('save', review2, { reviewId: review2.review.id, actionId: 'cancelled' }), /review is required/);
  assert.equal(service.inspect().saveCount, 0);
});
test('stale record revisions, unauthorized predicates and malformed RDF are rejected', async t => {
  const { run, initial } = await setup(t);
  const invalid = structuredClone(initial); invalid.recordRevision = 0;
  await assert.rejects(run('review', invalid), /Saved record changed/);
  invalid.recordRevision = 1; invalid.draft[EX + 'referenceNumber'] = title('99');
  await assert.rejects(run('review', invalid), /Unauthorized/);
  delete invalid.draft[EX + 'referenceNumber']; invalid.draft[EX + 'title'] = [{ kind: 'literal', value: '007', datatype: XSD + 'integer', language: '' }];
  await assert.rejects(run('review', invalid), /Unsupported editable RDF literal/);
});
