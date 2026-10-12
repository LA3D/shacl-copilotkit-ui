import { createRoot } from 'react-dom/client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { CopilotKitProvider, useAgent, useRenderTool, useRenderToolCall } from '@copilotkit/react-core/v2';
import { HttpAgent } from '@ag-ui/client';
import type { AssistantMessage, ToolMessage } from '@ag-ui/core';
import { z } from 'zod';
import type { Term, Draft } from './types';
import './prism.css';

type PrismField = { id:string;focus:string;path:string;label:string;description:string;group:string;order:number;editor:string;datatype:string;editable:boolean;values:Term[];sources:Term[] };
type State = {persona:string;descriptor:{id:string;focus:string;fields:PrismField[];relations:{subject:string;predicate:string;object:string}[]};presentation:{name:string;subtitle:string;purpose:string};draft:Draft;recordRevision:number;saveCount:number;notice:string;agentContext:unknown;validation:null|{conforms:boolean;errors:{field:string|null;message:string}[]};review:null|{id:string;before:Draft;after:Draft}};
type Actions={run:(command:string,extra?:Record<string,string>)=>Promise<void>;busy:boolean;edit:(field:PrismField,value:string)=>void};
const Context=createContext<Actions|null>(null);
const short=(iri:string)=>iri.split(/[\/#]/).at(-1);
function Form(){
  const actions=useContext(Context)!;const {agent}=useAgent();const state=agent.state as State;
  const groups=[...new Set(state.descriptor.fields.map(f=>f.group))];
  return <section className="card prism-form" aria-label="Stakeholder record view"><div className="card-heading"><div><span className="eyebrow">ONE RECORD · A DIFFERENT VIEW</span><h2>{state.presentation.name}</h2></div><span className="pill">{state.descriptor.fields.length} visible fields</span></div>
    <form onSubmit={e=>{e.preventDefault();void actions.run('review');}} noValidate>
      {groups.map(group=><fieldset key={group}><legend>{group}</legend>{state.descriptor.fields.filter(f=>f.group===group).map(field=>{
        const values=field.editable?state.draft[field.id]:field.values;
        const errors=state.validation?.errors.filter(e=>e.field===field.id)??[];
        return <div className="field" key={field.id}><label htmlFor={field.id}>{field.label}<span className="required">{field.editable?'Editable in this persona':'Read only'}</span></label>
          <input id={field.id} value={values?.[0]?.value??''} readOnly={!field.editable} disabled={actions.busy||Boolean(state.review)} aria-invalid={errors.length>0} aria-describedby={field.id+'-help'} onChange={e=>actions.edit(field,e.target.value)}/>
          <p id={field.id+'-help'} className="help">{field.description}</p>
          {field.sources.length>0&&<p className="source-ref">Source observation: <code>{field.sources.map(s=>short(s.value)).join(', ')}</code></p>}
          {errors.map((e,i)=><p key={i} role="alert" className="field-error">{e.message}</p>)}
        </div>;
      })}</fieldset>)}
      {state.validation?.errors.filter(e=>!e.field).map((e,i)=><p className="field-error" role="alert" key={i}>{e.message}</p>)}
      {!state.review&&<div className="actions"><button className="primary" disabled={actions.busy}>Validate & review</button><button type="button" disabled={actions.busy} onClick={()=>void actions.run('cancel')}>Cancel draft</button></div>}
    </form>
    {state.review&&<section className="review" aria-label="Human review"><span className="eyebrow">EXACT CANDIDATE · HUMAN CONFIRMATION</span><h3>Review the shared graph change</h3>{Object.entries(state.review.after).map(([id,after])=><div className="prism-diff" key={id}><strong>{state.descriptor.fields.find(f=>f.id===id)?.label}</strong><p><del>{state.review!.before[id]?.[0]?.value||'(empty)'}</del></p><p>{after[0]?.value||'(empty)'}</p></div>)}<div className="actions"><button className="primary" disabled={actions.busy} onClick={()=>void actions.run('save',{reviewId:state.review!.id,actionId:crypto.randomUUID()})}>Confirm demo save</button><button disabled={actions.busy} onClick={()=>void actions.run('cancel')}>Cancel review</button></div></section>}
  </section>;
}
function Prism(){
  const {agent}=useAgent();const state=agent.state as State;
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[events,setEvents]=useState<string[]>([]);
  const lock=useRef(false),started=useRef(false);
  useEffect(()=>{const event=(type:string)=>setEvents(old=>[...old.slice(-9),type]);const sub=agent.subscribe({onRunStartedEvent:({event:e})=>event(e.type),onStateSnapshotEvent:({event:e})=>event(e.type),onStateDeltaEvent:({event:e})=>event(e.type),onToolCallEndEvent:({event:e})=>event(e.type),onRunFinishedEvent:({event:e})=>event(e.type),onRunErrorEvent:({event:e})=>{event(e.type);setError(e.message);}});return()=>sub.unsubscribe();},[agent]);
  async function run(command:string,extra:Record<string,string>={}){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await agent.runAgent({forwardedProps:{command,...extra}});}catch(e){setError(String(e));}finally{lock.current=false;setBusy(false);}}
  useEffect(()=>{if(!started.current){started.current=true;void run('open');}},[]);
  function edit(field:PrismField,value:string){if(!field.editable||busy||state.review)return;agent.setState({...state,draft:{...state.draft,[field.id]:value?[{kind:'literal',datatype:field.datatype,language:'',value}]:[]},review:null,validation:null,notice:'Local draft changed. Validate before review.'});}
  useRenderTool({name:'show_prism',parameters:z.object({descriptorId:z.string()}),render:({parameters})=>parameters.descriptorId===state.descriptor.id?<Form/>:<p>Unknown descriptor.</p>},[state.descriptor.id]);
  const render=useRenderToolCall();const call=agent.messages.filter((m):m is AssistantMessage=>m.role==='assistant').flatMap(m=>m.toolCalls??[]).filter(t=>t.function.name==='show_prism').at(-1);
  const result=agent.messages.find((m):m is ToolMessage=>m.role==='tool'&&m.toolCallId===call?.id);
  return <Context.Provider value={{run,busy,edit}}><div className="shell prism-shell"><header><a className="brand" href="/">◈ <span>Shape Studio / PRISM</span></a><span className="badge">SYNTHETIC · LOCAL ONLY</span></header>
    <main><div className="prism-intro"><div><span className="eyebrow">ONTOLOGY → STAKEHOLDER VIEW</span><h1>Shared evidence.<br/><em>Different responsibilities.</em></h1><p>One synthetic PRISM-style characterization, presented for two documented audiences.</p></div><div className="persona-box"><label htmlFor="persona">Simulated persona</label><select id="persona" value={state.persona} disabled={busy} onChange={e=>{location.href='/?view=prism&persona='+e.target.value;}}><option value="command">Unit command · CO / XO / CMC</option><option value="medical">Embedded medical</option></select><p>Switching clears unsaved edits and agent history. This selector is not authentication.</p></div></div>
    <div className="record-bar"><div><span className="eyebrow">STABLE RECORD ID</span><code>{state.descriptor.focus}</code></div><span className="pill">Revision {state.recordRevision} · {state.saveCount} saves</span></div>
    <div className="status-strip" aria-live="polite"><span className={'status-dot '+(state.validation?.conforms===false?'invalid':'')}/><span>{busy?'Validating the candidate graph…':state.notice}</span></div>
    {error&&<div className="error-banner" role="alert">{error}</div>}
    <div className="layout"><div>{call?render({toolCall:call,toolMessage:result}):<section className="card">Opening stakeholder view…</section>}</div><aside>
      <section className="card driver"><span className="eyebrow">{state.presentation.subtitle}</span><h2>What this view enables</h2><p>{state.presentation.purpose}</p><button disabled={busy||Boolean(state.review)} onClick={()=>void run('propose')}>✦ Propose a sample correction</button><p className="small">Deterministic agent; no model call. Proposals never save themselves.</p></section>
      <section className="card safety"><h3>Demo policy, enforced on the server</h3><p>{state.persona==='command'?'Only the operational projection is sent to this view. Medical evidence and its source links are excluded.':'Medical evidence is available in this simulated view. Context supplied by command remains read only.'}</p><button disabled={busy} onClick={()=>void run('prescribe')}>Test denied clinical action</button><p className="small">Actions and access are illustrative choices, not approved Navy policy. No diagnosis, treatment or risk prediction is generated.</p></section>
      <section className="card relationship"><span className="eyebrow">MODEL RELATIONSHIP</span><h3>Context stays attached</h3><div>Characterization<span>has_contextualization ↓</span>ProcessContextualization<span>has_context ↓</span>ContextualFactors</div><p>Views share the relationship and its stable RDF identifiers.</p></section>
    </aside></div>
    <details className="diagnostics"><summary>Inspect this persona’s fields, agent context & events</summary><div className="diagnostic-grid"><div><h3>Permitted agent context</h3><pre data-testid="prism-context">{JSON.stringify(state.agentContext,null,2)}</pre><h3>Draft terms</h3><pre data-testid="prism-draft">{JSON.stringify(state.draft,null,2)}</pre></div><div><h3>Visible mappings</h3>{state.descriptor.fields.map(f=><p key={f.id}><strong>{f.label}</strong><br/><code>{f.focus}<br/>{f.path}</code></p>)}<h3>AG-UI events</h3><ol>{events.map((e,i)=><li key={i}><code>{e}</code></li>)}</ol></div></div></details>
    <p className="prism-limit">Minimal PRISM-derived profile: required RDF links and bounded text. Full ontology closures, clinical semantics, inference and production authorization are not implemented.</p></main>
    <footer>CopilotKit 1.78.0 · AG-UI 1.0.2 · SHUI FPWD hash namespace<span><a href="/">Original three-field demo</a> · Backend candidate validation + human review</span></footer>
  </div></Context.Provider>;
}
export async function bootPrism(){
  const requested=new URLSearchParams(location.search).get('persona')??'command';const persona=requested==='medical'?'medical':'command';
  const response=await fetch('/api/prism/'+persona+'/bootstrap');if(!response.ok)throw new Error('Could not load stakeholder view');
  const state=await response.json() as State;
  const agent=new HttpAgent({agentId:'default',url:location.origin+'/api/prism/'+persona+'/agent',initialState:state});
  createRoot(document.getElementById('root')!).render(<CopilotKitProvider key={persona} agents__unsafe_dev_only={{default:agent}} enableInspector={false} showIntelligenceIndicator={false}><Prism/></CopilotKitProvider>);
}
