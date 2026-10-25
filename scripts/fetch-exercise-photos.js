// Downloads the exercise photos listed in assets/exercises/sources.json, which the app bundles.
// They are not kept in the repo (the photos are not ours to publish); every build fetches them,
// and fails loudly if one is missing, since a missing file breaks the bundle.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'assets', 'exercises');
const { photos } = JSON.parse(fs.readFileSync(path.join(dir, 'sources.json'), 'utf8'));

async function get(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 2000 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG');
      return buf;
    } catch (e) {
      if (i >= tries) throw new Error(`${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
}

(async () => {
  let fetched = 0;
  for (let i = 0; i < photos.length; i += 8) {
    await Promise.all(
      photos.slice(i, i + 8).map(async (p) => {
        const to = path.join(dir, p.file);
        if (fs.existsSync(to) && fs.statSync(to).size > 2000) return;
        fs.writeFileSync(to, await get(p.url));
        fetched++;
      }),
    );
  }
  const missing = photos.filter((p) => !fs.existsSync(path.join(dir, p.file)));
  if (missing.length) throw new Error(`missing photos: ${missing.map((m) => m.file).join(', ')}`);
  console.log(`exercise photos ready: ${photos.length} (${fetched} downloaded)`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
