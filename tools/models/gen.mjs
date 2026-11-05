// Writes the base Mod's low-poly unit models (mods/base/assets/models/*.glb),
// each built from simple shapes: `node tools/models/gen.mjs` from the repo root.
// A model faces +z with the ground at y 0, a cell 1 unit wide. Faction colours
// are vertex colours; the parts in the side's colour are a second primitive
// whose material is named trim. warthog.glb is made elsewhere and kept as is.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "../../client/node_modules/three/build/three.module.js";

const PAL = {
  unsc: {
    base: "#6f7d4c",
    base2: "#83925a",
    dark: "#3a4130",
    metal: "#8d949a",
    gun: "#2e3338",
    glass: "#d6a548",
  },
  cov: {
    base: "#6e4d96",
    base2: "#8462ad",
    dark: "#3a2a56",
    metal: "#a49bb6",
    gun: "#4b3d63",
    glass: "#7fd8ff",
    skin: "#8a7c6c",
    glow: "#a8ecff",
  },
};
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const P = (geom, role, pos, rot = [0, 0, 0]) => ({ geom, role, pos, rot });

export const MODELS = {
  marine: {
    pal: "unsc",
    parts: () => [
      P(box(0.05, 0.14, 0.06), "dark", [-0.035, 0.085, 0]),
      P(box(0.05, 0.14, 0.06), "dark", [0.035, 0.085, 0]),
      P(box(0.056, 0.03, 0.085), "dark", [-0.035, 0.015, 0.01]),
      P(box(0.056, 0.03, 0.085), "dark", [0.035, 0.015, 0.01]),
      P(box(0.13, 0.12, 0.08), "base", [0, 0.21, 0]),
      P(box(0.11, 0.07, 0.02), "base2", [0, 0.22, 0.045]),
      P(box(0.09, 0.08, 0.035), "dark", [0, 0.215, -0.055]),
      P(box(0.055, 0.035, 0.075), "trim", [-0.087, 0.262, 0]),
      P(box(0.055, 0.035, 0.075), "trim", [0.087, 0.262, 0]),
      P(box(0.035, 0.1, 0.04), "dark", [-0.087, 0.2, 0.012]),
      P(box(0.035, 0.1, 0.04), "dark", [0.087, 0.2, 0.012]),
      P(box(0.08, 0.075, 0.085), "base", [0, 0.31, 0]),
      P(box(0.064, 0.03, 0.012), "glass", [0, 0.312, 0.046]),
      P(box(0.025, 0.032, 0.17), "gun", [0.045, 0.19, 0.085]),
    ],
  },
  scorpion: {
    pal: "unsc",
    parts: () => [
      ...[
        [-1, 1],
        [1, 1],
        [-1, -1],
        [1, -1],
      ].flatMap(([x, z]) => [
        P(box(0.09, 0.08, 0.17), "dark", [x * 0.15, 0.05, z * 0.14]),
        P(box(0.095, 0.012, 0.15), "trim", [x * 0.15, 0.096, z * 0.14]),
      ]),
      P(box(0.24, 0.09, 0.44), "base", [0, 0.1, 0]),
      P(box(0.24, 0.05, 0.08), "base2", [0, 0.125, 0.205], [0.5, 0, 0]),
      P(box(0.185, 0.015, 0.185), "trim", [0, 0.152, -0.03]),
      P(box(0.18, 0.07, 0.18), "base", [0, 0.192, -0.03]),
      P(box(0.12, 0.03, 0.08), "base2", [0, 0.235, -0.05]),
      P(
        cyl(0.016, 0.016, 0.24, 6),
        "metal",
        [0, 0.195, 0.18],
        [Math.PI / 2, 0, 0],
      ),
      P(
        cyl(0.024, 0.024, 0.04, 6),
        "gun",
        [0, 0.195, 0.3],
        [Math.PI / 2, 0, 0],
      ),
      P(box(0.03, 0.03, 0.07), "gun", [0.06, 0.26, -0.03]),
    ],
  },
  grunt: {
    pal: "cov",
    parts: () => [
      P(box(0.045, 0.06, 0.05), "dark", [-0.045, 0.03, 0]),
      P(box(0.045, 0.06, 0.05), "dark", [0.045, 0.03, 0]),
      P(box(0.16, 0.12, 0.12), "base", [0, 0.12, 0], [0.2, 0, 0]),
      P(box(0.13, 0.05, 0.02), "base2", [0, 0.13, 0.065], [0.2, 0, 0]),
      P(box(0.08, 0.06, 0.07), "skin", [0, 0.185, 0.06]),
      P(box(0.06, 0.034, 0.02), "glass", [0, 0.175, 0.1]),
      P(box(0.12, 0.12, 0.06), "trim", [0, 0.205, -0.07], [0.2, 0, 0]),
      P(cyl(0.014, 0.014, 0.05, 6), "glass", [-0.04, 0.29, -0.09]),
      P(cyl(0.014, 0.014, 0.05, 6), "glass", [0.04, 0.29, -0.09]),
      P(box(0.035, 0.07, 0.04), "skin", [-0.1, 0.1, 0.03]),
      P(box(0.035, 0.07, 0.04), "skin", [0.1, 0.1, 0.03]),
      P(box(0.04, 0.03, 0.065), "gun", [0.1, 0.075, 0.08]),
    ],
  },
  // Aircraft: y 0 is the height they fly at.
  banshee: {
    pal: "cov",
    parts: () => [
      P(box(0.09, 0.07, 0.24), "base", [0, 0, -0.01]),
      P(cyl(0, 0.05, 0.1, 6), "base2", [0, 0, 0.16], [Math.PI / 2, 0, 0]),
      P(box(0.05, 0.03, 0.08), "glass", [0, 0.045, 0.04]),
      P(box(0.13, 0.02, 0.05), "dark", [-0.095, 0, -0.03]),
      P(box(0.13, 0.02, 0.05), "dark", [0.095, 0, -0.03]),
      ...[-1, 1].flatMap((x) => [
        P(box(0.05, 0.05, 0.22), "base", [x * 0.165, 0, 0]),
        P(box(0.052, 0.052, 0.05), "trim", [x * 0.165, 0, 0.12]),
        P(box(0.03, 0.03, 0.01), "glow", [x * 0.165, 0, -0.112]),
      ]),
      P(box(0.012, 0.05, 0.07), "dark", [0, 0.045, -0.1]),
    ],
  },
};

/** A model's parts as two flat triangle soups: the body, coloured, and the trim. */
export function build(model) {
  const body = { pos: [], col: [] },
    trim = { pos: [] };
  const m = new THREE.Matrix4(),
    c = new THREE.Color();
  for (const p of model.parts()) {
    const g = p.geom.toNonIndexed();
    m.compose(
      new THREE.Vector3(...p.pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rot)),
      new THREE.Vector3(1, 1, 1),
    );
    g.applyMatrix4(m);
    const a = g.attributes.position.array;
    if (p.role === "trim") {
      trim.pos.push(...a);
      continue;
    }
    body.pos.push(...a);
    c.set(PAL[model.pal][p.role]); // linear, as glTF's vertex colours are
    for (let i = 0; i < a.length / 3; i++) body.col.push(c.r, c.g, c.b);
  }
  return { body, trim };
}

/** Writes a .glb: one mesh, the body primitive (vertex colours) and the trim one. */
export function writeGlb(file, { body, trim }) {
  const chunks = [],
    views = [],
    accessors = [],
    prims = [];
  let offset = 0;
  const add = (array, type, minmax) => {
    const buf = Buffer.from(new Float32Array(array).buffer);
    views.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: buf.length,
      target: 34962,
    });
    chunks.push(buf);
    offset += buf.length;
    const acc = {
      bufferView: views.length - 1,
      componentType: 5126,
      count: array.length / 3,
      type,
    };
    if (minmax) {
      acc.min = [0, 1, 2].map((k) =>
        Math.min(...array.filter((_, i) => i % 3 === k)),
      );
      acc.max = [0, 1, 2].map((k) =>
        Math.max(...array.filter((_, i) => i % 3 === k)),
      );
    }
    accessors.push(acc);
    return accessors.length - 1;
  };
  const normals = (pos) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals(); // unindexed: each face its own, flat
    return Array.from(g.attributes.normal.array);
  };
  for (const [part, material] of [
    [body, 0],
    [trim, 1],
  ]) {
    if (!part.pos.length) continue;
    const attributes = {
      POSITION: add(part.pos, "VEC3", true),
      NORMAL: add(normals(part.pos), "VEC3"),
    };
    if (part.col) attributes.COLOR_0 = add(part.col, "VEC3");
    prims.push({ attributes, material });
  }
  const json = {
    asset: { version: "2.0", generator: "halobattles tools/models" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: prims }],
    materials: [
      {
        name: "body",
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0,
          roughnessFactor: 0.8,
        },
      },
      {
        name: "trim",
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0,
          roughnessFactor: 0.8,
        },
      },
    ],
    buffers: [{ byteLength: offset }],
    bufferViews: views,
    accessors,
  };
  const pad = (b, fill) =>
    Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
  const jsonBuf = pad(Buffer.from(JSON.stringify(json)), 0x20);
  const bin = pad(Buffer.concat(chunks), 0);
  const header = Buffer.alloc(12);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
  const chunk = (b, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(b.length, 0);
    h.write(type, 4);
    return Buffer.concat([h, b]);
  };
  writeFileSync(
    file,
    Buffer.concat([header, chunk(jsonBuf, "JSON"), chunk(bin, "BIN\0")]),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [id, model] of Object.entries(MODELS)) {
    const mesh = build(model);
    writeGlb(`mods/base/assets/models/${id}.glb`, mesh);
    console.log(id, (mesh.body.pos.length + mesh.trim.pos.length) / 9, "tris");
  }
}
