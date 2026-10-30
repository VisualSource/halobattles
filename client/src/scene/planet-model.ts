import * as THREE from "three";
import { canvasTexture, haloRing, random, rgb } from "./ring";

// A map Planet's 3D model, shared by the galaxy map and the planet icon
// worker, so it touches no DOM.

export const PLANET_RADIUS = 12;
export const UNSEEN = "#4b5563";

// Cloud-band tones after the menu's gas giant: one palette per Planet Type,
// picked by the type's id, so a Mod's new types get one too.
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

/** A map Planet's model: a gas giant, or a Halo ring. */
export const planetModel = (p: {
  id: string;
  type: string;
  model?: "planet" | "ring";
}) => (p.model === "ring" ? ringPlanet(p.id) : gasGiant(p.id, p.type));

/**
 * A small gas giant after the menu's: cloud bands in its Planet Type's
 * palette, seeded by its id, under an atmosphere that shows its owner.
 */
function gasGiant(id: string, type: string) {
  const rnd = random(hash(id) || 1);
  const tones = PALETTES[hash(type) % PALETTES.length] ?? [];
  const bands = canvasTexture(256, 128, (g) => {
    let y = 0;
    while (y < 128) {
      const h = 6 + rnd() * 14;
      g.fillStyle = rgb(tones[Math.floor(rnd() * tones.length)] ?? [0, 0, 0]);
      g.fillRect(0, y, 256, h + 1);
      y += h;
    }
    g.fillStyle = "rgba(20,30,40,0.35)"; // a storm
    g.beginPath();
    g.ellipse(40 + rnd() * 176, 30 + rnd() * 68, 16, 6, 0, 0, Math.PI * 2);
    g.fill();
  });
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS, 32, 20),
    new THREE.MeshStandardMaterial({ map: bands, roughness: 1 }),
  );
  mesh.rotation.z = 0.2; // a slight axial tilt
  const atmosphere = glow(id);
  mesh.userData.planet = id;
  mesh.add(atmosphere);
  return { mesh, atmosphere, tint: [mesh.material] };
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
