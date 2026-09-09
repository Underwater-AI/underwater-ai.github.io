/**
 * run-tests.mjs — Boot the static server, run the suite against it, shut down.
 * Set BASE_URL to skip the local server and test a deployed origin instead.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || 4173;
const external = !!process.env.BASE_URL;
const base = process.env.BASE_URL || `http://localhost:${PORT}/`;

let server = null;

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

if (!external) {
  server = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PORT: String(PORT) },
  });
  if (!(await waitForServer(base))) {
    server.kill();
    console.error(`server never came up at ${base}`);
    process.exit(1);
  }
}

const suite = spawn(process.execPath, [path.join(ROOT, 'tests', 'site.spec.mjs')], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, BASE_URL: base },
});

suite.on('exit', (code) => {
  server?.kill();
  process.exit(code ?? 1);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server?.kill(); process.exit(1); });
}
