import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { EX, XSD, catalog, draftFromGraph, candidateGraph, validate, serialize, parse, assertDraft } from './rdf.mjs';

const copy = x => structuredClone(x);
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
export async function createService(profile, storePath) {
  let record = profile.base, revision = 1, catalogRevision = 1, saveCount = 0;
  const reviews = new Map(), completed = new Map();
  try {
    const stored = JSON.parse(await fs.readFile(storePath, 'utf8'));
    record = await parse(stored.ntriples); revision = stored.revision;
    catalogRevision = stored.catalogRevision; saveCount = stored.saveCount;
    for (const pair of stored.completed ?? []) completed.set(...pair);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  async function persist() {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath + '.tmp', JSON.stringify({ revision, catalogRevision, saveCount,
      ntriples: serialize(record), completed: [...completed] }, null, 2));
    await fs.rename(storePath + '.tmp', storePath);
  }
  const state = (draft = draftFromGraph(profile, record), extra = {}) => ({
    descriptor: profile.descriptor, draft: copy(draft), baseline: draftFromGraph(profile, record),
    recordRevision: revision, catalogRevision, catalog: catalog(catalogRevision), saveCount,
    validation: null, review: null, notice: 'Loaded the isolated demo record.',
    sync: 'server', ...extra
  });
  let queue = Promise.resolve();
  async function execute(input, threadId) {
    const { command, actionId, reviewId } = input.forwardedProps ?? {};
    if (!['open', 'propose', 'validate', 'catalog', 'review', 'save', 'cancel'].includes(command)) throw new Error('Unsupported action');
    if (command === 'open') return state();
    if (command === 'cancel') {
      for (const [id, review] of reviews) if (review.threadId === threadId) reviews.delete(id);
      return state(undefined, { notice: 'Draft cancelled. Saved record unchanged.' });
    }
    const draft = copy(input.state?.draft);
    assertDraft(profile, draft);
    const fingerprint = hash({ draft, reviewId, threadId });
    if (command === 'save' && completed.has(actionId)) {
      const done = completed.get(actionId);
      if (done.fingerprint !== fingerprint) throw new Error('Action ID already used for a different save');
      return state(undefined, { notice: `Save already applied at revision ${done.revision}; no duplicate write.` });
    }
    if (input.state.recordRevision !== revision) throw new Error('Saved record changed. Cancel and reload before reviewing again.');
    if (command === 'catalog') {
      catalogRevision += 1; reviews.clear(); await persist();
    }
    if (command === 'propose') {
      draft[EX + 'title'] = [{ kind: 'literal', value: 'Prepare a community field visit', datatype: XSD + 'string', language: '' }];
      draft[EX + 'status'] = [{ kind: 'iri', value: EX + 'planned' }];
      draft[EX + 'channel'] = [{ kind: 'iri', value: catalog(catalogRevision)[EX + 'planned'][0].value }];
    }
    const result = await validate(profile, record, draft, catalogRevision);
    const extra = { validation: result.validation, notice: result.validation.conforms ? 'Draft validated on the server.' : 'Please correct the highlighted fields.' };
    if (command === 'propose') extra.notice = 'Deterministic proposal received. Review or edit before saving.';
    if (command === 'catalog') extra.notice = `Server catalog is now revision ${catalogRevision}. Previous selections were revalidated.`;
    if (command === 'review' && result.validation.conforms) {
      const id = randomUUID();
      // An ephemeral candidate handle, not an identity or authentication credential.
      const review = { id, draft: copy(draft), recordRevision: revision, catalogRevision, threadId };
      for (const [oldId, old] of reviews) if (old.threadId === threadId) reviews.delete(oldId);
      reviews.set(id, review);
      extra.review = { id, before: draftFromGraph(profile, record), after: copy(draft), recordRevision: revision, catalogRevision };
      extra.notice = 'Validation passed. Review the exact values, then confirm the demo save.';
    }
    if (command === 'save') {
      if (typeof actionId !== 'string' || !actionId || actionId.length > 100) throw new Error('A bounded save action ID is required');
      const review = reviews.get(reviewId);
      if (!review || review.threadId !== threadId) throw new Error('A current human review is required');
      if (review.recordRevision !== revision || review.catalogRevision !== catalogRevision || hash(review.draft) !== hash(draft)) throw new Error('The reviewed candidate changed. Review again.');
      if (!result.validation.conforms) throw new Error('Fresh server validation failed; nothing saved');
      const previous = { record, revision, saveCount };
      record = candidateGraph(profile, record, draft); revision += 1; saveCount += 1;
      completed.set(actionId, { fingerprint, revision });
      // Bound the demo replay ledger; not an unlimited transaction history.
      if (completed.size > 100) completed.delete(completed.keys().next().value);
      try { await persist(); }
      catch (error) { record = previous.record; revision = previous.revision; saveCount = previous.saveCount; completed.delete(actionId); throw error; }
      reviews.clear();
      return state(undefined, { validation: result.validation, notice: `Saved revision ${revision} after fresh server validation.` });
    }
    return state(draft, extra);
  }
  return {
    bootstrap: () => state(),
    run(input, threadId = 'test-thread') {
      const pending = queue.then(() => execute(input, threadId));
      queue = pending.catch(() => {});
      return pending;
    },
    inspect: () => ({ revision, saveCount, catalogRevision, ntriples: serialize(record) })
  };
}
