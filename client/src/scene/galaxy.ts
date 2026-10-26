import * as THREE from "three";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { GalaxyMap } from "../gen/content";
import type { LocalStore } from "../match/local";
import type { createMatchStore, PlanetView } from "../match/store";

// Player colour comes from Seat order.
const SEAT_COLOURS = ["#3b82f6", "#ef4444", "#22c55e", "#eab308"];
const NEUTRAL = "#9ca3af";
const UNSEEN = "#4b5563";

const TILT = THREE.MathUtils.degToRad(55); // from the horizontal; never changes
const FOV = 45;
// World units per screen pixel at the target, per unit of camera distance.
const PAN_PER_PX = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const MIN_DISTANCE = 150;
const MAX_DISTANCE = 1200;
const PAN_SPEED = 0.8; // of the camera distance per second, for WASD and edges
const EDGE_PX = 20;
const CLICK_SLOP_PX = 5;

type Stores = {
  store: ReturnType<typeof createMatchStore>;
  local: LocalStore;
};

type PlanetObject = {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  label: HTMLDivElement;
};

/**
 * The galaxy map: Planets and Lanes on the XZ plane under a perspective
 * camera at a fixed tilt. It owns no game state; it subscribes to the Match
 * and Local stores and updates three.js objects as they change.
 */
export class GalaxyScene {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly labels = new CSS2DRenderer();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 1, 5000);
  private readonly planets = new Map<string, PlanetObject>();
  private readonly ring: THREE.Mesh;
  private readonly target = new THREE.Vector3();
  private distance = 600;
  private readonly keys = new Set<string>();
  private pointer: { x: number; y: number } | null = null;
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private frame = 0;
  private last = 0;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly map: GalaxyMap,
    private readonly stores: Stores,
  ) {
    this.scene.background = new THREE.Color("#0b1020");
    this.scene.add(new THREE.AmbientLight("#ffffff", 0.6));
    const sun = new THREE.DirectionalLight("#ffffff", 1.2);
    sun.position.set(300, 600, 200);
    this.scene.add(sun);

    this.buildMap();
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(16, 19, 48),
      new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ring);

    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.style.position = "relative";
    this.renderer.domElement.style.display = "block";
    container.append(this.renderer.domElement);
    Object.assign(this.labels.domElement.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
    });
    container.append(this.labels.domElement);

    this.listen();
    this.cleanup.push(
      stores.store.subscribe(() => this.updatePlanets()),
      stores.local.subscribe(() => this.updateSelection()),
    );
    this.updatePlanets();
    this.updateSelection();
    this.resize();
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    for (const off of this.cleanup) off();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
    this.renderer.dispose();
    // Free the WebGL context now: browsers cap how many can be open.
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }

  private buildMap() {
    const positions = new Map(
      this.map.planets.map((p) => [
        p.id,
        new THREE.Vector3(p.position.x, 0, p.position.y),
      ]),
    );

    for (const lane of this.map.lanes) {
      const from = positions.get(lane.from);
      const to = positions.get(lane.to);
      if (!from || !to) continue;
      const slow = lane.type === "slow";
      const material = slow
        ? new THREE.LineDashedMaterial({
            color: "#64748b",
            dashSize: 8,
            gapSize: 6,
          })
        : new THREE.LineBasicMaterial({ color: "#94a3b8" });
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([from, to]),
        material,
      );
      if (slow) line.computeLineDistances();
      this.scene.add(line);
    }

    const box = new THREE.Box3();
    for (const p of this.map.planets) {
      const pos = positions.get(p.id) as THREE.Vector3;
      box.expandByPoint(pos);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(12, 24, 16),
        new THREE.MeshStandardMaterial({ color: UNSEEN }),
      );
      mesh.position.copy(pos);
      mesh.userData.planet = p.id;
      this.scene.add(mesh);

      const label = document.createElement("div");
      Object.assign(label.style, {
        color: "#e5e7eb",
        font: "12px sans-serif",
        textAlign: "center",
        whiteSpace: "nowrap",
        transform: "translateY(-22px)",
      });
      const obj = new CSS2DObject(label);
      obj.position.copy(pos);
      this.scene.add(obj);
      this.planets.set(p.id, { mesh, label });
    }
    box.getCenter(this.target);
  }

  /** Redraws each Planet's colour and label from the current View. */
  private updatePlanets() {
    const view = this.stores.store.getState().view;
    for (const p of this.map.planets) {
      const obj = this.planets.get(p.id);
      if (!obj) continue;
      const seen = view?.planets.get(p.id);
      obj.mesh.material.color.set(colourOf(seen));
      obj.label.replaceChildren(...labelParts(p.name, seen));
    }
  }

  private updateSelection() {
    const id = this.stores.local.getState().selected;
    const obj = id ? this.planets.get(id) : undefined;
    this.ring.visible = !!obj;
    if (obj) this.ring.position.copy(obj.mesh.position);
  }

  private listen() {
    const canvas = this.renderer.domElement;
    const on = <K extends keyof HTMLElementEventMap>(
      el: HTMLElement | Window,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
    ) => {
      el.addEventListener(type, fn as EventListener);
      this.cleanup.push(() =>
        el.removeEventListener(type, fn as EventListener),
      );
    };

    // Left button only: right-click is for orders.
    on(canvas, "pointerdown", (e) => {
      if (e.button !== 0) return;
      this.drag = { x: e.clientX, y: e.clientY, moved: false };
      canvas.setPointerCapture(e.pointerId);
    });
    on(canvas, "pointermove", (e) => {
      const rect = canvas.getBoundingClientRect();
      this.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (Math.hypot(dx, dy) > CLICK_SLOP_PX) this.drag.moved = true;
      if (!this.drag.moved) return;
      // Move the map with the pointer: screen pixels to world units at the target.
      const scale = (this.distance * PAN_PER_PX) / rect.height;
      this.target.x -= dx * scale;
      this.target.z -= (dy * scale) / Math.sin(TILT);
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    });
    on(canvas, "pointerup", (e) => {
      if (e.button !== 0) return;
      if (this.drag && !this.drag.moved) this.select(e);
      this.drag = null;
    });
    on(canvas, "pointercancel", () => {
      this.drag = null;
    });
    on(canvas, "pointerleave", () => {
      this.pointer = null;
    });
    on(canvas, "wheel", (e) => {
      e.preventDefault();
      this.distance = THREE.MathUtils.clamp(
        this.distance * Math.exp(e.deltaY * 0.001),
        MIN_DISTANCE,
        MAX_DISTANCE,
      );
    });
    on(window, "keydown", (e) => {
      if (isTyping(e.target)) return;
      this.keys.add(e.key.toLowerCase());
    });
    on(window, "keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    on(window, "blur", () => this.keys.clear());

    const observer = new ResizeObserver(() => this.resize());
    observer.observe(this.container);
    this.cleanup.push(() => observer.disconnect());
  }

  /** Left-click selects the Planet under the pointer, or clears it. */
  private select(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const meshes = [...this.planets.values()].map((p) => p.mesh);
    const hit = ray.intersectObjects(meshes)[0];
    this.stores.local.setState({
      selected: (hit?.object.userData.planet as string | undefined) ?? null,
    });
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private tick(now: number) {
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 0;
    this.last = now;
    this.pan(dt);
    // A fixed tilt and heading: the camera only ever moves, never rotates.
    this.camera.position.set(
      this.target.x,
      this.target.y + this.distance * Math.sin(TILT),
      this.target.z + this.distance * Math.cos(TILT),
    );
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  /** WASD and edge-scroll. */
  private pan(dt: number) {
    let x = 0;
    let z = 0;
    if (this.keys.has("a")) x -= 1;
    if (this.keys.has("d")) x += 1;
    if (this.keys.has("w")) z -= 1;
    if (this.keys.has("s")) z += 1;
    if (this.pointer && !this.drag) {
      const { clientWidth: w, clientHeight: h } = this.container;
      if (this.pointer.x < EDGE_PX) x -= 1;
      if (this.pointer.x > w - EDGE_PX) x += 1;
      if (this.pointer.y < EDGE_PX) z -= 1;
      if (this.pointer.y > h - EDGE_PX) z += 1;
    }
    const step = this.distance * PAN_SPEED * dt;
    this.target.x += Math.sign(x) * step;
    this.target.z += Math.sign(z) * step;
  }
}

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function colourOf(p: PlanetView | undefined) {
  if (!p) return UNSEEN;
  return p.owner === null
    ? NEUTRAL
    : (SEAT_COLOURS[p.owner % SEAT_COLOURS.length] ?? NEUTRAL);
}

/** Name, owner colour, unit-count badge, Locked icon and construction pip. */
function labelParts(name: string, p: PlanetView | undefined) {
  const nameEl = document.createElement("div");
  nameEl.textContent = name;
  if (!p) {
    nameEl.style.opacity = "0.5"; // outside vision: no dynamic details
    return [nameEl];
  }
  const info = document.createElement("div");
  const swatch = document.createElement("span");
  Object.assign(swatch.style, {
    display: "inline-block",
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: colourOf(p),
    marginRight: "4px",
  });
  const units = p.stacks.flat().reduce((n, s) => n + s.count, 0);
  info.append(swatch, `${units}`);
  if (p.locked) info.append(" 🔒");
  if (p.queue.length > 0) info.append(" 🔨"); // only ever on your own Planets
  return [nameEl, info];
}
