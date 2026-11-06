// Saves the panel's distance-field fonts, so a headset does not have to build them on every load.
// With the dev server up:  npx @iwsdk/cli browser run tools/bake-fonts.mjs --timeout 100000
import fs from 'node:fs';

const FILES = ['BigShoulders-Medium', 'BigShoulders-Bold', 'BigShouldersStencil-Bold', 'BigShouldersStencil-Black', 'SchibstedGrotesk-Medium', 'SchibstedGrotesk-SemiBold'];

export default async function run({ page, frame }) {
  let target = frame ?? page;
  for (const f of page.frames()) {
    if (await f.evaluate(() => typeof globalThis.setpiece !== 'undefined').catch(() => false)) target = f;
  }
  fs.mkdirSync('public/ui/fonts/baked', { recursive: true });
  for (const name of FILES) {
    const baked = await target.evaluate(async (file) => {
      const { TTFLoader } = await import('/node_modules/.vite/deps/@pmndrs_uikit.js');
      // The app sends TTFs to the baked files, so this asks the generator itself.
      const loader = new TTFLoader();
      const buffers = await loader._loadFontFiles([{ url: `/ui/fonts/${file}.ttf` }]);
      const all = await loader._generate(buffers, [{ url: file }]);
      const info = Object.values(Object.values(all)[0])[0];
      const bytes = new Uint8Array(await (await fetch(info.pages[0])).arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      return { png: btoa(binary), info: JSON.stringify({ ...info, pages: ['PAGE'] }) };
    }, name);
    fs.writeFileSync(`public/ui/fonts/baked/${name}.png`, Buffer.from(baked.png, 'base64'));
    fs.writeFileSync(`public/ui/fonts/baked/${name}.json`, baked.info.replace('"PAGE"', `"${name}.png"`));
  }
  return FILES;
}
