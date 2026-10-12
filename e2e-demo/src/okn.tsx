import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { CopilotKitProvider, useAgent, useRenderTool, useRenderToolCall } from '@copilotkit/react-core/v2';
import { HttpAgent } from '@ag-ui/client';
import type { AssistantMessage, ToolMessage } from '@ag-ui/core';
import { z } from 'zod';
import './okn.css';

type Row = { feature: string; label: string; observation: string; sourceTime: string; sourceDepth: string; depth: number; unitCode: string; raw: unknown };
const ViewSchema = z.object({ kind: z.enum(['comparison', 'table']), question: z.enum(['compare', 'evidence']),
  categoryField: z.literal('feature'), valueField: z.literal('depth'), unit: z.literal('http://qudt.org/vocab/unit/M'),
  datasetId: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
type View = z.infer<typeof ViewSchema>;
type State = { rows: Row[]; view: View; reason: string; questionText: string; query: string; queryHash: string;
  hints: unknown; endpoint: string; graph: string; source: { mode: string; retrievedAt: string; problem: string | null };
  derivedGraph: string; validation: string; notice: string };
const names = ['A', 'B', 'C'];
function Comparison({ rows }: { rows: Row[] }) {
  const max = Math.max(...rows.map(r => r.depth), 0.1);
  return <section aria-label="Predicted flood depth comparison" className="okn-chart">
    <div className="okn-view-heading"><h2>Predicted flood depth</h2><span>Metres · zero baseline</span></div>
    <p className="okn-subtitle">Source timestamp: {rows[0]?.sourceTime} · timezone and meaning unverified</p>
    <svg viewBox="0 0 700 260" role="img" aria-label={rows.map((r, i) => `Feature ${names[i]}: ${r.depth} metres`).join('; ')}>
      {[0, 0.25, 0.5, 0.75, 1].map(fraction => <g key={fraction}><line x1={140 + fraction * 420} x2={140 + fraction * 420} y1="15" y2="215" stroke="#d5ded9"/><text x={140 + fraction * 420} y="245" textAnchor="middle">{(max * fraction).toFixed(3)}</text></g>)}
      {rows.map((row, i) => <g key={row.observation}><text x="120" y={49 + i * 67} textAnchor="end">Feature {names[i]}</text><rect x="140" y={25 + i * 67} width={row.depth / max * 420} height="38" rx="4" fill={i === 0 ? '#0f6658' : '#78a99b'}/><text x={152 + row.depth / max * 420} y={49 + i * 67} className="okn-value">{row.sourceDepth} m</text></g>)}
    </svg>
    <p className="okn-note">Three distinct features at one source time. This is a comparison of predictions, not a measured time series. No interpolation or aggregation.</p>
  </section>;
}
function Evidence({ rows }: { rows: Row[] }) {
  return <section aria-label="Prediction evidence table"><div className="okn-view-heading"><h2>Records behind the comparison</h2><span>Source terms preserved</span></div>
    {!rows.length ? <p role="status">No matching results. Nothing was substituted or plotted.</p> : <div className="okn-table-scroll"><table><thead><tr><th>Feature</th><th>Source timestamp</th><th>Depth / code</th><th>Source observation</th></tr></thead><tbody>{rows.map((row, i) => <tr key={row.observation + row.sourceDepth}><td><strong>Feature {names[i] ?? i + 1}</strong><br/><code>{row.label}</code></td><td>{row.sourceTime}<br/><span>Timezone / time meaning unverified</span></td><td><strong>{row.sourceDepth}</strong><br/><code>{row.unitCode} → unit:M</code></td><td><code>{row.observation}</code></td></tr>)}</tbody></table></div>}
    <p className="okn-note">Source value and timestamp strings remain visible. Decimal parsing and the MTR → QUDT metre mapping are application transformations; no magnitude conversion is applied.</p>
  </section>;
}
function SafeView({ spec }: { spec: View }) {
  const { agent } = useAgent(); const state = agent.state as State;
  const checked = ViewSchema.safeParse(spec);
  if (!checked.success || !state.view || JSON.stringify(checked.data) !== JSON.stringify(state.view)) return <p role="alert">Unsupported or stale view specification.</p>;
  return spec.kind === 'comparison' ? <Comparison rows={state.rows}/> : <Evidence rows={state.rows}/>;
}
function Okn() {
  const { agent } = useAgent(); const state = agent.state as Partial<State>;
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [events, setEvents] = useState<string[]>([]);
  const [source, setSource] = useState<'snapshot' | 'live'>('snapshot');
  const lock = useRef(false), started = useRef(false);
  useEffect(() => {
    const remember = (type: string) => setEvents(old => [...old.slice(-7), type]);
    const sub = agent.subscribe({ onRunStartedEvent: ({ event }) => remember(event.type), onStateSnapshotEvent: ({ event }) => remember(event.type),
      onToolCallEndEvent: ({ event }) => remember(event.type), onRunFinishedEvent: ({ event }) => remember(event.type),
      onRunErrorEvent: ({ event }) => { remember(event.type); setError(event.message); } });
    return () => sub.unsubscribe();
  }, [agent]);
  async function run(question: 'compare' | 'evidence', requestedSource = source) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await agent.runAgent({ forwardedProps: { question, source: requestedSource } }); }
    catch { setError('The local demo request failed. Retry or use the reproducible snapshot.'); }
    finally { lock.current = false; setBusy(false); }
  }
  useEffect(() => { if (!started.current) { started.current = true; void run('compare', 'snapshot'); } }, []);
  useRenderTool({ name: 'show_okn', parameters: ViewSchema, render: ({ parameters }) => {
    const spec = ViewSchema.safeParse(parameters); return spec.success ? <SafeView spec={spec.data}/> : <p>Waiting for a validated view specification…</p>;
  } }, []);
  const render = useRenderToolCall();
  const call = agent.messages.filter((m): m is AssistantMessage => m.role === 'assistant').flatMap(m => m.toolCalls ?? []).filter(t => t.function.name === 'show_okn').at(-1);
  const result = agent.messages.find((m): m is ToolMessage => m.role === 'tool' && m.toolCallId === call?.id);
  return <div className="okn-shell"><header className="okn-header"><a href="/">◈ Shape Studio <span>/ OKN exploration</span></a><span className="okn-badge">WORKING DEMO · SCRIPTED CHOICES</span></header>
    <main><div className="okn-intro"><div><span className="okn-eyebrow">ONE QUERY · TWO REPRESENTATIONS</span><h1>Ask differently.<br/><em>See the same evidence differently.</em></h1><p>Public UFOKN predictions → explicit SOSA / QUDT mapping → a registered UI component.</p></div><div className="okn-source-control"><label htmlFor="okn-source">Data source</label><select id="okn-source" disabled={busy} value={source} onChange={event => { const value = event.target.value as 'snapshot' | 'live'; setSource(value); void run(state.view?.question ?? 'compare', value); }}><option value="snapshot">Dated public snapshot</option><option value="live">Query OKN endpoint</option></select><button disabled={busy} onClick={() => void run(state.view?.question ?? 'compare')}>Run again</button><small>One fixed SELECT · 12-row limit · 8-second timeout · live results cached for 60 seconds</small></div></div>
    <section className="okn-questions" aria-label="Scripted questions"><span className="okn-step">1 · CHANGE THE QUESTION</span><div><button disabled={busy} aria-pressed={state.view?.question === 'compare'} onClick={() => void run('compare')}>Compare predicted flood depth</button><button disabled={busy} aria-pressed={state.view?.question === 'evidence'} onClick={() => void run('evidence')}>Show supporting records & units</button></div><p>Preset questions exercise a deterministic selector. No live model or natural-language query generation.</p></section>
    <div className={'okn-status ' + (state.source?.mode === 'fallback' ? 'okn-warning' : '')} role="status" aria-live="polite">{busy ? 'Loading and validating public query results…' : state.source ? <><strong>{state.source.mode === 'live' ? 'LIVE QUERY RESULT' : state.source.mode === 'fallback' ? 'LIVE FAILED · SNAPSHOT FALLBACK' : 'REPRODUCIBLE SNAPSHOT'}</strong><span>Retrieved {state.source.retrievedAt} · {state.rows?.length ?? 0} rows</span>{state.source.problem && <span>{state.source.problem}</span>}</> : 'Preparing example…'}</div>
    {error && <p role="alert" className="okn-error">{error} {state.view ? 'The previous result below has not been refreshed.' : ''}</p>}
    <div className="okn-flow"><section><span className="okn-step">2 · QUERY & DATA</span><strong>UFOKN named graph</strong><p>Feature → prediction → quantity<br/>Raw strings + source identities retained</p></section><span aria-hidden="true">→</span><section><span className="okn-step">3 · SEMANTICS & HINTS</span><strong>Depth · metre · feature</strong><p>Derived SOSA/QUDT graph<br/>Local shapes check structure, not truth</p></section><span aria-hidden="true">→</span><section><span className="okn-step">4 · SCRIPTED VIEW CHOICE</span><strong>{state.view?.kind === 'table' ? 'EvidenceTable' : 'ComparisonChart'}</strong><p>{state.reason ?? 'Waiting for results…'}</p></section></div>
    <section className="okn-result" aria-busy={busy}><span className="okn-step">5 · REGISTERED COMPONENT · COPILOTKIT / AG-UI</span>{call ? render({ toolCall: call, toolMessage: result }) : <p>Opening the example…</p>}</section>
    <section className="okn-boundary"><strong>Mapping is explicit, not native endpoint vocabulary.</strong><p>The source uses Schema.org and a QUDT quantity-kind URL stored as text. Our derived graph uses SOSA + QUDT. Source timestamps stay literal: no timezone, phenomenon time or result-production time is invented. These are model predictions, not measured flood observations.</p></section>
    {state.query && <details className="okn-inspector"><summary>Inspect query, raw bindings, hints, view specification & derived graph</summary><div className="okn-inspector-grid"><section><h3>Fixed read-only query</h3><p><a href="https://apps.okn.us/">OKN query service</a><br/><code>{state.endpoint}</code><br/><code>{state.graph}</code></p><pre>{state.query}</pre><small>Query SHA-256: {state.queryHash}</small><h3>Public raw bindings</h3><pre>{JSON.stringify(state.rows?.map(r => r.raw), null, 2)}</pre></section><section><h3>Prototype-owned presentation hints</h3><pre>{JSON.stringify(state.hints, null, 2)}</pre><h3>Validated view specification</h3><pre>{JSON.stringify(state.view, null, 2)}</pre><h3>Derived SOSA / QUDT graph</h3><p>{state.validation} SOSA typing is a proposed interpretation of a prediction evaluation, not a source assertion.</p><pre>{state.derivedGraph}</pre><h3>Recent AG-UI events</h3><pre>{events.join('\n')}</pre></section></div></details>}
    </main><footer className="okn-footer">Small exploratory adapter · public snapshot + bounded live query · read-only <a href="/">Original forms</a></footer></div>;
}
export async function bootOkn() {
  const agent = new HttpAgent({ agentId: 'default', url: location.origin + '/api/okn/agent', initialState: {} });
  createRoot(document.getElementById('root')!).render(<CopilotKitProvider agents__unsafe_dev_only={{ default: agent }} enableInspector={false} showIntelligenceIndicator={false}><Okn/></CopilotKitProvider>);
}
