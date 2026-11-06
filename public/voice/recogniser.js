// The worker src/voice.ts starts. It counts the model's bytes as they arrive,
// so the page can show how far the download is, then hands over to the Vosk
// worker beside it, which does the listening. Nothing here runs on the page.

const plainFetch = self.fetch.bind(self);

self.fetch = async (input, init) => {
  const response = await plainFetch(input, init);
  if (!response.ok || response.body == null) return response;
  const total = Number(response.headers.get('Content-Length')) || 0;
  let loaded = 0;
  let told = 0;
  const counted = response.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        // At most ten messages a second, and always the last one.
        const now = performance.now();
        if (now - told > 100 || loaded === total) {
          told = now;
          self.postMessage({ event: 'progress', loaded, total });
        }
        controller.enqueue(chunk);
      },
    }),
  );
  return new Response(counted, { status: response.status, statusText: response.statusText, headers: response.headers });
};

importScripts('vosk-worker.js');
