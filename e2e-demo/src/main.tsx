import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState, createContext, useContext } from 'react';
import { CopilotKitProvider, useAgent, useRenderTool, useRenderToolCall } from '@copilotkit/react-core/v2';
import { HttpAgent } from '@ag-ui/client';
import type { AssistantMessage, ToolMessage } from '@ag-ui/core';
import { z } from 'zod';
import type { DemoState, Field } from './types';
import './style.css';
import { bootPrism } from './prism';

type Actions = { run: (command: string, extra?: Record<string, string>) => Promise<void>; busy: boolean; edit: (field: Field, value: string) => void };
const ActionsContext = createContext<Actions | null>(null);
const useActions = () => { const actions = useContext(ActionsContext); if (!actions) throw new Error('Missing demo actions'); return actions; };
const short = (iri: string) => iri.slice(iri.lastIndexOf('/') + 1);
function ShapeForm() {
  const { agent } = useAgent(); const state = agent.state as DemoState;
  const { busy, edit, run } = useActions();
  return <section className="card form-card" aria-label="Shape-generated form">
    <div className="card-heading"><div><span className="eyebrow">TRUSTED SHAPE → REGISTERED COMPONENTS</span><h2>{state.descriptor.fields[0].group}</h2></div><span className="pill">3 fields</span></div>
    <form onSubmit={event => { event.preventDefault(); void run('review'); }} noValidate>
      {state.descriptor.fields.map(field => {
        const value = state.draft[field.path]?.[0]?.value ?? '';
        const options = field.dependsOn ? state.catalog[state.draft[field.dependsOn]?.[0]?.value] ?? [] : field.options;
        const errors = state.validation?.errors.filter(error => error.sourceShape === field.id) ?? [];
        const stale = Boolean(value && field.editor.endsWith('EnumSelectEditor') && !options.some(option => option.value === value));
        const controlProps = { id: field.id, disabled: busy || Boolean(state.review), 'aria-invalid': errors.length > 0 || stale,
          'aria-describedby': field.id + '-help', value };
        return <div className="field" key={field.id}>
          <label htmlFor={field.id}>{field.label} <span className="required">Required</span></label>
          {field.editor.endsWith('TextFieldEditor') ? <input {...controlProps} onChange={event => edit(field, event.target.value)} />
            : <select {...controlProps} onChange={event => edit(field, event.target.value)}>
              <option value="">Choose an option</option>
              {stale && <option value={value}>{short(value)} — no longer available</option>}
              {options.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>}
          <p id={field.id + '-help'} className="help">{field.description}</p>
          {errors.map((error, i) => <p className="field-error" role="alert" key={i}>{error.message}</p>)}
          {stale && !errors.length && <p className="field-error">Selection is unavailable. Choose a new option and validate.</p>}
        </div>;
      })}
      {!state.review && <div className="actions"><button className="primary" type="submit" disabled={busy}>Validate & review</button><button type="button" disabled={busy} onClick={() => void run('cancel')}>Cancel draft</button></div>}
    </form>
    {state.review && <section className="review" aria-label="Review candidate">
      <span className="eyebrow">HUMAN REVIEW</span><h3>Confirm these exact values</h3>
      <p>Only this isolated demo record will be saved. The server validates it again.</p>
      {state.descriptor.fields.map(field => <div className="diff-row" key={field.id}><strong>{field.label}</strong><span>{state.review?.before[field.path]?.[0]?.value?.replace('https://example.org/shui-demo/', '') || '(empty)'} → <b>{state.review?.after[field.path]?.[0]?.value?.replace('https://example.org/shui-demo/', '') || '(empty)'}</b></span></div>)}
      <div className="actions"><button className="primary" disabled={busy} onClick={() => void run('save', { reviewId: state.review!.id, actionId: crypto.randomUUID() })}>Confirm demo save</button><button disabled={busy} onClick={() => void run('cancel')}>Cancel review</button></div>
    </section>}
    <div className="card-foot"><span>Shape</span><code>RecordShape</code><span>•</span><span>Published SHUI hash namespace</span></div>
  </section>;
}
function Demo() {
  const { agent } = useAgent(); const state = agent.state as DemoState;
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [events, setEvents] = useState<string[]>([]);
  const started = useRef(false), busyRef = useRef(false);
  useEffect(() => {
    const remember = (event: { type: string }) => setEvents(old => [...old.slice(-13), event.type]);
    const subscription = agent.subscribe({ onRunStartedEvent: ({ event }) => remember(event),
      onStateSnapshotEvent: ({ event }) => remember(event), onStateDeltaEvent: ({ event }) => remember(event),
      onToolCallEndEvent: ({ event }) => remember(event), onRunFinishedEvent: ({ event }) => remember(event),
      onRunErrorEvent: ({ event }) => { remember(event); setError(event.message); } });
    return () => subscription.unsubscribe();
  }, [agent]);
  async function run(command: string, extra: Record<string, string> = {}) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      await agent.runAgent({ forwardedProps: { command, ...extra } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  useEffect(() => { if (!started.current) { started.current = true; void run('open'); } }, []);
  function edit(field: Field, value: string) {
    const values = value === '' ? [] : field.datatype
      ? [{ kind: 'literal' as const, value, datatype: field.datatype, language: '' }]
      : [{ kind: 'iri' as const, value }];
    agent.setState({ ...state, draft: { ...state.draft, [field.path]: values }, validation: null, review: null, sync: 'local', notice: 'Draft edited. Validate & review sends it to the server.' });
  }
  useRenderTool({ name: 'show_record', parameters: z.object({ descriptorId: z.string() }),
    render: ({ parameters }) => parameters.descriptorId === state.descriptor.id ? <ShapeForm /> : <p>Unsupported form descriptor.</p> }, [state.descriptor.id]);
  const renderToolCall = useRenderToolCall();
  const messages = agent.messages;
  const toolCall = messages.filter((m): m is AssistantMessage => m.role === 'assistant').flatMap(m => m.toolCalls ?? []).filter(t => t.function.name === 'show_record').at(-1);
  const toolMessage = messages.find((m): m is ToolMessage => m.role === 'tool' && m.toolCallId === toolCall?.id);
  const labelField = state.descriptor.fields.find(f => f.role?.endsWith('LabelRole'));
  const title = (labelField && state.draft[labelField.path]?.[0]?.value) || 'Untitled record';
  return <ActionsContext.Provider value={{ run, busy, edit }}><div className="shell">
    <header><a className="brand" href="/">◈ <span>Shape Studio</span></a><span className="badge"><i /> LOCAL · SYNTHETIC DATA</span></header>
    <main><div className="intro"><span className="eyebrow">SHACL 1.2 × COPILOTKIT × AG-UI</span><h1>A proposal you can<br /><em>inspect and correct.</em></h1><p>A trusted RDF shape becomes a form. Shared state carries the draft.<br className="desktop" /> The server checks every candidate before a reviewed save.</p></div>
      <div className="status-strip" aria-live="polite"><span className={'status-dot ' + (state.validation?.conforms === false ? 'invalid' : '')} /><span>{busy ? 'Running local validation…' : state.notice}</span><span className="sync">{state.sync === 'local' ? 'Draft changed locally' : 'Server synchronized'}</span></div>
      {error && <div role="alert" className="error-banner">{error}</div>}
      <div className="layout"><div>{toolCall ? renderToolCall({ toolCall, toolMessage }) : <div className="card"><p>Opening registered form…</p></div>}
        <section className="identity"><span className="eyebrow">CURRENT DRAFT</span><h3>{title}</h3><code>{state.descriptor.focus}</code></section></div>
        <aside><section className="card driver"><span className="eyebrow">DETERMINISTIC AGENT</span><h2>Try the round trip</h2><p>This driver sends real AG-UI events. It uses scripted proposals, with no model calls or credentials.</p>
          <button disabled={busy || Boolean(state.review)} onClick={() => void run('propose')}>✦ Propose an example</button>
          <button disabled={busy} onClick={() => void run('catalog')}>↻ Change allowed methods</button>
          <div className="metrics"><div><strong>{state.recordRevision}</strong><span>Record revision</span></div><div><strong>{state.catalogRevision}</strong><span>Catalog revision</span></div><div><strong>{state.saveCount}</strong><span>Reviewed saves</span></div></div>
          <p className="small">Change the catalog to test an unavailable selection, then choose a new method.</p></section>
          <section className="card safety"><h3>Small, explicit boundary</h3><p>Three fields, two approved editors. No arbitrary code from shapes. Unsupported requirements are rejected. <code>rootClass</code> is excluded.</p><span className="pill">Local demo, not production authorization</span></section>
        </aside></div>
      <details className="diagnostics"><summary>Inspect shared RDF state & transport</summary><div className="diagnostic-grid"><div><h3>Shared draft</h3><pre data-testid="shared-draft">{JSON.stringify(state.draft, null, 2)}</pre></div><div><h3>Recent AG-UI events</h3><ol>{events.map((event, i) => <li key={i}><code>{event}</code></li>)}</ol><h3>Backend report</h3><pre>{state.validation ? JSON.stringify(state.validation.errors, null, 2) : 'Awaiting validation'}</pre></div></div></details>
    </main><footer>CopilotKit 1.78.0 · AG-UI 1.0.2 · SHACL engine 1d111fc <span>No public deployment · Store stays on this Studio</span></footer>
  </div></ActionsContext.Provider>;
}
async function boot() {
  const response = await fetch('/api/bootstrap');
  if (!response.ok) throw new Error('Could not load demo bootstrap');
  const state = await response.json() as DemoState;
  const agent = new HttpAgent({ agentId: 'default', url: location.origin + '/api/agent', initialState: state });
  createRoot(document.getElementById('root')!).render(<CopilotKitProvider agents__unsafe_dev_only={{ default: agent }} enableInspector={false} showIntelligenceIndicator={false}><Demo /></CopilotKitProvider>);
}
void (new URLSearchParams(location.search).get('view') === 'prism' ? bootPrism() : boot()).catch(error => { document.getElementById('root')!.textContent = String(error); });
