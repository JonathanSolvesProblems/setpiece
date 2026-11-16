/**
 * The sky behind a set, painted once for each light onto a canvas that wraps a sphere: the high sky down to the
 * horizon and the ground below it, then what gives a place its depth: a sun or a moon where the key light stands,
 * stars after dark, clouds lit by that light, a far skyline or a line of hills, and haze along the horizon. It is a
 * picture, drawn when the light changes and never in a frame, so a sky this full costs a headset nothing to show.
 * The same picture is behind every frame on the board (the lens backdrop) and around a wearer who steps inside.
 *
 * The canvas is laid out as the sphere unwraps: left to right is all the way round, the top edge is straight up,
 * the middle row is the horizon, the bottom edge is straight down.
 */

/** What is painted over the plain sky, for one light. */
export interface SkyArt {
  /** How many stars. */
  stars: number;
  /** The sun or the moon: its disc, its glow, and their sizes as shares of the canvas height. */
  orb: { disc: string; glow: string; size: number; reach: number } | null;
  /** Clouds: how many, their lit and shaded colours as "r,g,b", how solid. */
  clouds: { count: number; lit: string; shade: string; alpha: number } | null;
  /** What stands on the horizon, its colour, and the colour of its lit windows if it has any. */
  far: 'city' | 'hills' | null;
  farColour: string;
  windows: string | null;
  /** Haze along the horizon: its colour as "r,g,b" and how thick. */
  haze: string;
  hazeAlpha: number;
}

export interface SkyColours {
  top: string;
  upper: string;
  horizon: string;
  floor: string;
}

/** Numbers that come out the same every time, so a sky does not change between two paintings of it. */
function dice(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Draws at x and once more a canvas-width to either side, so nothing is cut where the sky wraps round. */
function wrapped(width: number, x: number, reach: number, draw: (at: number) => void): void {
  draw(x);
  if (x - reach < 0) draw(x + width);
  if (x + reach > width) draw(x - width);
}

/**
 * Paints the sky. `sun` is where the key light stands on the stage (x, up, z): the orb is painted in that
 * direction, so the light on the set comes from the sun in its sky.
 */
export function paintSky(canvas: HTMLCanvasElement, colours: SkyColours, art: SkyArt | null, sun: readonly [number, number, number]): void {
  const g = canvas.getContext('2d');
  if (g == null) return;
  const W = canvas.width;
  const H = canvas.height;
  const horizon = H / 2;
  const gradient = g.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, colours.top);
  gradient.addColorStop(0.46, colours.upper);
  gradient.addColorStop(0.5, colours.horizon);
  gradient.addColorStop(1, colours.floor);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = gradient;
  g.fillRect(0, 0, W, H);
  // A canvas too small to hold a picture keeps the plain sky.
  if (art == null || W < 256) return;
  const random = dice(Math.round(W + art.stars * 7 + (art.clouds?.count ?? 0) * 131 + art.hazeAlpha * 1000));

  // Stars, thinning toward the horizon, a few of them bright.
  for (let i = 0; i < art.stars; i++) {
    const x = random() * W;
    const y = random() ** 1.4 * horizon * 0.94;
    const bright = random();
    g.globalAlpha = (0.35 + 0.65 * bright) * (1 - (y / horizon) ** 3);
    g.fillStyle = bright > 0.92 ? '#fff6dc' : '#dfe6ff';
    const size = bright > 0.92 ? H / 420 : H / 760;
    g.fillRect(x, y, Math.max(1, size), Math.max(1, size));
  }
  g.globalAlpha = 1;

  // The sun or the moon, in the direction the key light stands.
  if (art.orb != null) {
    const [sx, sy, sz] = sun;
    const around = (Math.atan2(sz, -sx) / (2 * Math.PI) + 1) % 1;
    const up = Math.atan2(sy, Math.hypot(sx, sz));
    const x = around * W;
    const y = horizon - (up / (Math.PI / 2)) * horizon;
    const reach = art.orb.reach * H;
    wrapped(W, x, reach, (at) => {
      const glow = g.createRadialGradient(at, y, 0, at, y, reach);
      glow.addColorStop(0, art.orb!.glow);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = glow;
      g.fillRect(at - reach, y - reach, reach * 2, reach * 2);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = art.orb!.disc;
      g.beginPath();
      g.arc(at, y, art.orb!.size * H, 0, Math.PI * 2);
      g.fill();
    });
  }

  // Clouds: each a handful of soft puffs, flat underneath and shaded there, lit on top.
  if (art.clouds != null) {
    for (let i = 0; i < art.clouds.count; i++) {
      const x = random() * W;
      const y = horizon * (0.2 + 0.62 * random());
      // Smaller and flatter toward the horizon, as far clouds are.
      const near = 1 - y / horizon;
      const wide = W * (0.035 + 0.06 * random()) * (0.5 + near);
      const tall = H * (0.012 + 0.02 * random()) * (0.5 + near);
      const puffs = 7 + Math.floor(random() * 6);
      const squash = (tall / wide) * 2.4;
      // The shaded underside first, a little lower and wider, then the lit puffs heaped on it.
      for (const [colour, drop, solid] of [
        [art.clouds.shade, 0.45, 0.7],
        [art.clouds.lit, 0, 1],
      ] as const) {
        for (let p = 0; p < puffs; p++) {
          // Bigger toward the middle of the cloud, so it heaps up there and thins at its ends.
          const along = (p + 0.5) / puffs - 0.5;
          const px = x + along * wide * 1.7 + (random() - 0.5) * wide * 0.2;
          const r = wide * (0.2 + 0.26 * (1 - Math.abs(along) * 1.6) + 0.08 * random());
          const py = y - r * squash * 0.35 * (1 - drop) + r * squash * drop;
          wrapped(W, px, r, (at) => {
            g.save();
            g.translate(at, py);
            g.scale(1, squash);
            const puff = g.createRadialGradient(0, 0, 0, 0, 0, r);
            puff.addColorStop(0, `rgba(${colour},1)`);
            puff.addColorStop(0.45, `rgba(${colour},0.8)`);
            puff.addColorStop(1, `rgba(${colour},0)`);
            g.globalAlpha = art.clouds!.alpha * solid;
            g.fillStyle = puff;
            g.beginPath();
            g.arc(0, 0, r, 0, Math.PI * 2);
            g.fill();
            g.restore();
          });
        }
      }
    }
    g.globalAlpha = 1;
  }

  // What stands on the horizon, all the way round: a far city with a few windows lit, or a line of hills.
  g.fillStyle = art.farColour;
  if (art.far === 'city') {
    for (let x = 0; x < W; ) {
      const wide = W * (0.003 + 0.009 * random());
      // Towers come in clusters, with low blocks between them.
      const tall = H * (random() < 0.25 ? 0.035 + 0.07 * random() : 0.008 + 0.03 * random());
      g.fillStyle = art.farColour;
      g.fillRect(x, horizon - tall, wide + 1, tall + H * 0.004);
      if (art.windows != null) {
        g.fillStyle = art.windows;
        const step = Math.max(3, Math.round(H / 300));
        for (let wy = horizon - tall + step; wy < horizon - step; wy += step * 1.6) {
          for (let wx = x + step * 0.6; wx < x + wide - step * 0.6; wx += step * 1.5) {
            if (random() < 0.22) {
              g.globalAlpha = 0.55 + 0.45 * random();
              g.fillRect(wx, wy, step * 0.55, step * 0.7);
            }
          }
        }
        g.globalAlpha = 1;
      }
      x += wide;
    }
  } else if (art.far === 'hills') {
    for (const [height, alpha, a, b] of [
      [0.03, 0.55, 3, 7],
      [0.018, 1, 5, 11],
    ] as const) {
      const lift = random() * 10;
      g.globalAlpha = alpha;
      g.beginPath();
      g.moveTo(0, horizon + H * 0.004);
      for (let x = 0; x <= W; x += W / 256) {
        const turn = (x / W) * Math.PI * 2;
        const rise = (Math.sin(turn * a + lift) * 0.5 + Math.sin(turn * b + lift * 2.3) * 0.3 + Math.sin(turn * (a + b) * 2 + lift) * 0.2) * 0.5 + 0.55;
        g.lineTo(x, horizon - rise * height * H);
      }
      g.lineTo(W, horizon + H * 0.004);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
  }

  // Haze lies along the horizon, over the feet of whatever stands there: distance, as air shows it.
  if (art.hazeAlpha > 0) {
    const band = H * 0.07;
    const haze = g.createLinearGradient(0, horizon - band, 0, horizon + band * 0.5);
    haze.addColorStop(0, `rgba(${art.haze},0)`);
    haze.addColorStop(0.67, `rgba(${art.haze},1)`);
    haze.addColorStop(1, `rgba(${art.haze},0)`);
    g.globalAlpha = art.hazeAlpha;
    g.fillStyle = haze;
    g.fillRect(0, horizon - band, W, band * 1.5);
    g.globalAlpha = 1;
  }
}
