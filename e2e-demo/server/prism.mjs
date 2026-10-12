import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { Engine } from 'shacl-engine';
import { factory, named, encode, decode, parse, serialize, SH, XSD } from './rdf.mjs';

export const D = 'https://example.org/prism-view/';
export const P = 'https://w3id.org/la3d/prism-validation/';
const E = 'https://github.com/CC-RMD-EpiBio/EcologicalMentalFunctioningOntology/EMFO#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const UI = 'http://www.w3.org/ns/shacl-ui#';
const clone = value => structuredClone(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const objects = (ds, s, p) => [...ds.match(named(s), named(p))].map(q => q.object);
const one = (ds, s, p) => { const ts = objects(ds, s, p); if (ts.length !== 1) throw new Error('Unsupported profile cardinality'); return ts[0]; };

// Illustrative demo policy, deliberately separate from ontology constraints and UI profiles.
export const POLICIES = {
  command: { read: ['FunctionField', 'PhaseField', 'ContextField', 'OperationalTextField'], write: ['ContextField'],
    nodes: ['characterization-001', 'person-001', 'contextualization-001', 'context-001', 'key-operational', 'source-operational'] },
  medical: { read: ['FunctionField', 'PhaseField', 'ContextField', 'OperationalTextField', 'MedicalTextField'], write: ['MedicalTextField'],
    nodes: ['characterization-001', 'person-001', 'contextualization-001', 'context-001', 'key-operational', 'source-operational', 'key-medical', 'source-medical'] }
};
const PRESENTATION = {
  command: { name: 'Unit command', subtitle: 'CO / XO / CMC · operational context',
    groups: ['Operational picture', 'Context to review', 'Operational evidence'],
    labels: { FunctionField: 'Observed functioning', PhaseField: 'Current phase', ContextField: 'Operational context', OperationalTextField: 'Observation from the unit' },
    purpose: 'Review shared functioning and operational context. Propose a context correction.' },
  medical: { name: 'Embedded medical', subtitle: 'Evidence review · clinical context',
    groups: ['Evidence context', 'Context from the unit', 'Source-grounded observations'],
    labels: { FunctionField: 'Functioning characterization', PhaseField: 'Operational phase', ContextField: 'Context supplied by the unit', OperationalTextField: 'Operational evidence', MedicalTextField: 'Medical evidence summary' },
    purpose: 'Trace evidence to its source. Propose a correction to the medical evidence paraphrase.' }
};
function policy(persona) { if (!Object.hasOwn(POLICIES, persona)) throw new Error('Unsupported demo persona'); return POLICIES[persona]; }
export function compilePrism(domain, ui) {
  const allowed = new Set([RDF + 'type', ...['targetNode','property','path','datatype','nodeKind','minCount','maxCount','minLength','maxLength','singleLine'].map(x => SH + x)]);
  for (const q of domain) if (!allowed.has(q.predicate.value)) throw new Error('Unsupported domain constraint; rootClass remains excluded');
  const uiAllowed = new Set([RDFS + 'label', ...['name','description','group','order','agentInstruction','intent'].map(x => SH+x), UI+'editor', UI+'propertyRole']);
  for (const q of ui) if (!uiAllowed.has(q.predicate.value)) throw new Error('Unsupported UI annotation');
  const fields = [...ui.match(null, named(SH+'name'))].map(q => {
    const id = q.subject.value;
    const owner = [...domain.match(null, named(SH+'property'), named(id))];
    if (owner.length !== 1) throw new Error('Field must have one node-shape owner');
    const focus = one(domain, owner[0].subject.value, SH+'targetNode').value;
    const predicate = one(domain, id, SH+'path');
    if (predicate.termType !== 'NamedNode') throw new Error('Editable paths must be direct predicates');
    const editor = one(ui, id, UI+'editor').value;
    if (editor !== UI+'TextFieldEditor') throw new Error('Unsupported editor');
    const group = one(ui, id, SH+'group').value;
    if (one(domain, id, SH+'datatype').value !== XSD+'string') throw new Error('Unsupported editable datatype');
    return { id, focus, path: predicate.value, label: q.object.value, description: one(ui,id,SH+'description').value,
      group: one(ui,group,RDFS+'label').value, order: Number(one(ui,id,SH+'order').value), editor,
      datatype: XSD+'string', propertyRole: objects(ui,id,UI+'propertyRole')[0]?.value ?? null };
  }).sort((a,b) => a.order-b.order);
  if (fields.length !== 5) throw new Error('Unsupported field set');
  for (const role of Object.values(POLICIES)) for (const id of role.read) if (!fields.some(f=>f.id===D+id)) throw new Error('Policy references absent shape');
  return fields;
}
export async function loadPrism() {
  const read = name => fs.readFile(new URL('../shapes/prism/'+name+'.ttl', import.meta.url),'utf8').then(parse);
  const [domain, ui, base] = await Promise.all([read('domain'),read('ui'),read('record')]);
  return { domain, ui, base, fields: compilePrism(domain,ui), engine: new Engine(domain,{factory}) };
}
function projection(profile, graph, persona) {
  const pol = policy(persona), presentation = PRESENTATION[persona];
  const nodes = new Set(pol.nodes.map(n=>D+n));
  // Closed node allowlist, and no edges to excluded fixture nodes. Filter before all serialization.
  const visible = factory.dataset([...graph].filter(q => nodes.has(q.subject.value) &&
    !(q.object.termType==='NamedNode' && q.object.value.startsWith(D) && !nodes.has(q.object.value))));
  const fields = profile.fields.filter(f=>pol.read.includes(f.id.slice(D.length))).map(f=>{
    const groupIndex = f.order===1 ? 0 : f.order<4 ? 1 : 2;
    return {...f,label:presentation.labels[f.id.slice(D.length)] ?? f.label,group:presentation.groups[groupIndex],
      editable:pol.write.includes(f.id.slice(D.length)), values:objects(visible,f.focus,f.path).map(encode),
      sources:objects(visible,f.focus,P+'references_observation').map(encode)};
  });
  const contextNodes = new Set([D+'characterization-001',D+'contextualization-001']);
  const relations = [...visible].filter(q=>contextNodes.has(q.subject.value)&&[E+'has_contextualization',E+'has_context'].includes(q.predicate.value))
    .map(q=>({subject:q.subject.value,predicate:q.predicate.value,object:q.object.value}));
  return {fields,relations,presentation,visible};
}
function writable(profile, graph, persona) {
  return Object.fromEntries(projection(profile,graph,persona).fields.filter(f=>f.editable).map(f=>[f.id,f.values]));
}
function candidate(profile, graph, persona, draft) {
  const pol=policy(persona), keys=pol.write.map(x=>D+x);
  if (!draft || typeof draft!=='object' || Array.isArray(draft) || Object.keys(draft).length!==keys.length || Object.keys(draft).some(k=>!keys.includes(k))) throw new Error('Denied: draft contains a field outside this persona’s edit policy.');
  const result=factory.dataset([...graph]);
  for (const id of keys) {
    const values=draft[id], f=profile.fields.find(f=>f.id===id);
    if (!Array.isArray(values)||values.length>2) throw new Error('Invalid RDF value list');
    for (const t of values) if (!t||Object.keys(t).sort().join(',')!=='datatype,kind,language,value'||t.kind!=='literal'||t.datatype!==XSD+'string'||t.language!==''||typeof t.value!=='string'||t.value.length>1000) throw new Error('Unsupported editable RDF term');
    for (const q of result.match(named(f.focus),named(f.path))) result.delete(q);
    for (const t of values) result.add(factory.quad(named(f.focus),named(f.path),decode(t)));
  }
  return result;
}
export async function createPrismService(profile, storePath) {
  let graph=profile.base, revision=1, saveCount=0;
  const reviews=new Map(), completed=new Map();
  try { const stored=JSON.parse(await fs.readFile(storePath,'utf8')); graph=await parse(stored.ntriples); revision=stored.revision; saveCount=stored.saveCount; for(const [k,v] of stored.completed??[]) completed.set(k,v); }
  catch(e){if(e.code!=='ENOENT')throw e;}
  const state = (persona, draft, extra={}) => {
    const projected=projection(profile,graph,persona);
    // Agent gets precisely the permitted projection. Never raw graph, raw report, annotations, or foreign history.
    return { persona, descriptor:{id:D+'StakeholderView',focus:D+'characterization-001',fields:projected.fields,relations:projected.relations},
      presentation:projected.presentation, draft:clone(draft??writable(profile,graph,persona)),
      recordRevision:revision,saveCount,validation:null,review:null,
      notice:'Shared synthetic record loaded. Demo persona; no authenticated identity.',
      agentContext:{recordId:D+'characterization-001',persona,fields:projected.fields.map(f=>({id:f.id,focus:f.focus,path:f.path,values:f.values,sources:f.sources})),relations:projected.relations},...extra};
  };
  async function check(candidateGraph, persona) {
    const report=await profile.engine.validate({dataset:candidateGraph});
    const permitted=new Set(policy(persona).read.map(x=>D+x));
    const visible=projection(profile,candidateGraph,persona).visible;
    const errors=report.results.map(r=>{
      const id=r.shape.ptr.term.value, component=r.constraintComponent.value;
      // Deliberately return no value, source IRI or report serialization for inaccessible fields.
      if (!permitted.has(id)||!visible.match(named(r.focusNode.term.value)).size) return {field:null,message:'Candidate failed a server-only constraint.'};
      const f=profile.fields.find(f=>f.id===id);
      return {field:id,focus:r.focusNode.term.value,path:f.path,component,
        message:component.endsWith('MinCountConstraintComponent')||component.endsWith('MinLengthConstraintComponent')?'This field is required.':component.endsWith('SingleLineConstraintComponent')?'Use a single line.':component.endsWith('MaxLengthConstraintComponent')?'Use 180 characters or fewer.':'This value does not satisfy the shape.'};
    });
    return {conforms:report.conforms,errors};
  }
  async function execute(persona,input,threadId) {
    policy(persona);
    const {command,reviewId,actionId}=input.forwardedProps??{};
    if (!['open','cancel','propose','review','save'].includes(command)) throw new Error('Denied: action is outside the demo policy.');
    if (command==='open'||command==='cancel') {
      for(const [id,r] of reviews)if(r.threadId===threadId)reviews.delete(id);
      return state(persona,undefined,{notice:command==='cancel'?'Draft cancelled; saved graph unchanged.':'Shared synthetic record loaded.'});
    }
    const draft=clone(input.state?.draft);
    // Ignore input.state.persona, descriptor, agentContext, messages and context. URL selects a simulated persona.
    if(command==='propose') {
      candidate(profile,graph,persona,draft);
      const id=D+policy(persona).write[0];
      draft[id]=[{kind:'literal',datatype:XSD+'string',language:'',value:persona==='command'?'Synthetic training period; updated watch schedule confirmed by the unit.':'Synthetic private encounter: follow-up conversation requested; source paraphrase reviewed.'}];
    }
    const next=candidate(profile,graph,persona,draft);
    const fingerprint=hash({persona,draft,reviewId,threadId});
    if(command==='save'&&completed.has(actionId)) {
      if(completed.get(actionId).fingerprint!==fingerprint)throw new Error('Denied: action ID belongs to a different save.');
      return state(persona,undefined,{notice:'Save already applied; no duplicate write.'});
    }
    if(input.state?.recordRevision!==revision)throw new Error('Shared record changed. Cancel draft and reload before review.');
    const validation=await check(next,persona);
    const extra={validation,notice:validation.conforms?'Server validation passed.':'Correct the highlighted field.'};
    if(command==='propose')extra.notice='Deterministic proposal received. Human review is required.';
    if(command==='review'&&validation.conforms) {
      for(const [id,r] of reviews)if(r.threadId===threadId)reviews.delete(id);
      const id=randomUUID();
      reviews.set(id,{persona,threadId,revision,draft:clone(draft)});
      extra.review={id,before:writable(profile,graph,persona),after:clone(draft)};
      extra.notice='Review the exact change, then confirm the local save.';
    }
    if(command==='save') {
      const review=reviews.get(reviewId);
      if(!review||review.persona!==persona||review.threadId!==threadId||review.revision!==revision||hash(review.draft)!==hash(draft))throw new Error('Denied: a current review for this persona and exact candidate is required.');
      if(typeof actionId!=='string'||!actionId||actionId.length>100)throw new Error('Save action ID is required.');
      if(!validation.conforms)throw new Error('Fresh server validation failed.');
      const nextCompleted=new Map(completed);nextCompleted.set(actionId,{fingerprint,revision:revision+1});if(nextCompleted.size>100)nextCompleted.delete(nextCompleted.keys().next().value);
      await fs.mkdir(path.dirname(storePath),{recursive:true});
      await fs.writeFile(storePath+'.tmp',JSON.stringify({revision:revision+1,saveCount:saveCount+1,ntriples:serialize(next),completed:[...nextCompleted]},null,2));
      await fs.rename(storePath+'.tmp',storePath);
      graph=next;revision++;saveCount++;completed.clear();for(const [k,v]of nextCompleted)completed.set(k,v);reviews.clear();
      return state(persona,undefined,{validation,notice:`Saved shared record revision ${revision}.`});
    }
    return state(persona,draft,extra);
  }
  let queue=Promise.resolve();
  return {bootstrap:persona=>state(persona),run(persona,input,threadId='test-thread'){const pending=queue.then(()=>execute(persona,input,threadId));queue=pending.catch(()=>{});return pending;},
    inspect:()=>({revision,saveCount,ntriples:serialize(graph)})};
}
