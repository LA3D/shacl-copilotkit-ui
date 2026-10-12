import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { HttpAgent } from '@ag-ui/client';
const url = 'http://127.0.0.1:4173';
const initial = await (await fetch(url + '/api/bootstrap')).json();
const agent = new HttpAgent({ url: url + '/api/agent', initialState: initial });
const events = [], results = [];
agent.subscribe({ onRunStartedEvent: ({ event }) => { events.push(event.type); },
  onStateSnapshotEvent: ({ event }) => { events.push(event.type); },
  onStateDeltaEvent: ({ event }) => { events.push(event.type); },
  onToolCallEndEvent: ({ event }) => { events.push(event.type); },
  onRunFinishedEvent: ({ event }) => { events.push(event.type); } });
await agent.runAgent({ forwardedProps: { command: 'open' } });
assert(events.includes('STATE_SNAPSHOT')); assert(events.includes('TOOL_CALL_END'));
assert(agent.messages.some(m => m.role === 'assistant' && m.toolCalls?.some(t => t.function.name === 'show_record')));
results.push('HttpAgent consumes SSE snapshot and registered-form tool call');
await agent.runAgent({ forwardedProps: { command: 'propose' } });
assert(events.includes('STATE_DELTA'));
assert.equal(agent.state.draft['https://example.org/shui-demo/title'][0].value, 'Prepare a community field visit');
results.push('RFC 6902 state delta changes the draft');
agent.setState({ ...agent.state, draft: { ...agent.state.draft, 'https://example.org/shui-demo/title': [] } });
await agent.runAgent({ forwardedProps: { command: 'review' } });
assert.equal(agent.state.validation.conforms, false);
assert.equal(agent.state.validation.errors[0].message, 'Title is required.');
results.push('Client-edited shared state reaches server and returns field feedback');
await agent.runAgent({ forwardedProps: { command: 'cancel' } });
assert.deepEqual(agent.state.draft, initial.draft);
assert.equal(agent.state.saveCount, initial.saveCount);
results.push('Cancel restores base with no save');
const badOrigin = await fetch(url + '/api/agent', { method: 'POST', headers: { Origin: 'https://example.org', 'Content-Type': 'application/json' }, body: '{}' });
assert.equal(badOrigin.status, 403); results.push('Cross-origin write rejected');
const source = await fetch(url + '/server/http.mjs'); assert.equal(source.status, 404);
results.push('Server source and store are outside served static files');
await fs.writeFile(new URL('../evidence/transport-checks.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), passed: results.length, failed: 0, results, events }, null, 2));
console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
