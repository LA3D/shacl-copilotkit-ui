import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parse, named, encode, SH, XSD } from './rdf.mjs';
export const UI = 'https://example.org/okn-ui-hints/';
export const SHUI = 'http://www.w3.org/ns/shacl-ui#';
export const DASH = 'http://datashapes.org/dash#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const DEMO = 'https://example.org/okn-ui/';
export const CHART = UI + 'ComparisonViewer', TABLE = SHUI + 'ValueTableViewer';
const viewers = new Map([[CHART, CHART], [TABLE, TABLE], [DASH+'ValueTableViewer', TABLE],
  [SHUI+'LiteralViewer', SHUI+'LiteralViewer'], [DASH+'LiteralViewer', SHUI+'LiteralViewer'],
  [SHUI+'IRIViewer', SHUI+'IRIViewer'], [DASH+'URIViewer', SHUI+'IRIViewer']]);
const iri = z.string().max(300);
const Column = z.object({ id: iri, label: z.string().max(100), path: z.array(iri).min(1).max(2),
  viewer: z.enum([SHUI+'LiteralViewer', SHUI+'IRIViewer']), order: z.number().finite() }).strict();
export const ViewSchema = z.object({ kind: z.enum(['comparison','table']), viewer: z.enum([CHART,TABLE]),
  declaredViewer: iri, shape: iri, title: z.string().max(100), question: z.enum(['compare','evidence']),
  columns: z.array(Column).min(1).max(8), mappings: z.object({ category: iri, measure: iri, unit: iri, time: iri }).strict(),
  unit: z.literal('http://qudt.org/vocab/unit/M'), datasetId: z.string().regex(/^[a-f0-9]{64}$/),
  profileHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const terms = (ds,s,p) => [...ds.match(typeof s === 'string' ? named(s) : s,named(p))].map(q=>q.object);
function one(ds,s,p) { const ts=terms(ds,s,p); if(ts.length!==1) throw new Error('Missing or conflicting RDF hint: '+p); return ts[0]; }
function resource(t) { if(t.termType!=='NamedNode') throw new Error('RDF hint must be an IRI'); return t.value; }
function text(t) { if(t.termType!=='Literal'||t.datatype.value!==XSD+'string'||t.value.length>100) throw new Error('Expected bounded string hint'); return t.value; }
function path(ds,t) {
  if(t.termType==='NamedNode') return [t.value];
  const result=[],seen=new Set();
  while(t.value!==RDF+'nil') {
    if(seen.has(t.value)||result.length===2) throw new Error('Unsupported/cyclic RDF path');
    seen.add(t.value); result.push(resource(one(ds,t,RDF+'first'))); t=one(ds,t,RDF+'rest');
  }
  if(result.length!==2) throw new Error('Only direct or two-step sequence paths supported');
  return result;
}
function viewer(ds,s) {
  const values=[...terms(ds,s,SHUI+'viewer'),...terms(ds,s,DASH+'viewer')];
  if(values.length!==1) throw new Error('Missing or conflicting RDF viewer');
  const declared=resource(values[0]), canonical=viewers.get(declared);
  if(!canonical) throw new Error('Unsupported RDF viewer');
  return {declared,canonical};
}
export async function compilePresentation(turtle) {
  const ds=await parse(turtle), used=new Set();
  function only(subject, predicates) {
    const allowed=new Set([RDF+'type',...predicates]);
    for(const q of ds.match(named(subject))) if(!allowed.has(q.predicate.value)) throw new Error('Misplaced RDF hint');
  }
  // Unknown annotations are errors, never executable code or silently ignored preferences.
  const allowed=new Set([RDF+'type',RDF+'first',RDF+'rest',...['targetNode','property','path','node','name','order'].map(x=>SH+x),
    SHUI+'viewer',DASH+'viewer',...['forIntent','fallbackViewer','category','measure','unit','time'].map(x=>UI+x)]);
  for(const q of ds) if(!allowed.has(q.predicate.value)) throw new Error('Unsupported RDF hint predicate');
  const root=UI+'DatasetShape';
  only(root,[SH+'targetNode',SH+'property']);
  if(resource(one(ds,root,SH+'targetNode'))!==DEMO+'dataset') throw new Error('Unsupported presentation focus');
  const intents={};
  for(const property of terms(ds,root,SH+'property')) {
    const id=resource(property); used.add(id);
    only(id,[SH+'path',SH+'node',SH+'name',SHUI+'viewer',DASH+'viewer',...['forIntent','fallbackViewer','category','measure','unit','time'].map(x=>UI+x)]);
    const intent=resource(one(ds,id,UI+'forIntent')).slice(UI.length);
    if(!['compare','evidence'].includes(intent)||resource(one(ds,id,UI+'forIntent'))!==UI+intent||intents[intent]) throw new Error('Unsupported or conflicting intent');
    if(resource(one(ds,id,SH+'path'))!==DEMO+'prediction') throw new Error('Unsupported collection path');
    const node=resource(one(ds,id,SH+'node')); used.add(node); only(node,[SH+'property']);
    const columns=terms(ds,node,SH+'property').map(t=>{
      const cid=resource(t); used.add(cid); only(cid,[SH+'path',SH+'name',SH+'order',SHUI+'viewer',DASH+'viewer']); const v=viewer(ds,cid);
      const order=one(ds,cid,SH+'order');
      if(order.termType!=='Literal'||![XSD+'integer',XSD+'decimal'].includes(order.datatype.value)) throw new Error('Invalid RDF order');
      return Column.parse({id:cid,label:text(one(ds,cid,SH+'name')),path:path(ds,one(ds,cid,SH+'path')),viewer:v.canonical,order:Number(order.value)});
    }).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
    if(columns.length<1||columns.length>8) throw new Error('Unsupported columns');
    const mappings=Object.fromEntries(['category','measure','unit','time'].map(role=>{
      const field=resource(one(ds,id,UI+role)); if(!columns.some(c=>c.id===field)) throw new Error('RDF mapping references absent column'); return [role,field];
    }));
    if(new Set(Object.values(mappings)).size!==4) throw new Error('Conflicting RDF mappings');
    const v=viewer(ds,id);
    if(![CHART,TABLE].includes(v.canonical)) throw new Error('Unsupported collection viewer');
    const fallback=resource(one(ds,id,UI+'fallbackViewer'));
    if(viewers.get(fallback)!==TABLE) throw new Error('Unsupported fallback viewer');
    intents[intent]={shape:id,title:text(one(ds,id,SH+'name')),declaredViewer:v.declared,viewer:v.canonical,columns,mappings,fallback:TABLE};
  }
  if(Object.keys(intents).length!==2) throw new Error('Both intents require RDF declarations');
  // Reject unreferenced named hint subjects rather than accepting a misspelled/unused hint.
  used.add(root);
  for(const q of ds) if(q.subject.termType==='NamedNode'&&!used.has(q.subject.value)) throw new Error('Unreferenced RDF hint subject');
  return {intents,turtle,hash:createHash('sha256').update(turtle).digest('hex')};
}
const common=await fs.readFile(new URL('../shapes/okn-ui.ttl',import.meta.url),'utf8');
export const PRESENTATIONS=Object.fromEntries(await Promise.all(['chart','table'].map(async key=>[key,await compilePresentation(common+'\n'+await fs.readFile(new URL('../shapes/okn-ui-'+key+'.ttl',import.meta.url),'utf8'))])));
function follow(ds,start,predicates) { return predicates.reduce((nodes,p)=>nodes.flatMap(n=>terms(ds,n,p)),[start]); }
export function present(graph,profile,question,datasetId) {
  const hint=profile.intents[question]; if(!hint) throw new Error('Unsupported intent');
  const records=terms(graph,DEMO+'dataset',DEMO+'prediction').map(node=>Object.fromEntries(hint.columns.map(c=>{
    const values=follow(graph,node,c.path);
    if(values.length!==1) throw new Error('Presentation path must resolve to exactly one RDF value');
    const term=values[0];
    if(c.viewer===SHUI+'LiteralViewer' ? term.termType!=='Literal' : term.termType!=='NamedNode') throw new Error('RDF viewer incompatible with data');
    return [c.id,encode(term)];
  })));
  const m=hint.mappings;
  // Custom chart acceptance, independent of the viewer preference. No inferred time meaning or conversion.
  const compatible=records.length>0&&records.length<=3&&records.every(r=>r[m.category].kind==='iri'&&r[m.measure].kind==='literal'&&
    r[m.measure].datatype===XSD+'decimal'&&/^\d+(?:\.\d+)?$/.test(r[m.measure].value)&&Number.isFinite(Number(r[m.measure].value))&&
    r[m.unit].kind==='iri'&&r[m.unit].value==='http://qudt.org/vocab/unit/M'&&r[m.time].kind==='literal'&&r[m.time].datatype===XSD+'string'&&
    /^\d{4}-\d{2}-\d{2}T/.test(r[m.time].value))&&new Set(records.map(r=>r[m.category].value)).size===records.length&&new Set(records.map(r=>r[m.time].value)).size===1;
  const chosen=hint.viewer===CHART&&!compatible?hint.fallback:hint.viewer;
  const reason=!records.length?'No matching results: RDF-declared table fallback.':hint.viewer===CHART&&!compatible?
    'Chart suitability failed: use RDF-declared table fallback; do not aggregate implicitly.':
    'RDF viewer preference selected '+chosen.split(/[#/]/).at(-1)+(chosen===CHART?'; chart unit, value and shared-time checks passed.':'.');
  return {records,reason,view:ViewSchema.parse({kind:chosen===CHART?'comparison':'table',viewer:chosen,declaredViewer:hint.declaredViewer,
    shape:hint.shape,title:hint.title,question,columns:hint.columns,mappings:hint.mappings,unit:'http://qudt.org/vocab/unit/M',datasetId,profileHash:profile.hash})};
}
