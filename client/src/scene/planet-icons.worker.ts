import * as THREE from "three";
import { PLANET_RADIUS, planetModel } from "./planet-model";

// Renders map Planets to PNG icons off the main thread: the galaxy map's own
// models and light, seen from its tilt, without the owner's glow.

export type IconRequest = {
  size: number;
  planets: { id: string; type: string; model?: "planet" | "ring" }[];
};
export type IconResult = { id: string; blob: Blob } | { error: string };

addEventListener("message", async (e: MessageEvent<IconRequest>) => {
  const { size, planets } = e.data;
  try {
    const canvas = new OffscreenCanvas(size, size);
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true, // read back after the render
    });
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight("#ffffff", 0.25));
    const sun = new THREE.DirectionalLight("#fff4e0", 2.4);
    sun.position.set(-500, 350, 250);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 1000);
    const tilt = THREE.MathUtils.degToRad(30);
    // Back far enough to fit a Halo ring, the widest model.
    const d = (PLANET_RADIUS * 1.6) / Math.tan(THREE.MathUtils.degToRad(15));
    camera.position.set(0, Math.sin(tilt) * d, Math.cos(tilt) * d);
    camera.lookAt(0, 0, 0);

    for (const p of planets) {
      const { mesh, atmosphere } = planetModel(p);
      atmosphere.visible = false;
      scene.add(mesh);
      renderer.render(scene, camera);
      scene.remove(mesh);
      mesh.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.geometry.dispose();
        for (const m of [o.material].flat()) {
          m.map?.dispose();
          m.dispose();
        }
      });
      const blob = await canvas.convertToBlob({ type: "image/png" });
      postMessage({ id: p.id, blob } satisfies IconResult);
    }
    renderer.dispose();
  } catch (err) {
    // Most likely no WebGL in workers here: the Planets go without icons.
    postMessage({ error: String(err) } satisfies IconResult);
  }
});
