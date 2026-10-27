import * as THREE from "three";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { GalaxyMap } from "../gen/content";
import type { LocalStore } from "../match/local";
import { type Lanes, route } from "../match/route";
import type { Army, createMatchStore, PlanetView } from "../match/store";
import { formatAge } from "../match/time";

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

type Orders = {
  lanes: Lanes;
  /** A Stack dropped on another Planet: send it all there as an Army. */
  sendStack: (from: string, stack: number, to: string) => void;
  /** An Army dropped on a Planet: re-order it there. */
  moveArmy: (army: number, to: string) => void;
};

/** What's being dragged to a Planet: a Stack, or an Army (from its `to`). */
type Dragged = { from: string; stack?: number; army?: number };

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
  private readonly armies = new Map<number, THREE.Mesh>();
  private readonly preview: THREE.Line;
  private readonly ring: THREE.Mesh;
  private readonly target = new THREE.Vector3();
  private distance = 600;
  private readonly keys = new Set<string>();
  private pointer: { x: number; y: number } | null = null;
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private ordering:
    | (Dragged & { x: number; y: number; moved: boolean })
    | null = null;
  private frame = 0;
  private last = 0;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly map: GalaxyMap,
    private readonly stores: Stores,
    private readonly orders: Orders,
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
    this.preview = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: "#facc15" }),
    );
    this.scene.add(this.preview);

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
      stores.store.subscribe(() => {
        this.updatePlanets();
        this.updateArmies();
        this.updateSelection();
      }),
      stores.local.subscribe((st, prev) => {
        if (st.lastSeen !== prev.lastSeen) this.updatePlanets();
        this.updateSelection();
      }),
    );
    // Last-seen labels show their age, so they're redrawn once a second.
    const ages = setInterval(() => this.updatePlanets(), 1000);
    this.cleanup.push(() => clearInterval(ages));
    this.updatePlanets();
    this.updateArmies();
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
    const { lastSeen, clockOffset } = this.stores.local.getState();
    const now = performance.now() + clockOffset;
    for (const p of this.map.planets) {
      const obj = this.planets.get(p.id);
      if (!obj) continue;
      const seen = view?.planets.get(p.id);
      const last = seen ? undefined : lastSeen.get(p.id);
      obj.mesh.material.color.set(last ? UNSEEN : colourOf(seen));
      const mine = seen?.owner === view?.you && !seen?.locked;
      const parts = labelParts(
        p.name,
        seen ?? last?.planet,
        mine ? (stack, e) => this.startOrder({ from: p.id, stack }, e) : null,
      );
      if (last) {
        // Out of vision: what was last seen there, greyed, with its age.
        for (const el of parts.slice(1)) el.style.opacity = "0.5";
        const age = document.createElement("div");
        age.textContent = `seen ${formatAge(now - last.seenAt)} ago`;
        age.style.opacity = "0.5";
        parts.push(age);
      }
      obj.label.replaceChildren(...parts);
    }
  }

  /** Adds and removes Army markers; tick() places them. */
  private updateArmies() {
    const armies = this.stores.store.getState().view?.armies ?? new Map();
    for (const [id, mesh] of this.armies) {
      if (armies.has(id)) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.armies.delete(id);
    }
    for (const a of armies.values()) {
      if (this.armies.has(a.id)) continue;
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(6, 14, 12),
        new THREE.MeshStandardMaterial({ color: seatColour(a.owner) }),
      );
      mesh.userData.army = a.id;
      this.armies.set(a.id, mesh);
      this.scene.add(mesh);
    }
  }

  /** The selection ring, the selected Army, and the route preview. */
  private updateSelection() {
    const { selected, selectedArmy, hovered } = this.stores.local.getState();
    const obj = selected ? this.planets.get(selected) : undefined;
    this.ring.visible = !!obj;
    if (obj) this.ring.position.copy(obj.mesh.position);
    for (const [id, mesh] of this.armies) {
      mesh.scale.setScalar(id === selectedArmy ? 1.6 : 1);
    }

    // Preview the route what's being dragged would take to the hovered Planet.
    const view = this.stores.store.getState().view;
    const dragged = this.ordering?.moved ? this.ordering : null;
    const army =
      dragged?.army === undefined ? undefined : view?.armies.get(dragged.army);
    const from = dragged?.from;
    const path =
      view && from && hovered
        ? route(
            this.orders.lanes,
            (id) => view.planets.get(id)?.owner === view.you,
            from,
            hovered,
          )?.path
        : undefined;
    const points = (path ?? [])
      .map((id) => this.planets.get(id)?.mesh.position.clone().setY(2))
      .filter((p) => p !== undefined);
    // A moving Army's preview starts where it is now, mid-Lane.
    const start = army && !army.waiting && this.armies.get(army.id)?.position;
    if (start && points.length > 0) points.unshift(start.clone().setY(2));
    this.preview.geometry.setFromPoints(points.length > 1 ? points : []);
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

    // Left button only. Pressing your own Army drags it; anything else pans.
    on(canvas, "pointerdown", (e) => {
      if (e.button !== 0) return;
      const view = this.stores.store.getState().view;
      const id = this.hit(e, [...this.armies.values()])?.userData.army as
        | number
        | undefined;
      const army = id === undefined ? undefined : view?.armies.get(id);
      if (army && army.owner === view?.you) {
        this.startOrder({ from: army.to, army: army.id }, e);
        return;
      }
      this.drag = { x: e.clientX, y: e.clientY, moved: false };
      canvas.setPointerCapture(e.pointerId);
    });
    // An order drag can start on a Stack chip, so it's tracked on the window.
    on(window, "pointermove", (e) => {
      const o = this.ordering;
      if (!o) return;
      if (Math.hypot(e.clientX - o.x, e.clientY - o.y) > CLICK_SLOP_PX) {
        o.moved = true;
        canvas.style.cursor = "grabbing";
      }
      const hovered = this.planetAt(e);
      if (hovered !== this.stores.local.getState().hovered) {
        this.stores.local.setState({ hovered });
      } else this.updateSelection();
    });
    on(window, "pointerup", (e) => {
      const o = this.ordering;
      if (!o || e.button !== 0) return;
      this.ordering = null;
      canvas.style.cursor = "";
      const to = this.planetAt(e);
      if (!o.moved) {
        // A click, not a drag: select what was pressed.
        this.stores.local.setState(
          o.army === undefined
            ? { selected: o.from, selectedArmy: null }
            : { selected: null, selectedArmy: o.army },
        );
      } else if (to && o.army !== undefined) this.orders.moveArmy(o.army, to);
      else if (to && o.stack !== undefined && to !== o.from) {
        this.orders.sendStack(o.from, o.stack, to);
      }
      this.updateSelection();
    });
    on(canvas, "pointermove", (e) => {
      const rect = canvas.getBoundingClientRect();
      this.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const hovered = this.planetAt(e);
      if (hovered !== this.stores.local.getState().hovered) {
        this.stores.local.setState({ hovered });
      }
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
      this.stores.local.setState({ hovered: null });
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
      if (e.key === "Escape") {
        this.ordering = null;
        canvas.style.cursor = "";
        this.stores.local.setState({ selected: null, selectedArmy: null });
        return;
      }
      this.keys.add(e.key.toLowerCase());
    });
    on(window, "keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    on(window, "blur", () => this.keys.clear());

    const observer = new ResizeObserver(() => this.resize());
    observer.observe(this.container);
    this.cleanup.push(() => observer.disconnect());
  }

  /** Left-click selects the Army or Planet under the pointer, or clears it. */
  private select(e: PointerEvent) {
    const army = this.hit(e, [...this.armies.values()])?.userData.army as
      | number
      | undefined;
    this.stores.local.setState({
      selected: army === undefined ? this.planetAt(e) : null,
      selectedArmy: army ?? null,
    });
  }

  private startOrder(d: Dragged, e: PointerEvent) {
    e.preventDefault(); // no text selection or native drag
    this.ordering = { ...d, x: e.clientX, y: e.clientY, moved: false };
  }

  private planetAt(e: MouseEvent): string | null {
    const meshes = [...this.planets.values()].map((p) => p.mesh);
    return (this.hit(e, meshes)?.userData.planet as string | undefined) ?? null;
  }

  private hit(e: MouseEvent, objects: THREE.Object3D[]) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    return ray.intersectObjects(objects)[0]?.object;
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
    this.placeArmies();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  /** Lerps each Army along its hop by Match Time; a waiting one hovers at `to`. */
  private placeArmies() {
    const view = this.stores.store.getState().view;
    if (!view) return;
    const now = performance.now() + this.stores.local.getState().clockOffset;
    for (const [id, mesh] of this.armies) {
      const a = view.armies.get(id);
      const from = a && this.planets.get(a.from)?.mesh.position;
      const to = a && this.planets.get(a.to)?.mesh.position;
      if (!a || !to) continue;
      if (a.waiting || !from) {
        mesh.position.copy(to).add(ORBIT);
        continue;
      }
      mesh.position.lerpVectors(from, to, progress(a, now)).setY(10);
    }
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

const ORBIT = new THREE.Vector3(18, 10, -18);

export const seatColour = (seat: number) =>
  SEAT_COLOURS[seat % SEAT_COLOURS.length] ?? NEUTRAL;

/** How far along its hop an Army is, from 0 to 1. */
export function progress(a: Army, now: number) {
  const span = a.arrives - a.departed;
  return span > 0 ? THREE.MathUtils.clamp((now - a.departed) / span, 0, 1) : 1;
}

function colourOf(p: PlanetView | undefined) {
  if (!p) return UNSEEN;
  return p.owner === null ? NEUTRAL : seatColour(p.owner);
}

/**
 * Name, owner colour, Locked icon, construction pip, and a chip per Stack
 * with its unit count. onStackDown makes your own non-empty chips draggable.
 */
function labelParts(
  name: string,
  p: PlanetView | undefined,
  onStackDown: ((stack: number, e: PointerEvent) => void) | null,
) {
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
  info.append(swatch);
  if (p.locked) info.append(" 🔒");
  if (p.queue.length > 0) info.append(" 🔨"); // only ever on your own Planets

  const chips = document.createElement("div");
  Object.assign(chips.style, {
    display: "flex",
    gap: "2px",
    justifyContent: "center",
  });
  p.stacks.forEach((stack, i) => {
    const units = stack.reduce((n, s) => n + s.count, 0);
    const chip = document.createElement("div");
    chip.textContent = units ? `${units}` : "–";
    chip.title = `Stack ${i + 1}: ${units} units`;
    Object.assign(chip.style, {
      minWidth: "18px",
      padding: "0 3px",
      border: `1px solid ${colourOf(p)}`,
      borderRadius: "3px",
      background: "#0b1020cc",
    });
    if (units && onStackDown) {
      // The label layer ignores the pointer; a chip takes it back to be dragged.
      chip.style.pointerEvents = "auto";
      chip.style.cursor = "grab";
      chip.addEventListener("pointerdown", (e) => {
        if (e.button === 0) onStackDown(i, e);
      });
    }
    chips.append(chip);
  });
  return [nameEl, info, chips];
}
