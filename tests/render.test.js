import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Compile JSX for server-render smoke checks without opening network ports.
const outDir = mkdtempSync(join(tmpdir(), 'bidwave-render-'));
try {
  await build({
    configFile: false, plugins: [react()], logLevel: 'error',
    ssr: { noExternal: true },
    build: { ssr: 'tests/render-entry.jsx', outDir, emptyOutDir: false, rollupOptions: { output: { entryFileNames: 'render.mjs' } } },
  });
  await import(pathToFileURL(join(outDir, 'render.mjs')).href);
} finally { rmSync(outDir, { recursive: true, force: true }); }
