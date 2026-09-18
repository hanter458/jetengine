/**
 * Kucuk TypeScript kosucusu.
 *
 * `tsx` kullanmak yerine esbuild ile tek dosyaya paketleyip node ile
 * calistiriyoruz. Nedeni: tsx, loader'i icin bir unix soketi (IPC) acar;
 * kisitli/sandbox ortamlarda bu engellenir. esbuild tamamen dosya
 * tabanlidir ve her yerde calisir.
 *
 * Kullanim:  node scripts/run.mjs scripts/report.ts [arguman...]
 */

import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const entry = process.argv[2];
if (!entry) {
  console.error('Kullanim: node scripts/run.mjs <dosya.ts> [arguman...]');
  process.exit(1);
}

const outDir = mkdtempSync(join(process.env.BUILD_TMP ?? tmpdir(), 'edf-'));
const outFile = join(outDir, basename(entry).replace(/\.ts$/, '.mjs'));

try {
  await build({
    entryPoints: [resolve(entry)],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: outFile,
    sourcemap: 'inline',
    logLevel: 'warning',
    external: ['esbuild'],
  });
  process.argv = [process.argv[0], outFile, ...process.argv.slice(3)];
  await import(pathToFileURL(outFile).href);
} finally {
  process.on('exit', () => {
    try {
      rmSync(outDir, { recursive: true, force: true });
    } catch {
      /* yoksay */
    }
  });
}
