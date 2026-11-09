/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Which commit a page was built from, so a page left open can tell it is out of date.
// The host builds without the git folder, so the build's own time is part of it: every build differs.
const BUILD = (() => {
  const made = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '');
  const hosted = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  if (hosted) return `${hosted}-${made}`;
  try {
    return `${execSync('git rev-parse --short HEAD').toString().trim()}-${made}`;
  } catch {
    return `host-${made}`;
  }
})();

export default defineConfig(({ command }) => ({
  plugins: [
    iwsdkDev(),
    {
      name: 'setpiece-version',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) });
      },
    },
  ],
  define: { __BUILD__: JSON.stringify(command === 'build' ? BUILD : 'dev') },
  server: { host: '0.0.0.0', port: 8081, open: false },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: {
      // The second entry is the script for public/voice-test.html. It keeps a
      // fixed name, because a page in public/ cannot know a hashed one.
      input: ['./index.html', './src/voice-test.ts'],
      output: {
        entryFileNames: (chunk) => (chunk.name === 'voice-test' ? 'voice-test.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  esbuild: { target: 'esnext' },
  // @drawcall/uikitml otherwise pulls a second three/@pmndrs/uikit graph
  // (three@0.185 vs app super-three@0.181). Duplicate Component classes break
  // instanceof checks → "Only pmndrs/uikit components can be added as children".
  resolve: {
    // The panel draws no icons; see src/no-icons.ts.
    alias:
      command === 'build'
        ? [{ find: /^@pmndrs\/uikit-lucide$/, replacement: fileURLToPath(new URL('./src/no-icons.ts', import.meta.url)) }]
        : [],
    dedupe: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
    ],
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
      '@drawcall/uikitml',
    ],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
}));
