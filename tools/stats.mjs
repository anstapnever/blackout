// Real numbers for the post text: meshes, triangles, instances, what the city is made of.
import { serve, launch, openFilm } from './env.mjs';

const srv = await serve();
const browser = await launch();
try {
  const { page } = await openFilm(browser, srv.url, 'scale=0.25&fx=0');
  const rep = await page.evaluate(async () => {
    const F = window.FILM, ctx = F.ctx;
    await F.renderFrame(600);
    const scene = ctx.scene;
    let meshes = 0, tris = 0, inst = 0;
    const big = [];
    scene.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      const g = o.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3;
      const n = o.isInstancedMesh ? o.count : 1;
      tris += t * n;
      if (o.isInstancedMesh) { inst += n; big.push([o.name || o.parent?.name || '?', n]); }
    });
    big.sort((a, b) => b[1] - a[1]);
    const land = ctx.land || {};
    return { frames: F.FRAMES, shots: F.SHOTS.length, meshes, tris: Math.round(tris), inst, big: big.slice(0, 15), landKeys: Object.keys(land).slice(0, 40), houses: land.houses?.length ?? land.houseCount ?? land.stats ?? null };
  });
  console.log(JSON.stringify(rep, null, 1));
} finally {
  await browser.close();
  srv.close();
}
