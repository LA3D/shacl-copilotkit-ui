import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { RunAgentInputSchema, EventSchemas } from '@ag-ui/core/schemas';
import { loadProfile } from './rdf.mjs';
import { createService } from './service.mjs';
import { loadPrism, createPrismService } from './prism.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.DEMO_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid demo port');
const host = `127.0.0.1:${port}`, origin = `http://${host}`;
const profile = await loadProfile();
const service = await createService(profile, path.join(root, 'data/demo-store.json'));
const prismService = await createPrismService(await loadPrism(), path.join(root, 'data/prism-store.json'));
await fs.mkdir(path.join(root, 'evidence/prism'), { recursive: true });
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const server = http.createServer(async (req, res) => {
  try {
    if (req.headers.host !== host) return json(res, 403, { error: 'Use the exact loopback URL printed by the server' });
    const url = new URL(req.url, origin);
    if (req.method === 'GET' && url.pathname === '/api/bootstrap') return json(res, 200, service.bootstrap());
    const prismRoute = /^\/api\/prism\/(command|medical)\/(bootstrap|agent)$/.exec(url.pathname);
    if (req.method === 'GET' && prismRoute?.[2] === 'bootstrap') return json(res, 200, prismService.bootstrap(prismRoute[1]));
    if (req.method === 'POST' && (url.pathname === '/api/agent' || prismRoute?.[2] === 'agent')) {
      if (req.headers.origin && req.headers.origin !== origin) return json(res, 403, { error: 'Cross-origin writes rejected' });
      if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'JSON required' });
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 250_000) throw new Error('Request too large'); chunks.push(chunk); }
      const input = RunAgentInputSchema.parse(JSON.parse(Buffer.concat(chunks).toString()));
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Content-Type-Options': 'nosniff' });
      const events = [];
      const emit = event => { EventSchemas.parse(event); events.push(event); res.write(`data: ${JSON.stringify(event)}\n\n`); };
      emit({ type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId, protocolVersion: '1.0' });
      try {
        const state = prismRoute ? await prismService.run(prismRoute[1], input, input.threadId) : await service.run(input, input.threadId);
        if (input.forwardedProps?.command === 'propose') {
          // Actual RFC 6902 state patches consumed by HttpAgent, not simulated UI callbacks.
          emit({ type: 'STATE_DELTA', delta: Object.entries(state).map(([key, value]) => ({ op: 'add', path: '/' + key, value })) });
        } else emit({ type: 'STATE_SNAPSHOT', snapshot: state });
        if (input.forwardedProps?.command === 'open') {
          const toolCallId = randomUUID();
          emit({ type: 'TOOL_CALL_START', toolCallId, toolCallName: prismRoute ? 'show_prism' : 'show_record' });
          emit({ type: 'TOOL_CALL_ARGS', toolCallId, delta: JSON.stringify({ descriptorId: state.descriptor.id }) });
          emit({ type: 'TOOL_CALL_END', toolCallId });
          emit({ type: 'TOOL_CALL_RESULT', toolCallId, messageId: randomUUID(), role: 'tool', content: 'Trusted form ready' });
        }
        emit({ type: 'RUN_FINISHED', threadId: input.threadId, runId: input.runId });
      } catch (error) { emit({ type: 'RUN_ERROR', message: error.message, code: 'DEMO_REJECTED' }); }
      res.end();
      await fs.appendFile(path.join(root, prismRoute ? 'evidence/prism/transport.ndjson' : 'evidence/transport.ndjson'), JSON.stringify({ at: new Date().toISOString(), persona: prismRoute?.[1],
        command: input.forwardedProps?.command, runId: input.runId, ...(prismRoute ? {} : { draft: input.state?.draft }),
        events }) + '\n');
      return;
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.resolve(root, 'dist', relative);
    if (!file.startsWith(path.join(root, 'dist') + path.sep)) return json(res, 404, { error: 'Not found' });
    const bytes = await fs.readFile(file);
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; frame-src 'none'; object-src 'none'; base-uri 'none'" });
    res.end(bytes);
  } catch (error) { if (!res.headersSent) json(res, error.code === 'ENOENT' ? 404 : 400, { error: error.message }); else res.end(); }
});
server.listen(port, '127.0.0.1', () => console.log(`Isolated deterministic demo: ${origin}`));
