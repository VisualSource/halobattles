import * as THREE from "three";

// The menu's backdrop: a Halo ring in front of a gas giant, with the camera
// slowly orbiting. Everything is fixed in the world; only the camera moves.

const R = 100; // ring radius
const W = 9; // band width
const SUN = new THREE.Vector3(-0.55, 0.32, 0.77).normalize();
// About 130° around from the sun, so the two are never in view together.
const PLANET = new THREE.Vector3(-0.26, 0.2, -0.97).multiplyScalar(3000);
const PLANET_RADIUS = 900;
const STAR_DISTANCE = 8000;

/** A seeded generator, so the backdrop looks the same every visit. */
export function random(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

export function canvasTexture(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  // biome-ignore lint/style/noNonNullAssertion: a fresh canvas always has a 2d context
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export const rgb = (c: number[]) => `rgb(${c.join(",")})`;

export class RingScene {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 1, 20000);
  private readonly planet: THREE.Mesh;
  private readonly observer: ResizeObserver;
  private frame = 0;
  private last = 0;
  private t = 40; // seconds into the flight path

  constructor(private readonly container: HTMLElement) {
    const rnd = random(20261027);
    this.scene.background = new THREE.Color("#04070a");
    this.scene.add(new THREE.AmbientLight("#8899aa", 0.35));
    const sunlight = new THREE.DirectionalLight("#fff1dc", 3);
    sunlight.position.copy(SUN).multiplyScalar(1000);
    this.scene.add(sunlight);

    this.scene.add(this.stars(rnd), this.sunGlow(), this.ring(rnd));
    this.planet = this.gasGiant(rnd);
    this.scene.add(this.planet);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.style.display = "block";
    container.append(this.renderer.domElement);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.place();
      this.renderer.render(this.scene, this.camera);
    } else {
      this.frame = requestAnimationFrame((t) => this.tick(t));
    }
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.scene.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh ||
        obj instanceof THREE.Points ||
        obj instanceof THREE.Sprite
      ) {
        obj.geometry.dispose();
        const material = obj.material as THREE.Material & {
          map?: THREE.Texture | null;
        };
        material.map?.dispose();
        material.dispose();
      }
    });
    this.renderer.dispose();
    // Free the WebGL context now: browsers cap how many can be open.
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private stars(rnd: () => number) {
    const positions: number[] = [];
    const colours: number[] = [];
    for (let i = 0; i < 1500; i++) {
      const z = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      positions.push(
        r * Math.cos(a) * STAR_DISTANCE,
        z * STAR_DISTANCE,
        r * Math.sin(a) * STAR_DISTANCE,
      );
      const b = 0.25 + rnd() * 0.75;
      colours.push(0.86 * b, 0.9 * b, b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colours, 3),
    );
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 1.5,
        sizeAttenuation: false,
        vertexColors: true,
      }),
    );
  }

  private sunGlow() {
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: canvasTexture(256, 256, (g) => {
          const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
          grad.addColorStop(0, "rgba(255,226,180,1)");
          grad.addColorStop(0.08, "rgba(255,200,140,0.35)");
          grad.addColorStop(1, "rgba(255,200,140,0)");
          g.fillStyle = grad;
          g.fillRect(0, 0, 256, 256);
        }),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.position.copy(SUN).multiplyScalar(STAR_DISTANCE * 0.9);
    glow.scale.setScalar(STAR_DISTANCE);
    return glow;
  }

  /** The band: land, sea and cloud inside, metal hull outside, bright rims. */
  private ring(rnd: () => number) {
    const land = [
      [58, 108, 70],
      [44, 92, 132],
      [124, 110, 78],
      [72, 118, 84],
      [36, 80, 120],
    ];
    const segments = 260;
    const surface = canvasTexture(2048, 32, (g) => {
      const step = 2048 / segments;
      for (let i = 0; i < segments; i++) {
        const n = (Math.sin(i * 0.09) + Math.sin(i * 0.037 + 2.1) + 2) / 4;
        const c =
          land[Math.min(land.length - 1, Math.floor(n * land.length))] ?? [];
        const cloud = rnd() < 0.18 ? 0.35 + rnd() * 0.3 : 0;
        g.fillStyle = rgb(c.map((v) => Math.round(v + (235 - v) * cloud)));
        g.fillRect(i * step, 0, step + 1, 32);
      }
    });
    const band = new THREE.CylinderGeometry(R, R, W, segments, 1, true);
    const group = new THREE.Group();
    group.add(
      new THREE.Mesh(
        band,
        new THREE.MeshStandardMaterial({
          map: surface,
          side: THREE.BackSide,
          roughness: 0.9,
        }),
      ),
      new THREE.Mesh(
        band.clone(),
        new THREE.MeshStandardMaterial({
          color: "#5c6670",
          metalness: 0.6,
          roughness: 0.5,
        }),
      ),
    );
    for (const y of [-W / 2, W / 2]) {
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(R, 0.45, 6, segments),
        new THREE.MeshStandardMaterial({
          color: "#c8d6e4",
          metalness: 0.8,
          roughness: 0.35,
        }),
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = y;
      group.add(rim);
    }
    group.rotation.set(0.38, 0, 0.22, "ZYX");
    return group;
  }

  /** Teal cloud bands by latitude, a storm, and a thin atmosphere. */
  private gasGiant(rnd: () => number) {
    const tones = [
      [92, 168, 170],
      [58, 124, 140],
      [140, 200, 188],
      [44, 98, 118],
      [80, 150, 132],
      [36, 80, 104],
      [120, 186, 176],
    ];
    const bands = canvasTexture(1024, 512, (g) => {
      let y = 0;
      while (y < 512) {
        const h = 15 + rnd() * 36;
        g.fillStyle = rgb(tones[Math.floor(rnd() * tones.length)] ?? [0, 0, 0]);
        g.fillRect(0, y, 1024, h + 1);
        y += h;
      }
      g.fillStyle = "rgba(28,70,96,0.6)";
      g.beginPath();
      g.ellipse(640, 330, 70, 26, 0, 0, Math.PI * 2);
      g.fill();
    });
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(PLANET_RADIUS, 96, 48),
      new THREE.MeshStandardMaterial({ map: bands, roughness: 1 }),
    );
    planet.position.copy(PLANET);
    planet.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0.15, 1, 0.1).normalize(),
    );
    planet.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(PLANET_RADIUS * 1.03, 64, 32),
        new THREE.MeshBasicMaterial({
          color: "#a0e6f0",
          transparent: true,
          opacity: 0.12,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    );
    return planet;
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** The flight path: around the ring and through its plane, looking in. */
  private place() {
    const t = this.t;
    const orbit = t * 0.045;
    const dist = R * (1.7 + 0.3 * Math.sin(t * 0.06));
    this.camera.position.set(
      dist * Math.cos(orbit),
      R * 0.42 * Math.sin(t * 0.035 + 0.6),
      dist * Math.sin(orbit),
    );
    this.camera.lookAt(
      R * 0.3 * Math.cos(orbit + 1.4),
      -R * 0.05,
      R * 0.3 * Math.sin(orbit + 1.4),
    );
  }

  private tick(now: number) {
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 0;
    this.last = now;
    this.t += dt;
    this.planet.rotateY(dt * 0.004); // the clouds creep, barely
    this.place();
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }
}
