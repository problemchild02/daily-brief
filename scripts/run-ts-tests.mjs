// Runs the TypeScript unit tests in tests-ts/ with Node's built-in test runner.
// esbuild (already installed as part of Vite) bundles each test file first; no new
// dependency. Usage: npm run test:ts
import { build } from 'esbuild'
import { readdirSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const dir = 'tests-ts'
const out = join('node_modules', '.cache', 'ts-tests')
mkdirSync(out, { recursive: true })
const files = readdirSync(dir).filter(f => f.endsWith('.test.ts'))
if (!files.length) { console.error('no tests found'); process.exit(1) }
const outfiles = []
for (const f of files) {
  const outfile = join(out, f.replace(/\.ts$/, '.mjs'))
  await build({ entryPoints: [join(dir, f)], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error' })
  outfiles.push(resolve(outfile))
}
const r = spawnSync(process.execPath, ['--test', ...outfiles], { stdio: 'inherit' })
process.exit(r.status ?? 1)
