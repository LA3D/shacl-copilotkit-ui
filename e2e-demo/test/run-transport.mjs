// Start a fresh loopback server, exercise the existing transports, and always stop it.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const server = spawn(process.execPath, ['server/http.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
let exited = false;
server.once('exit', () => { exited = true; });
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 15000);
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
    server.stdout.on('data', chunk => {
      process.stdout.write(chunk);
      if (chunk.toString().includes('Isolated deterministic demo:')) { clearTimeout(timeout); resolve(); }
    });
  });
  for (const script of ['test/transport-smoke.mjs', 'test/prism-transport.mjs']) {
    const child = spawn(process.execPath, [script], { stdio: 'inherit' });
    const [code] = await once(child, 'exit');
    if (code !== 0) throw new Error(`${script} failed: ${code}`);
  }
} finally {
  if (!exited) { server.kill('SIGTERM'); await once(server, 'exit'); }
}
