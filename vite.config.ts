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
      // The set designer (api/director.ts) is a Vercel function in production. Here the dev server answers for
      // it, with the same code, so the emulator and a headset on the dev server can use it too.
      name: 'setpiece-director-dev',
      apply: 'serve',
      configureServer(server) {
        // The project's own key, kept in .env.local (never committed): SETPIECE_ANTHROPIC_KEY=...
        try {
          process.loadEnvFile('.env.local');
        } catch {
          // No file: the designer uses whatever key the shell has, or answers that it has none.
        }
        // The designer and its voice (api/speak.ts): the same functions Vercel runs, answered here in development.
        for (const name of ['director', 'speak']) server.middlewares.use(`/api/${name}`, async (req, res) => {
          try {
            const handlers = (await server.ssrLoadModule(`/api/${name}.ts`)) as {
              GET: () => Response;
              POST: (request: Request) => Promise<Response>;
            };
            const chunks: Uint8Array[] = [];
            for await (const chunk of req) chunks.push(chunk as Uint8Array);
            const headers = new Headers();
            for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string' && !key.startsWith(':')) headers.set(key, value);
            const post = req.method === 'POST';
            const request = new Request(`https://localhost/api/${name}`, { method: req.method, headers, body: post ? Buffer.concat(chunks) : undefined });
            const response = post ? await handlers.POST(request) : handlers.GET();
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            if (response.body != null) {
              const reader = response.body.getReader();
              for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                res.write(value);
              }
            }
            res.end();
          } catch (error) {
            res.statusCode = 500;
            res.end(`${JSON.stringify({ t: 'error', m: String(error) })}\n`);
          }
        });
      },
    },
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
