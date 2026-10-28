import * as THREE from "three";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type {
  Battle,
  Battlefield,
  ControlPoint,
  Side,
  Squad,
  Volley,
} from "../match/store";

/** Movement between two sim ticks: one tick, in ms. */
const TICK_MS = 200;
const TRACER_MS = 250;
const FOG = 0.6; // how dark unseen cells are

export type BattlefieldLook = {
  /** A Terrain id's placeholder colour. */
  terrainColour: (id: string) => string;
  /** Each side's colour. */
  sideColour: Record<Side, string>;
  /** Your side: its squads' Sight clears the fog. */
  you: Side;
  /** How far a squad sees, in cells, standing at its height level. */
  sight: (sq: Squad, height: number) => number;
  /** Whether a squad flies: drawn as a triangle. */
  flies: (sq: Squad) => boolean;
  /** How near a squad must be to a Control Point, in cells. */
  captureRadius: number;
  /** Sim ticks to take a Control Point. */
  captureTicks: number;
};

type Token = {
  mesh: THREE.Mesh;
  label: CSS2DObject;
  prev: THREE.Vector2; // where the move before this one started: it shapes the curve
  from: THREE.Vector2;
  to: THREE.Vector2;
  t0: number;
};

type Marker = {
  disc: THREE.Mesh;
  ring: THREE.Mesh;
  arc: THREE.Mesh;
  label: CSS2DObject;
  progress: number;
};

/** Control Points by index, as the Battle window names them. */
export const POINT_NAMES = "ABCDEFGH";

type Effect = { obj: THREE.Line | THREE.Mesh; t0: number; ms: number };

/**
 * A point k of the way from `from` to `to` on a Catmull-Rom-style curve:
 * it leaves `from` heading the way the move before was going, from `prev`,
 * so a turn is a bend rather than a corner. Drawing only: the server keeps
 * every squad on the grid, so this never changes where one is.
 */
function curve(
  prev: THREE.Vector2,
  from: THREE.Vector2,
  to: THREE.Vector2,
  k: number,
) {
  const k2 = k * k;
  const k3 = k2 * k;
  // Hermite basis, with tangents (to - prev) / 2 at the start and (to - from) at the end.
  const a = 2 * k3 - 3 * k2 + 1;
  const b = k3 - 2 * k2 + k;
  const c = -2 * k3 + 3 * k2;
  const d = k3 - k2;
  return new THREE.Vector2(
    a * from.x + b * (to.x - prev.x) * 0.5 + c * to.x + d * (to.x - from.x),
    a * from.y + b * (to.y - prev.y) * 0.5 + c * to.y + d * (to.y - from.y),
  );
}

/** A cell's centre in world space: x right, y up, so a row goes down. */
const centre = (x: number, y: number) => new THREE.Vector2(x + 0.5, -(y + 0.5));

/**
 * A Battle seen from straight above: Terrain shaded by height, the fog
 * outside your side's Sight, Control Points as rings, squads as tokens with
 * their counts, and tracers for fire. Squads glide between sim ticks. It
 * pans by drag and zooms with the wheel, never rotating.
 */
export class BattlefieldScene {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly labels = new CSS2DRenderer();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(
    -1,
    1,
    1,
    -1,
    0.1,
    100,
  );
  private readonly observer: ResizeObserver;
  private readonly fog: THREE.DataTexture;
  private readonly tokens = new Map<number, Token>();
  private readonly markers: Marker[] = [];
  private readonly effects: Effect[] = [];
  private readonly shapes = {
    unit: new THREE.CircleGeometry(0.42, 24),
    air: new THREE.CircleGeometry(0.48, 3),
    building: new THREE.PlaneGeometry(0.8, 0.8),
  };
  private readonly still = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  private frame = 0;
  private readonly centre: THREE.Vector2;
  private zoom = 1; // 1 shows the whole map; smaller is closer
  private fit = 1; // world units top to bottom that show the whole map
  private drag: { x: number; y: number } | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly field: Battlefield,
    private readonly look: BattlefieldLook,
  ) {
    this.scene.background = new THREE.Color("#04070a");
    this.camera.position.z = 50;
    this.centre = new THREE.Vector2(field.width / 2, -field.height / 2);

    this.scene.add(this.terrain());
    this.fog = new THREE.DataTexture(
      new Uint8Array(field.width * field.height * 4),
      field.width,
      field.height,
    );
    this.fog.magFilter = THREE.LinearFilter;
    const fogPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(field.width, field.height),
      new THREE.MeshBasicMaterial({
        map: this.fog,
        transparent: true,
        depthWrite: false,
      }),
    );
    fogPlane.position.set(field.width / 2, -field.height / 2, 0.5);
    fogPlane.renderOrder = 2;
    this.scene.add(fogPlane);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.style.display = "block";
    this.labels.domElement.style.position = "absolute";
    this.labels.domElement.style.inset = "0";
    this.labels.domElement.style.pointerEvents = "none";
    container.append(this.renderer.domElement, this.labels.domElement);

    const canvas = this.renderer.domElement;
    canvas.style.touchAction = "none";
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    for (const t of this.tokens.values()) t.label.element.remove();
    for (const m of this.markers) m.label.element.remove();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry.dispose();
        const material = obj.material as THREE.MeshBasicMaterial;
        material.map?.dispose();
        material.dispose();
      }
    });
    for (const g of Object.values(this.shapes)) g.dispose();
    this.renderer.dispose();
    // Free the WebGL context now: browsers cap how many can be open.
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }

  /** The Battle as your side sees it now: squads, points and fog. */
  update(battle: Battle) {
    const now = performance.now();
    const seen = new Set<number>();
    for (const sq of battle.squads) {
      seen.add(sq.id);
      const at = centre(sq.x, sq.y);
      let t = this.tokens.get(sq.id);
      if (!t) {
        t = this.token(sq, at);
        this.tokens.set(sq.id, t);
      } else if (!t.to.equals(at)) {
        t.prev.copy(t.from);
        t.from.set(t.mesh.position.x, t.mesh.position.y);
        t.to.copy(at);
        t.t0 = now;
      }
      t.label.element.textContent = String(sq.count);
      t.label.element.style.opacity = sq.count < sq.start ? "0.85" : "1";
    }
    for (const [id, t] of this.tokens) {
      if (seen.has(id)) continue;
      this.scene.remove(t.mesh);
      t.mesh.remove(t.label);
      t.label.element.remove();
      (t.mesh.material as THREE.Material).dispose();
      this.tokens.delete(id);
    }
    this.drawPoints(battle.points);
    this.drawFog(battle.squads);
  }

  /** A tick's fire: a tracer from each shooter you can see to its target. */
  fire(volleys: Volley[]) {
    const now = performance.now();
    for (const v of volleys) {
      const target = this.tokens.get(v.target);
      if (!target) continue;
      const actor = v.actor ? this.tokens.get(v.actor) : undefined;
      if (actor) {
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(actor.mesh.position.x, actor.mesh.position.y, 1),
            new THREE.Vector3(
              target.mesh.position.x,
              target.mesh.position.y,
              1,
            ),
          ]),
          new THREE.LineBasicMaterial({
            color: (actor.mesh.material as THREE.MeshBasicMaterial).color,
            transparent: true,
          }),
        );
        this.scene.add(line);
        this.effects.push({ obj: line, t0: now, ms: TRACER_MS });
      }
      if (v.hits > 0) {
        // A flash where the hits land; bigger when it kills.
        const flash = new THREE.Mesh(
          new THREE.RingGeometry(0.45, v.kills > 0 ? 0.75 : 0.6, 20),
          new THREE.MeshBasicMaterial({ color: "#ffd27a", transparent: true }),
        );
        flash.position.set(target.mesh.position.x, target.mesh.position.y, 1.1);
        this.scene.add(flash);
        this.effects.push({ obj: flash, t0: now, ms: TRACER_MS * 1.5 });
      }
    }
  }

  private terrain() {
    const { width: w, height: h, terrain, heights, terrains } = this.field;
    const colours = terrains.map(
      (id) => new THREE.Color(this.look.terrainColour(id)),
    );
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const c = (colours[terrain[i] ?? 0] ?? new THREE.Color()).clone();
        c.offsetHSL(0, 0, 0.07 * (heights[i] ?? 0) - ((x + y) % 2 ? 0.015 : 0));
        const o = ((h - 1 - y) * w + x) * 4; // texture rows run bottom up
        data[o] = c.r * 255;
        data[o + 1] = c.g * 255;
        data[o + 2] = c.b * 255;
        data[o + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, w, h);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    plane.position.set(w / 2, -h / 2, 0);
    return plane;
  }

  private token(sq: Squad, at: THREE.Vector2): Token {
    const shape = sq.building
      ? this.shapes.building
      : this.look.flies(sq)
        ? this.shapes.air
        : this.shapes.unit;
    const mesh = new THREE.Mesh(
      shape,
      new THREE.MeshBasicMaterial({ color: this.look.sideColour[sq.side] }),
    );
    mesh.position.set(at.x, at.y, this.look.flies(sq) ? 1.2 : 1);
    mesh.renderOrder = 3;
    const el = document.createElement("div");
    el.className =
      "rounded-sm bg-black/70 px-1 font-mono text-[10px] leading-tight text-white";
    const label = new CSS2DObject(el);
    label.center.set(0.5, -0.4);
    mesh.add(label);
    this.scene.add(mesh);
    return {
      mesh,
      label,
      prev: at.clone(),
      from: at.clone(),
      to: at.clone(),
      t0: 0,
    };
  }

  /**
   * Each Control Point: its capture area filled in the holder's colour with
   * a bold rim, its letter, and an arc of the taker's colour for capture
   * progress. Drawn over the fog, since points are always visible.
   */
  private drawPoints(points: ControlPoint[]) {
    const r = this.look.captureRadius + 0.5;
    const material = (opacity: number) =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
      });
    points.forEach((p, i) => {
      let m = this.markers[i];
      if (!m) {
        const at = centre(p.x, p.y);
        const group = new THREE.Group();
        group.position.set(at.x, at.y, 0.8);
        const disc = new THREE.Mesh(
          new THREE.CircleGeometry(r, 48),
          material(0.22),
        );
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(r - 0.3, r, 48),
          material(0.95),
        );
        const arc = new THREE.Mesh(new THREE.BufferGeometry(), material(0.95));
        for (const o of [disc, ring, arc]) {
          o.renderOrder = 2.5; // over the fog, under the squads
          group.add(o);
        }
        const el = document.createElement("div");
        el.className =
          "font-display font-bold text-base text-white [text-shadow:0_0_4px_#000,0_0_2px_#000]";
        el.textContent = POINT_NAMES[i] ?? "?";
        const label = new CSS2DObject(el);
        group.add(label);
        this.scene.add(group);
        m = { disc, ring, arc, label, progress: 0 };
        this.markers.push(m);
      }
      const owner = this.look.sideColour[p.owner];
      (m.disc.material as THREE.MeshBasicMaterial).color.set(owner);
      (m.ring.material as THREE.MeshBasicMaterial).color.set(owner);
      (m.arc.material as THREE.MeshBasicMaterial).color.set(
        this.look.sideColour[p.taker],
      );
      if (p.progress !== m.progress) {
        m.progress = p.progress;
        const done = Math.min(
          1,
          p.progress / Math.max(1, this.look.captureTicks),
        );
        m.arc.geometry.dispose();
        m.arc.geometry =
          p.progress > 0
            ? new THREE.RingGeometry(
                r + 0.1,
                r + 0.5,
                48,
                1,
                Math.PI / 2,
                -Math.PI * 2 * done,
              )
            : new THREE.BufferGeometry();
      }
    });
  }

  /** Clears the fog within each of your squads' Sight. */
  private drawFog(squads: Squad[]) {
    const { width: w, height: h, heights } = this.field;
    const data = this.fog.image.data as Uint8Array;
    const alpha = new Float32Array(w * h).fill(FOG);
    for (const sq of squads) {
      if (sq.side !== this.look.you) continue;
      const r = this.look.sight(sq, heights[sq.y * w + sq.x] ?? 0);
      for (
        let y = Math.max(0, Math.floor(sq.y - r));
        y <= Math.min(h - 1, sq.y + r);
        y++
      ) {
        for (
          let x = Math.max(0, Math.floor(sq.x - r));
          x <= Math.min(w - 1, sq.x + r);
          x++
        ) {
          if ((x - sq.x) ** 2 + (y - sq.y) ** 2 <= r * r) alpha[y * w + x] = 0;
        }
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        data[((h - 1 - y) * w + x) * 4 + 3] = (alpha[y * w + x] ?? 0) * 255;
      }
    }
    this.fog.needsUpdate = true;
  }

  private tick(t: number) {
    for (const tok of this.tokens.values()) {
      const k = this.still ? 1 : Math.min(1, (t - tok.t0) / TICK_MS);
      const at = curve(tok.prev, tok.from, tok.to, k);
      tok.mesh.position.x = at.x;
      tok.mesh.position.y = at.y;
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      if (!e) continue;
      const k = (t - e.t0) / e.ms;
      const material = e.obj.material as THREE.Material;
      if (k >= 1) {
        this.scene.remove(e.obj);
        e.obj.geometry.dispose();
        material.dispose();
        this.effects.splice(i, 1);
      } else {
        material.opacity = 1 - k;
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.fit = Math.max(this.field.height, this.field.width / (w / h)) * 1.04;
    this.place();
  }

  private place() {
    const aspect =
      this.container.clientWidth / Math.max(1, this.container.clientHeight);
    const half = (this.fit * this.zoom) / 2;
    // Keep the centre over the map.
    this.centre.x = Math.min(Math.max(this.centre.x, 0), this.field.width);
    this.centre.y = Math.min(Math.max(this.centre.y, -this.field.height), 0);
    this.camera.left = this.centre.x - half * aspect;
    this.camera.right = this.centre.x + half * aspect;
    this.camera.top = this.centre.y + half;
    this.camera.bottom = this.centre.y - half;
    this.camera.updateProjectionMatrix();
  }

  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom = Math.min(
      Math.max(this.zoom * Math.exp(e.deltaY * 0.0015), 0.2),
      1,
    );
    this.place();
  };

  private readonly onDown = (e: PointerEvent) => {
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.drag = { x: e.clientX, y: e.clientY };
  };

  private readonly onMove = (e: PointerEvent) => {
    if (!this.drag) return;
    const perPixel = (this.fit * this.zoom) / this.container.clientHeight;
    this.centre.x -= (e.clientX - this.drag.x) * perPixel;
    this.centre.y += (e.clientY - this.drag.y) * perPixel;
    this.drag = { x: e.clientX, y: e.clientY };
    this.place();
  };

  private readonly onUp = () => {
    this.drag = null;
  };
}
