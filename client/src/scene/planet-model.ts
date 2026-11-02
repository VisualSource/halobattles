import * as THREE from "three";
import type { MapPlanet } from "../gen/content";
import { canvasTexture, haloRing, random } from "./ring";

// A map Planet's 3D model, shared by the galaxy map and the planet icon
// worker, so it touches no DOM.

export const PLANET_RADIUS = 12;
export const UNSEEN = "#4b5563";

// Cloud-band tones after the menu's gas giant. Each Planet picks one by its
// own id and shifts it a little, so a map's Planets don't all look alike.
const PALETTES = [
  [
    [92, 168, 170],
    [58, 124, 140],
    [140, 200, 188],
    [44, 98, 118],
    [80, 150, 132],
  ],
  [
    [196, 160, 98],
    [150, 112, 64],
    [222, 196, 140],
    [120, 86, 52],
    [176, 136, 80],
  ],
  [
    [150, 110, 160],
    [104, 76, 120],
    [186, 150, 190],
    [76, 56, 96],
    [128, 96, 140],
  ],
  [
    [170, 120, 96],
    [130, 84, 70],
    [200, 160, 130],
    [96, 64, 56],
    [150, 104, 84],
  ],
  [
    [110, 140, 190],
    [76, 104, 150],
    [150, 180, 220],
    [56, 78, 120],
    [96, 124, 170],
  ],
];

/** A stable number from a string: the same id always looks the same. */
export const hash = (s: string) =>
  [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7) >>> 0;

type Model = {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  atmosphere: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  tint: THREE.MeshStandardMaterial[]; // dimmed while out of vision
};

/**
 * A map Planet's model: the one its map names, a Halo ring or a style, or
 * else a style picked by its id, so the same Planet always looks the same.
 */
export const planetModel = (p: Pick<MapPlanet, "id" | "model">): Model => {
  if (p.model === "ring") return ringPlanet(p.id);
  const rnd = random(hash(p.id) || 1);
  const picked = styleFor(rnd); // drawn either way, so a named style keeps the colours it had
  return (p.model && p.model !== "planet" ? STYLES[p.model][1] : picked)(
    p.id,
    rnd,
  );
};

/** A style, picked by rnd and its weight. */
export function styleFor(rnd: () => number) {
  const styles = Object.values(STYLES);
  let pick = rnd() * styles.reduce((n, [w]) => n + w, 0);
  for (const [w, style] of styles) {
    pick -= w;
    if (pick < 0) return style;
  }
  return gasGiant;
}

/**
 * Every style a map can name, keyed as the schema names them, and how often
 * each comes up when a Planet's look is picked by its id.
 */
const STYLES: Record<
  Exclude<NonNullable<MapPlanet["model"]>, "planet" | "ring">,
  [number, (id: string, rnd: () => number) => Model]
> = {
  gasGiant: [2, gasGiant],
  ringedGiant: [2, ringedGiant],
  terrestrial: [3, terrestrial],
  barren: [2, barren],
  ice: [1.5, ice],
  lava: [1.5, lava],
  desert: [2, desert],
};

/**
 * One Planet's colour shift, from rnd: its hue turned up to 25° either way,
 * its saturation up to a quarter, and its lightness a little.
 */
function shifter(rnd: () => number) {
  const turn = (rnd() - 0.5) * (50 / 360);
  const sat = 0.75 + rnd() * 0.5;
  const light = (rnd() - 0.5) * 0.12;
  const c = new THREE.Color();
  const hsl = { h: 0, s: 0, l: 0 };
  return ([r = 0, g = 0, b = 0]: number[]) => {
    c.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace).getHSL(
      hsl,
      THREE.SRGBColorSpace,
    );
    c.setHSL(
      (hsl.h + turn + 1) % 1,
      Math.min(1, hsl.s * sat),
      Math.min(0.9, Math.max(0.1, hsl.l + light)),
      THREE.SRGBColorSpace,
    );
    return c.getStyle(THREE.SRGBColorSpace);
  };
}

/** A gas giant's band tones: a palette picked by rnd, shifted. */
export function planetTones(rnd: () => number): string[] {
  const palette = PALETTES[Math.floor(rnd() * PALETTES.length)] ?? [];
  const shift = shifter(rnd);
  return palette.map((c) => shift(c));
}

/** An ellipse on a 256-wide map texture, drawn again across its seam. */
function blob(
  g: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
) {
  for (const dx of [-256, 0, 256]) {
    g.beginPath();
    g.ellipse(x + dx, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  }
}

/** A jagged line on a map texture: a crack or a fissure. */
function crack(g: OffscreenCanvasRenderingContext2D, rnd: () => number) {
  let x = rnd() * 256;
  let y = 10 + rnd() * 108;
  g.beginPath();
  g.moveTo(x, y);
  for (let k = 0; k < 6; k++) {
    x += (rnd() - 0.3) * 30;
    y += (rnd() - 0.5) * 20;
    g.lineTo(x, y);
  }
  g.stroke();
}

/** The Planet's globe, with its owner's atmosphere; every hit counts as it. */
function globe(
  id: string,
  map: THREE.Texture,
  extra: THREE.MeshStandardMaterialParameters = {},
): Model {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS, 32, 20),
    new THREE.MeshStandardMaterial({ map, roughness: 1, ...extra }),
  );
  mesh.rotation.z = 0.2; // a slight axial tilt
  const atmosphere = glow(id);
  mesh.userData.planet = id;
  mesh.add(atmosphere);
  return { mesh, atmosphere, tint: [mesh.material] };
}

/** Adds a layer (clouds, a ring) that's tinted and picked with the Planet. */
function layer(
  m: Model,
  id: string,
  obj: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>,
) {
  obj.userData.planet = id;
  m.mesh.add(obj);
  m.tint.push(obj.material);
}

/**
 * A small gas giant after the menu's: cloud bands in its own tones under
 * an atmosphere that shows its owner.
 */
function gasGiant(id: string, rnd: () => number) {
  const tones = planetTones(rnd);
  const bands = canvasTexture(256, 128, (g) => {
    let y = 0;
    while (y < 128) {
      const h = 6 + rnd() * 14;
      g.fillStyle = tones[Math.floor(rnd() * tones.length)] ?? "#000";
      g.fillRect(0, y, 256, h + 1);
      y += h;
    }
    g.fillStyle = "rgba(20,30,40,0.35)"; // a storm
    g.beginPath();
    g.ellipse(40 + rnd() * 176, 30 + rnd() * 68, 16, 6, 0, 0, Math.PI * 2);
    g.fill();
  });
  return globe(id, bands);
}

/** A gas giant with a ring, kept inside a Halo ring's width so icons fit it. */
function ringedGiant(id: string, rnd: () => number) {
  const m = gasGiant(id, rnd);
  const shift = shifter(rnd);
  // RingGeometry maps a square texture flat across it: draw the bands round its middle.
  const bands = canvasTexture(256, 256, (g) => {
    for (let r = 128; r > 70; r -= 2 + rnd() * 4) {
      g.fillStyle = shift([200, 186, 160]);
      g.globalAlpha = 0.25 + rnd() * 0.6;
      g.beginPath();
      g.arc(128, 128, r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1; // the hole is cut clean
    g.globalCompositeOperation = "destination-out";
    g.beginPath();
    g.arc(128, 128, 70, 0, Math.PI * 2);
    g.fill();
  });
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(PLANET_RADIUS * 1.25, PLANET_RADIUS * 1.6, 64),
    new THREE.MeshStandardMaterial({
      map: bands,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 1,
    }),
  );
  ring.rotation.x = Math.PI / 2 - 0.3;
  layer(m, id, ring);
  return m;
}

/** Oceans and continents, polar caps, and a layer of cloud. */
function terrestrial(id: string, rnd: () => number) {
  const shift = shifter(rnd);
  const lands = [
    shift([74, 118, 62]),
    shift([128, 112, 72]),
    shift([96, 136, 76]),
  ];
  const surface = canvasTexture(256, 128, (g) => {
    g.fillStyle = shift([34, 82, 136]);
    g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 5 + rnd() * 3; i++) {
      const cx = rnd() * 256;
      const cy = 28 + rnd() * 72;
      g.fillStyle = lands[i % lands.length] ?? "#000";
      for (let j = 0; j < 9; j++)
        blob(
          g,
          cx + (rnd() - 0.5) * 56,
          cy + (rnd() - 0.5) * 30,
          5 + rnd() * 13,
          3 + rnd() * 8,
        );
    }
    g.fillStyle = "#e6edf2"; // polar caps
    g.fillRect(0, 0, 256, 5 + rnd() * 6);
    g.fillRect(0, 122 - rnd() * 6, 256, 12);
  });
  const m = globe(id, surface);
  const sky = canvasTexture(256, 128, (g) => {
    g.fillStyle = "rgba(255,255,255,0.55)";
    for (let i = 0; i < 22; i++)
      blob(g, rnd() * 256, 12 + rnd() * 104, 8 + rnd() * 18, 2 + rnd() * 4);
  });
  layer(
    m,
    id,
    new THREE.Mesh(
      new THREE.SphereGeometry(PLANET_RADIUS * 1.03, 32, 20),
      new THREE.MeshStandardMaterial({
        map: sky,
        transparent: true,
        depthWrite: false,
        roughness: 1,
      }),
    ),
  );
  return m;
}

/** Grey rock pocked with craters. */
function barren(id: string, rnd: () => number) {
  const shift = shifter(rnd);
  const surface = canvasTexture(256, 128, (g) => {
    g.fillStyle = shift([128, 120, 112]);
    g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 30; i++) {
      const x = rnd() * 256;
      const y = 8 + rnd() * 112;
      const r = 2 + rnd() * 9;
      g.fillStyle = "rgba(255,255,255,0.14)"; // the rim
      blob(g, x + 1, y + 1, r + 1.5, r * 0.8 + 1.5);
      g.fillStyle = "rgba(0,0,0,0.28)"; // the floor
      blob(g, x, y, r, r * 0.8);
    }
  });
  return globe(id, surface);
}

/** Sand in wavy dunes, with dark rock mesas and pale salt flats. */
function desert(id: string, rnd: () => number) {
  const shift = shifter(rnd);
  const surface = canvasTexture(256, 128, (g) => {
    g.fillStyle = shift([206, 164, 104]);
    g.fillRect(0, 0, 256, 128);
    // Dunes: waves round the globe, a whole number across so they meet at the seam.
    for (let y = 4; y < 128; y += 5 + rnd() * 5) {
      g.strokeStyle =
        rnd() < 0.5 ? "rgba(255,240,210,0.22)" : "rgba(90,56,24,0.18)";
      g.lineWidth = 1.5 + rnd() * 2;
      const waves = 2 + Math.floor(rnd() * 4);
      const height = 1.5 + rnd() * 3;
      const phase = rnd() * Math.PI * 2;
      g.beginPath();
      for (let x = 0; x <= 256; x += 4) {
        const wy =
          y + Math.sin((x / 256) * waves * Math.PI * 2 + phase) * height;
        if (x === 0) g.moveTo(x, wy);
        else g.lineTo(x, wy);
      }
      g.stroke();
    }
    g.fillStyle = shift([120, 82, 52]); // mesas
    for (let i = 0; i < 7; i++)
      blob(g, rnd() * 256, 16 + rnd() * 96, 3 + rnd() * 7, 2 + rnd() * 4);
    g.fillStyle = "rgba(245,238,222,0.55)"; // salt flats
    for (let i = 0; i < 3; i++)
      blob(g, rnd() * 256, 20 + rnd() * 88, 6 + rnd() * 10, 3 + rnd() * 5);
  });
  return globe(id, surface);
}

/** Pale ice, cracked. */
function ice(id: string, rnd: () => number) {
  const shift = shifter(rnd);
  const surface = canvasTexture(256, 128, (g) => {
    g.fillStyle = shift([196, 222, 234]);
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 12; i++)
      blob(g, rnd() * 256, rnd() * 128, 10 + rnd() * 24, 4 + rnd() * 10);
    g.strokeStyle = shift([92, 140, 170]);
    g.lineWidth = 1;
    for (let i = 0; i < 14; i++) crack(g, rnd);
  });
  return globe(id, surface, { roughness: 0.55 });
}

/** Dark rock split by glowing fissures. The glow reuses the surface, so it's freed with it. */
function lava(id: string, rnd: () => number) {
  const shift = shifter(rnd);
  const surface = canvasTexture(256, 128, (g) => {
    g.fillStyle = shift([46, 36, 34]);
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = shift([255, 120, 40]);
    g.lineCap = "round";
    for (let i = 0; i < 16; i++) {
      g.lineWidth = 1 + rnd() * 2.5;
      crack(g, rnd);
    }
  });
  return globe(id, surface, {
    emissive: "#ff7a2e",
    emissiveMap: surface,
    emissiveIntensity: 0.9,
  });
}
/** The atmosphere that shows a Planet's owner. */
function glow(id: string) {
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS * 1.35, 32, 20),
    new THREE.MeshBasicMaterial({
      color: UNSEEN,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  // Hits on the glow count as the Planet: a bigger target to click or drop on.
  atmosphere.userData.planet = id;
  return atmosphere;
}

/**
 * A Planet drawn as a Halo ring, the menu's own, in place of a gas giant.
 * An unseen sphere stands in for the Planet, so picking, dropping and the
 * owner's glow work as for any other. The tilt is on that sphere: the map
 * spins it about its own axis, so the ring turns in its plane, no wobble.
 */
function ringPlanet(id: string) {
  const atmosphere = glow(id);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS, 16, 12),
    new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  mesh.rotation.set(0.35, 0, 0.2); // leans a little, like the menu's
  const ring = haloRing(
    random(hash(id) || 1),
    PLANET_RADIUS * 1.3,
    PLANET_RADIUS * 0.35,
  );
  const tint: THREE.MeshStandardMaterial[] = [];
  ring.traverse((o) => {
    if (o instanceof THREE.Mesh) tint.push(o.material);
  });
  mesh.userData.planet = id;
  mesh.add(ring, atmosphere);
  return { mesh, atmosphere, tint };
}
