// Optional browser verification/capture. Requires Playwright separately; no runtime dependency added.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOknService, SNAPSHOT } from '../e2e-demo/server/okn.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'docs/images'); await fs.mkdir(output, { recursive: true });
const videoDir = path.join(root, 'e2e-demo/evidence/okn-video'); await fs.mkdir(videoDir, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const errors = [], checks = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1, recordVideo: { dir: videoDir, size: { width: 1280, height: 960 } } });
const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
const ready = async () => { await page.getByRole('button', { name: 'Run again', exact: true }).waitFor(); await page.waitForFunction(() => !document.querySelector('.okn-source-control button')?.disabled); };
try {
  await page.goto('http://127.0.0.1:4173/?view=okn'); await page.getByRole('heading', { name: 'Predicted flood depth', exact: true }).waitFor(); await ready();
  assert.ok((await page.locator('.okn-status').innerText()).includes('REPRODUCIBLE SNAPSHOT'));
  await page.screenshot({ path: path.join(output, 'okn-comparison.png'), fullPage: true }); checks.push('Snapshot comparison renders three prediction values');
  await page.locator('.okn-result').scrollIntoViewIfNeeded(); await page.waitForTimeout(2200);
  await page.getByRole('button', { name: 'Show supporting records & units', exact: true }).click(); await ready();
  await page.getByRole('heading', { name: 'Records behind the comparison' }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 3);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, 'okn-evidence.png'), fullPage: true }); checks.push('Changed question selects evidence table');
  await page.locator('.okn-result').scrollIntoViewIfNeeded(); await page.waitForTimeout(2200);
  await page.locator('.okn-inspector summary').click();
  await page.locator('.okn-inspector').scrollIntoViewIfNeeded(); await page.waitForTimeout(2200);
  await page.locator('.okn-inspector').screenshot({ path: path.join(output, 'okn-mechanism.png') }); checks.push('Query, raw bindings, hints, view spec and derived RDF visible');
  await page.locator('.okn-inspector summary').click();
  await page.getByRole('button', { name: 'Compare predicted flood depth', exact: true }).click(); await ready();
  await page.getByRole('button', { name: 'Run again', exact: true }).click(); await ready();
  assert.equal(await page.getByRole('heading', { name: 'Predicted flood depth', exact: true }).count(), 1);
  await page.locator('.okn-result').scrollIntoViewIfNeeded(); await page.waitForTimeout(2200); checks.push('Switch back and repeat render one current view');
  await context.close();
  await fs.copyFile(await page.video().path(), path.join(output, 'okn-walkthrough.webm'));
  // Separate test context: simulated failures are never included in the genuine recording/screenshots.
  const testContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await testContext.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://127.0.0.1:4173/?view=okn'); await p.getByRole('heading', { name: 'Predicted flood depth', exact: true }).waitFor();
  await p.waitForFunction(() => !document.querySelector('.okn-source-control button')?.disabled);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); checks.push('390px layout has no page-level horizontal overflow');
  await p.route('**/api/okn/agent', async route => {
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"simulated local transport failure"}' });
  });
  await p.getByRole('button', { name: 'Run again', exact: true }).click();
  await p.getByText('Loading and validating public query results…').waitFor();
  await p.getByRole('alert').waitFor(); checks.push('Loading state and recoverable local transport failure displayed');
  await p.unroute('**/api/okn/agent');
  const empty = structuredClone(SNAPSHOT); empty.result.results.bindings = [];
  let shownState = await createOknService({ snapshot: empty }).run({ forwardedProps: { question: 'evidence', source: 'snapshot' } });
  await p.route('**/api/okn/agent', async route => {
    const input = route.request().postDataJSON(); const toolCallId = 'empty-example';
    const events = [
      { type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId },
      { type: 'STATE_SNAPSHOT', snapshot: shownState },
      { type: 'TOOL_CALL_START', toolCallId, toolCallName: 'show_okn' },
      { type: 'TOOL_CALL_ARGS', toolCallId, delta: JSON.stringify(shownState.view) },
      { type: 'TOOL_CALL_END', toolCallId },
      { type: 'TOOL_CALL_RESULT', toolCallId, messageId: 'empty-result', role: 'tool', content: 'Empty view ready' },
      { type: 'RUN_FINISHED', threadId: input.threadId, runId: input.runId }
    ];
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') });
  });
  await p.getByRole('button', { name: 'Show supporting records & units', exact: true }).click();
  await p.getByText('No matching results. Nothing was substituted or plotted.').waitFor(); checks.push('Empty response shows no fabricated chart or snapshot');
  shownState = await createOknService({ fetchImpl: async () => new Response('', { status: 429 }) }).run({ forwardedProps: { question: 'compare', source: 'live' } });
  await p.getByRole('button', { name: 'Compare predicted flood depth', exact: true }).click();
  await p.getByText('LIVE FAILED · SNAPSHOT FALLBACK', { exact: true }).waitFor();
  assert.ok((await p.locator('.okn-status').innerText()).includes(SNAPSHOT.retrievedAt)); checks.push('Endpoint failure displays dated snapshot fallback warning');
  await testContext.close();
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(root, 'e2e-demo/evidence/okn-browser-checks.json'), JSON.stringify({ at: new Date().toISOString(), checks, pageErrors: errors, recording: 'Genuine snapshot UI; simulated failure/empty tests run in a separate unrecorded context.' }, null, 2));
  console.log(JSON.stringify({ checks, pageErrors: errors }, null, 2));
} finally { await browser.close(); }
