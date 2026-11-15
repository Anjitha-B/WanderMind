// Generates types/api.ts from the FastAPI OpenAPI schema.
//
//   npm run generate:api   rewrite types/api.ts
//   npm run check:api      exit 1 if types/api.ts is out of date with the backend
//
// The schema comes from the backend code itself (no server and no .env needed),
// so `uv sync` must have been run in ../backend.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = resolve(frontendDir, '..', 'backend');
const target = join(frontendDir, 'types', 'api.ts');
const check = process.argv.includes('--check');

const HEADER = `// GENERATED FILE. Do not edit.
// Source: the FastAPI OpenAPI schema (backend/app). Regenerate with:
//   npm run generate:api

`;

const workDir = mkdtempSync(join(tmpdir(), 'wandermind-api-'));
try {
  const schema = execFileSync('uv', ['run', '--frozen', 'python', '-m', 'scripts.export_openapi'], {
    cwd: backendDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const schemaFile = join(workDir, 'openapi.json');
  const outFile = join(workDir, 'api.ts');
  writeFileSync(schemaFile, schema);

  const bin = join(frontendDir, 'node_modules', '.bin', 'openapi-typescript');
  execFileSync(bin, [schemaFile, '--output', outFile], {
    cwd: frontendDir,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const generated = HEADER + readFileSync(outFile, 'utf8');

  if (!check) {
    writeFileSync(target, generated);
    console.log('Wrote types/api.ts');
  } else {
    let committed = '';
    try {
      committed = readFileSync(target, 'utf8');
    } catch {
      // A missing file is reported as out of date below.
    }
    if (committed !== generated) {
      console.error('types/api.ts is out of date with the backend. Run: npm run generate:api');
      process.exitCode = 1;
    } else {
      console.log('types/api.ts is up to date');
    }
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
