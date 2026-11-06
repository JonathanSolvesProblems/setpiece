/**
 * The panel's type, made ahead of time. UIKit builds a distance-field font from
 * each TTF in the browser, which on a headset is most of a cold start. These
 * are the same generator's output, saved by tools/bake-fonts.mjs and fetched as
 * two small files. If one cannot be fetched, the TTF route still works.
 *
 * Imported before the engine starts, so the panel's first font already takes this path.
 */
import { TTFLoader } from '@pmndrs/uikit';

const FONT_FILE = /\/fonts\/([^/?#]+)\.ttf/;
const generate = TTFLoader.prototype.loadAsync;

async function loadBaked(ttf: string): Promise<unknown> {
  const name = FONT_FILE.exec(ttf)?.[1];
  if (name == null) return null;
  const file = new URL(`baked/${name}.json`, new URL(ttf, document.baseURI));
  const response = await fetch(file);
  if (!response.ok) return null;
  const info = (await response.json()) as { pages: string[] };
  info.pages = [new URL(info.pages[0], file).href];
  return { baked: { normal: info } };
}

TTFLoader.prototype.loadAsync = async function (input, onProgress) {
  if (typeof input === 'string') {
    try {
      const baked = await loadBaked(input);
      if (baked != null) return baked as Awaited<ReturnType<typeof generate>>;
    } catch {
      // Fall through to building it here.
    }
  }
  return generate.call(this, input, onProgress);
};
