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
import { canvasTexture, random, rgb } from "./ring";

// Player colour comes from Seat order.
const SEAT_COLOURS = ["#3b82f6", "#ef4444", "#22c55e", "#eab308"];
const NEUTRAL = "#9ca3af";
const UNSEEN = "#4b5563";

// Low and wide, like EaW's galaxy map: far Planets shrink, and the galaxy
// disc under the map shows the depth.
const TILT_DEGREES = 30; // from the horizontal; never changes
const FOV = 17; // narrow, from far back: Planets keep near-equal sizes, like EaW
const MIN_ZOOM = 0.6; // zoom 1 fits the whole map; out past that a little
const MAX_ZOOM = 4;
// The map's corners land within this much of the screen at zoom 1, leaving
// room for the labels above and below the edge Planets.
const FIT_SCREEN = 0.8;
// The camera never comes closer than this much world height on screen (as
// half of it) at zoom 1, so Planets stay small markers in open space and a
// small map sits in the middle rather than being blown up to fill the view.
const MIN_FIT_HALF = 345;
const PAN_SPEED = 0.8; // of the visible height per second, for the keys
// Keys that pan the map, to the x and z they move it by.
const PAN_KEYS: Record<string, [number, number]> = {
  a: [-1, 0],
  arrowleft: [-1, 0],
  d: [1, 0],
  arrowright: [1, 0],
  w: [0, -1],
  arrowup: [0, -1],
  s: [0, 1],
  arrowdown: [0, 1],
};

// The backdrop, in screen pixels behind the map: it ignores zoom, and pans
// at a fraction of the map's speed (parallax). Each layer repeats in square
// tiles so it never runs out.
const STAR_TILE = 2048;
const STAR_PARALLAX = 0.3;
const NEBULA_TILE = 3072;
const NEBULA_PARALLAX = 0.15;
// Muted theme tones for the nebulae.
const NEBULA_TONES = ["42,111,120", "74,58,120", "31,59,92", "96,72,40"];
const CLICK_SLOP_PX = 5;
const PLANET_RADIUS = 12;
const DISC_DEPTH = 350; // how far the galaxy disc lies below the map

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
const hash = (s: string) =>
  [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7) >>> 0;

// While dragging onto a Planet: a move to your own, an attack, or no route.
const DROP_MOVE = "#7fdca0";
const DROP_ATTACK = "#f08a7a";
const DROP_NONE = "#7d8a95";

type Stores = {
  store: ReturnType<typeof createMatchStore>;
  local: LocalStore;
};

type Orders = {
  lanes: Lanes;
  /** A Stack dropped on another Planet: send it all there as an Army. */
  sendStack: (
    from: string,
    stack: number,
    to: string,
    toStack?: number,
  ) => void;
  /** An Army dropped on a Planet: re-order it there. */
  moveArmy: (army: number, to: string, toStack?: number) => void;
};

/** What's being dragged to a Planet: a Stack, or an Army (from its `to`). */
type Dragged = { from: string; stack?: number; army?: number };

type PlanetObject = {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  atmosphere: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  label: HTMLDivElement; // the Stacks, above the Planet
  name: HTMLDivElement; // its name and status, below
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
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 1, 10000);
  private readonly tilt = THREE.MathUtils.degToRad(TILT_DEGREES);
  private disc: THREE.Object3D | null = null;
  private readonly backdrop = new THREE.Scene();
  private readonly backdropCamera = new THREE.OrthographicCamera(
    -1,
    1,
    1,
    -1,
    -10,
    10,
  );
  private readonly stars: THREE.Group;
  private readonly nebulae: THREE.Group;
  /** Where the map starts centred, for the backdrop's parallax. */
  private readonly home = new THREE.Vector3();
  /** The map's extent in world units, x by z. */
  private readonly mapBox = new THREE.Box3();
  /** Half the world height visible at zoom 1: the whole map, with a margin. */
  private fitHalf = 1;
  private readonly planets = new Map<string, PlanetObject>();
  private readonly armies = new Map<number, THREE.Mesh>();
  private readonly preview: THREE.Line;
  private readonly ring: THREE.Mesh;
  /** Around the Planet under a drag: green to move, red to attack. */
  private readonly dropRing: THREE.Mesh<
    THREE.RingGeometry,
    THREE.MeshBasicMaterial
  >;
  /** Follows the pointer while dragging, naming what's dragged. */
  private readonly ghost = document.createElement("div");
  /** The yellow line follows a moving Army, so it's redrawn every frame. */
  private trackRoute = false;
  /** The Stack pile a drag is over, lit to show it'll land there. */
  private litPile: { planet: string; stack: number } | null = null;
  private readonly target = new THREE.Vector3();
  private zoom = 1;
  private readonly keys = new Set<string>();
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
    this.renderer.setClearColor("#0b1020");
    this.renderer.autoClear = false; // the backdrop first, then the map over it
    const rnd = random(hash(map.id) || 1); // each map its own sky, every Match
    this.stars = tiled(STAR_TILE, starTile(rnd));
    this.nebulae = tiled(NEBULA_TILE, nebulaTile(rnd));
    this.backdrop.add(this.nebulae, this.stars);
    // Low ambient and a strong sun from the side, so each Planet has a lit
    // side and a dark one and reads as a sphere, not a disc.
    this.scene.add(new THREE.AmbientLight("#ffffff", 0.25));
    const sun = new THREE.DirectionalLight("#fff4e0", 2.4);
    sun.position.set(-500, 350, 250);
    this.scene.add(sun);

    this.buildMap();
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(16, 19, 48),
      new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ring);
    this.dropRing = new THREE.Mesh(
      new THREE.RingGeometry(21, 25, 48),
      new THREE.MeshBasicMaterial({
        color: DROP_MOVE,
        side: THREE.DoubleSide,
        transparent: true,
      }),
    );
    this.dropRing.rotation.x = -Math.PI / 2;
    this.dropRing.visible = false;
    this.scene.add(this.dropRing);
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
      // Its own stacking context: three.js gives each label a z-index by
      // depth, which would otherwise lift near labels over the windows.
      zIndex: "0",
    });
    container.append(this.labels.domElement);
    Object.assign(this.ghost.style, {
      position: "absolute",
      pointerEvents: "none",
      display: "none",
      color: "#e6ebef",
      font: "12px 'IBM Plex Sans', sans-serif",
      whiteSpace: "nowrap",
      // Beside the pointer, so the pile it's over stays visible, lit.
      transform: "translate(16px, 12px)",
      opacity: "0.9",
    });
    container.append(this.ghost);

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
    // The backdrop's tiles are clones sharing geometry and materials.
    const freed = new Set<{ dispose(): void }>();
    const free = (r: { dispose(): void } | null | undefined) => {
      if (r && !freed.has(r)) {
        freed.add(r);
        r.dispose();
      }
    };
    this.backdrop.traverse((obj) => {
      if (obj instanceof THREE.Points || obj instanceof THREE.Sprite) {
        const material = obj.material as THREE.Material & {
          map?: THREE.Texture | null;
        };
        free(obj.geometry);
        free(material.map);
        free(material);
      }
    });
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
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
    this.labels.domElement.remove();
    this.ghost.remove();
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
      const { mesh, atmosphere } = gasGiant(p.id, p.type);
      mesh.position.copy(pos);
      this.scene.add(mesh);

      // Two labels just past the glow: the Stacks anchored by their bottom
      // edge above the Planet, the name by its top edge below it. The camera
      // looks north, so up the screen is -z.
      const label = document.createElement("div");
      const name = document.createElement("div");
      for (const [el, anchorY, dz] of [
        [label, 1, -1.5],
        [name, 0, 1.5],
      ] as const) {
        Object.assign(el.style, {
          color: "#e5e7eb",
          font: "12px sans-serif",
          textAlign: "center",
          whiteSpace: "nowrap",
        });
        const obj = new CSS2DObject(el);
        obj.center.set(0.5, anchorY);
        obj.position.copy(pos).add(new THREE.Vector3(0, 0, PLANET_RADIUS * dz));
        this.scene.add(obj);
      }
      this.planets.set(p.id, { mesh, atmosphere, label, name });
    }
    box.getCenter(this.target);
    this.home.copy(this.target);
    this.mapBox.copy(box);
    this.disc = galaxyDisc(this.map.id, box);
    this.scene.add(this.disc);
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
      // Ownership shows in the atmosphere; out of vision the clouds dim too.
      obj.atmosphere.material.color.set(last ? UNSEEN : colourOf(seen));
      obj.atmosphere.material.opacity = seen ? 0.45 : 0.12;
      obj.mesh.material.color.set(seen ? "#ffffff" : "#5a6470");
      const mine = seen?.owner === view?.you && !seen?.locked;
      const parts = labelParts(
        p.name,
        seen ?? last?.planet,
        mine ? (stack, e) => this.startOrder({ from: p.id, stack }, e) : null,
      );
      const below: HTMLElement[] = [parts.name];
      if (last) {
        // Out of vision: what was last seen there, greyed, with its age.
        for (const el of [parts.name, parts.stacks]) {
          if (el) el.style.opacity = "0.5";
        }
        const age = document.createElement("div");
        age.textContent = `seen ${formatAge(now - last.seenAt)} ago`;
        age.style.opacity = "0.5";
        below.push(age);
      }
      obj.label.replaceChildren(...(parts.stacks ? [parts.stacks] : []));
      obj.name.replaceChildren(...below);
    }
    this.styleLitPile();
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
            // What the player knows: live, else as last seen, else neutral.
            (id) => {
              const live = view.planets.get(id);
              if (live) return live.owner;
              return (
                this.stores.local.getState().lastSeen.get(id)?.planet.owner ??
                null
              );
            },
            view.you,
            from,
            hovered,
          )?.path
        : undefined;
    // With nothing dragged, show the route your selected Army is taking.
    const own =
      !dragged && selectedArmy !== null
        ? view?.armies.get(selectedArmy)
        : undefined;
    const followed = own?.owner === view?.you ? own : undefined;
    const shown = path ?? (followed && [followed.to, ...followed.path]);
    const points = (shown ?? [])
      .map((id) => this.planets.get(id)?.mesh.position.clone().setY(2))
      .filter((p) => p !== undefined);
    // A moving Army's route starts where it is now, mid-Lane.
    const moving = army ?? followed;
    this.trackRoute = !!followed && !followed.waiting;
    const start =
      moving && !moving.waiting && this.armies.get(moving.id)?.position;
    if (start && points.length > 0) points.unshift(start.clone().setY(2));
    // A fresh geometry each time: setFromPoints can't grow an existing buffer,
    // and the first one was empty.
    this.preview.geometry.dispose();
    this.preview.geometry = new THREE.BufferGeometry().setFromPoints(
      points.length > 1 ? points : [],
    );

    const target = dragged && hovered && hovered !== from ? hovered : null;
    const over = target ? this.planets.get(target) : undefined;
    this.dropRing.visible = !!over;
    if (over && target) {
      this.dropRing.position.copy(over.mesh.position).setY(1);
      this.dropRing.material.color.set(
        !path
          ? DROP_NONE
          : view?.planets.get(target)?.owner === view?.you
            ? DROP_MOVE
            : DROP_ATTACK,
      );
    }
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
      if (o.moved) {
        const rect = this.container.getBoundingClientRect();
        Object.assign(this.ghost.style, {
          display: "block",
          left: `${e.clientX - rect.left}px`,
          top: `${e.clientY - rect.top}px`,
        });
      }
      // Over a Stack pile, the drag targets that pile's Planet and Stack.
      const pile = o.moved ? this.pileAt(e) : null;
      this.lightPile(pile && pile.planet !== o.from ? pile : null);
      const hovered = pile?.planet ?? this.planetAt(e);
      if (hovered !== this.stores.local.getState().hovered) {
        this.stores.local.setState({ hovered });
      } else this.updateSelection();
    });
    on(window, "pointerup", (e) => {
      const o = this.ordering;
      if (!o || e.button !== 0) return;
      this.ordering = null;
      canvas.style.cursor = "";
      this.ghost.style.display = "none";
      this.lightPile(null);
      // Dropped on a Stack pile: that Planet, landing in that Stack.
      const pile = o.moved ? this.pileAt(e) : null;
      const to = pile?.planet ?? this.planetAt(e);
      const toStack = pile?.stack;
      if (!o.moved) {
        // A click, not a drag: select what was pressed.
        this.stores.local.setState(
          o.army === undefined
            ? { selected: o.from }
            : { selectedArmy: o.army },
        );
      } else if (to && o.army !== undefined) {
        this.orders.moveArmy(o.army, to, toStack);
      } else if (to && o.stack !== undefined && to !== o.from) {
        this.orders.sendStack(o.from, o.stack, to, toStack);
      }
      this.updateSelection();
    });
    on(canvas, "pointermove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const hovered = this.planetAt(e);
      if (hovered !== this.stores.local.getState().hovered) {
        this.stores.local.setState({ hovered });
      }
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (Math.hypot(dx, dy) > CLICK_SLOP_PX) this.drag.moved = true;
      if (!this.drag.moved) return;
      // Move the map with the pointer: screen pixels to world units.
      const scale = (2 * this.half()) / rect.height;
      this.target.x -= dx * scale;
      this.target.z -= (dy * scale) / Math.sin(this.tilt);
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
      this.stores.local.setState({ hovered: null });
    });
    on(canvas, "wheel", (e) => {
      e.preventDefault();
      this.zoom = THREE.MathUtils.clamp(
        this.zoom * Math.exp(-e.deltaY * 0.001),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      this.frame3d();
    });
    on(window, "keydown", (e) => {
      // A menu's own arrow-key handling marks the event as used.
      if (isTyping(e.target) || e.defaultPrevented) return;
      if (e.key === "Escape") {
        this.ordering = null;
        canvas.style.cursor = "";
        this.ghost.style.display = "none";
        this.lightPile(null);
        this.stores.local.setState({ selected: null, selectedArmy: null });
        return;
      }
      const key = e.key.toLowerCase();
      if (key in PAN_KEYS) e.preventDefault(); // arrows would scroll the page
      this.keys.add(key);
    });
    on(window, "keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    on(window, "blur", () => this.keys.clear());

    const observer = new ResizeObserver(() => this.resize());
    observer.observe(this.container);
    this.cleanup.push(() => observer.disconnect());
  }

  /**
   * Left-click selects the Army or Planet under the pointer, leaving the
   * other selection alone, so both windows can be open. Empty space clears
   * both.
   */
  private select(e: PointerEvent) {
    const army = this.hit(e, [...this.armies.values()])?.userData.army as
      | number
      | undefined;
    const planet = army === undefined ? this.planetAt(e) : null;
    this.stores.local.setState(
      army !== undefined
        ? { selectedArmy: army }
        : planet
          ? { selected: planet }
          : { selected: null, selectedArmy: null },
    );
  }

  private startOrder(d: Dragged, e: PointerEvent) {
    e.preventDefault(); // no text selection or native drag
    this.ordering = { ...d, x: e.clientX, y: e.clientY, moved: false };
    const view = this.stores.store.getState().view;
    const units =
      d.army !== undefined
        ? view?.armies.get(d.army)?.units
        : view?.planets.get(d.from)?.stacks[d.stack ?? 0];
    const count = (units ?? []).reduce((n, u) => n + u.count, 0);
    if (d.army === undefined) {
      // The Stack's own pile of pancakes is what's carried to the Planet.
      const p = view?.planets.get(d.from);
      this.ghost.replaceChildren(pancakes(count, colourOf(p)));
    } else {
      const box = document.createElement("div");
      Object.assign(box.style, {
        padding: "4px 8px",
        borderRadius: "4px",
        border: "1px solid #3a4652",
        background: "#141c23ee",
      });
      box.textContent = `Army · ${count} units`;
      this.ghost.replaceChildren(box);
    }
  }

  /** The Stack pile under the pointer, by its box: most ignore the pointer. */
  private pileAt(e: MouseEvent) {
    for (const el of this.labels.domElement.querySelectorAll<HTMLElement>(
      "[data-stack]",
    )) {
      const r = el.getBoundingClientRect();
      if (
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom
      ) {
        return {
          el,
          planet: el.dataset.planet ?? "",
          stack: Number(el.dataset.stack),
        };
      }
    }
    return null;
  }

  private lightPile(pile: { planet: string; stack: number } | null) {
    this.litPile = pile && { planet: pile.planet, stack: pile.stack };
    this.styleLitPile();
  }

  /** Outlines the lit pile; labels are rebuilt each second, so it's re-run after. */
  private styleLitPile() {
    const lit = this.litPile;
    for (const el of this.labels.domElement.querySelectorAll<HTMLElement>(
      "[data-stack]",
    )) {
      const on =
        !!lit &&
        el.dataset.planet === lit.planet &&
        el.dataset.stack === `${lit.stack}`;
      el.style.outline = on ? "2px solid #facc15" : "";
      el.style.outlineOffset = "2px";
      el.style.borderRadius = "50%";
    }
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
    this.fit();
    Object.assign(this.backdropCamera, {
      left: -w / 2,
      right: w / 2,
      top: h / 2,
      bottom: -h / 2,
    });
    this.backdropCamera.updateProjectionMatrix();
    this.frame3d();
  }

  /**
   * Sets fitHalf for zoom 1: the camera backs off from the map's centre until
   * all four corners project inside the screen. With perspective the near side
   * draws larger, so the corners are measured rather than worked out.
   */
  private fit() {
    // The disc sits on the camera's line of sight through the map's centre,
    // so it shows centred behind the map whatever the tilt.
    this.disc?.position
      .copy(this.home)
      .add(
        new THREE.Vector3(0, -DISC_DEPTH, -DISC_DEPTH / Math.tan(this.tilt)),
      );
    const { min, max } = this.mapBox;
    const corners = [
      [min.x, min.z],
      [max.x, min.z],
      [min.x, max.z],
      [max.x, max.z],
    ].map(([x = 0, z = 0]) => new THREE.Vector3(x, 0, z));
    const inside = () =>
      corners.every((c) => {
        const p = c.clone().project(this.camera);
        return Math.abs(p.x) <= FIT_SCREEN && Math.abs(p.y) <= FIT_SCREEN;
      });
    this.fitHalf = MIN_FIT_HALF;
    for (let i = 0; i < 200; i++) {
      this.placeCamera(this.home, this.fitHalf);
      if (inside()) break;
      this.fitHalf *= 1.05;
    }
  }

  /** Puts the camera at its fixed tilt and heading over a point: it only ever moves, never rotates. */
  private placeCamera(at: THREE.Vector3, half: number) {
    // Far enough that half the screen's height spans half at the target.
    const d = half / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camera.position.set(
      at.x,
      at.y + d * Math.sin(this.tilt),
      at.z + d * Math.cos(this.tilt),
    );
    this.camera.lookAt(at);
    this.camera.updateMatrixWorld();
  }

  /** Half the world height on screen at the target, at the current zoom: zooming moves the camera, keeping its field of view. */
  private half() {
    return this.fitHalf / this.zoom;
  }

  /** Matches the camera to the view's shape. */
  private frame3d() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private tick(now: number) {
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 0;
    this.last = now;
    this.pan(dt);
    this.keepOnMap();
    this.placeCamera(this.target, this.half());
    this.parallax();
    this.placeArmies();
    if (this.trackRoute) this.updateSelection();
    for (const p of this.planets.values()) p.mesh.rotation.y += dt * 0.08;
    if (this.dropRing.visible) {
      this.dropRing.scale.setScalar(1 + 0.08 * Math.sin(now / 150));
    }
    this.renderer.clear();
    this.renderer.render(this.backdrop, this.backdropCamera);
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

  /**
   * Keeps the point the camera looks at over the map: within its bounds plus
   * a margin of half the map or half the minimum view, whichever is larger,
   * so panning can look past the edge Planets but never lose the galaxy.
   */
  private keepOnMap() {
    const { min, max } = this.mapBox;
    const margin = Math.max(
      (max.x - min.x) / 2,
      (max.z - min.z) / 2,
      MIN_FIT_HALF,
    );
    this.target.x = THREE.MathUtils.clamp(
      this.target.x,
      min.x - margin,
      max.x + margin,
    );
    this.target.z = THREE.MathUtils.clamp(
      this.target.z,
      min.z - margin,
      max.z + margin,
    );
  }

  /** WASD and the arrow keys, at the same screen speed at any zoom. */
  private pan(dt: number) {
    let x = 0;
    let z = 0;
    for (const k of this.keys) {
      const [kx, kz] = PAN_KEYS[k] ?? [0, 0];
      x += kx;
      z += kz;
    }
    const step = 2 * this.half() * PAN_SPEED * dt;
    this.target.x += Math.sign(x) * step;
    this.target.z += (Math.sign(z) * step) / Math.sin(this.tilt);
  }

  /**
   * Moves the backdrop layers a fraction of the way the map has panned, as
   * zoom 1 would show it, wrapped within a tile.
   */
  private parallax() {
    const { clientHeight: h } = this.container;
    if (!h) return;
    const px = h / (2 * this.fitHalf); // screen pixels per world unit at zoom 1
    const dx = (this.target.x - this.home.x) * px;
    const dy = (this.target.z - this.home.z) * Math.sin(this.tilt) * px;
    const wrap = (v: number, tile: number) =>
      (((v % tile) + tile * 1.5) % tile) - tile / 2;
    this.stars.position.set(
      wrap(-dx * STAR_PARALLAX, STAR_TILE),
      wrap(dy * STAR_PARALLAX, STAR_TILE),
      0,
    );
    this.nebulae.position.set(
      wrap(-dx * NEBULA_PARALLAX, NEBULA_TILE),
      wrap(dy * NEBULA_PARALLAX, NEBULA_TILE),
      0,
    );
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
 * A Stack drawn like EaW's: a pile of ovals, taller the more units it holds,
 * with the count on top. An empty Stack is one dashed oval.
 */
function pancakes(units: number, colour: string) {
  const pile = document.createElement("div");
  Object.assign(pile.style, {
    position: "relative",
    display: "flex",
    flexDirection: "column-reverse", // the first oval is the bottom one
    alignItems: "center",
  });
  // One oval per 5 units, up to 8, so big Stacks stand out without towering.
  const discs = units ? Math.min(8, Math.ceil(units / 5)) : 1;
  for (let k = 0; k < discs; k++) {
    const disc = document.createElement("div");
    Object.assign(disc.style, {
      width: "34px",
      height: "14px",
      borderRadius: "50%",
      border: units ? `1px solid ${colour}` : "1px dashed #7d8a95",
      // The owner's colour, tinted over a dark base so the count stays readable.
      background: units
        ? `linear-gradient(${colour}66, ${colour}66), #141c23`
        : "transparent",
      boxShadow: units ? "0 1px 0 #000a" : "none",
      marginBottom: k ? "-9px" : "0", // each sits on the one below
    });
    pile.append(disc);
  }
  if (units) {
    const count = document.createElement("span");
    count.textContent = `${units}`;
    Object.assign(count.style, {
      position: "absolute",
      top: "0",
      left: "0",
      right: "0",
      lineHeight: "14px",
      fontSize: "11px",
      fontWeight: "600",
      textShadow: "0 1px 1px #000",
    });
    pile.append(count);
  }
  return pile;
}

/**
 * The name line (owner colour, name, Locked icon, construction pip) and a
 * pancake pile per Stack. onStackDown makes your own non-empty piles
 * draggable. Outside vision there are no Stacks to show.
 */
function labelParts(
  name: string,
  p: PlanetView | undefined,
  onStackDown: ((stack: number, e: PointerEvent) => void) | null,
): { name: HTMLElement; stacks: HTMLElement | null } {
  const info = document.createElement("div");
  if (!p) {
    info.textContent = name;
    info.style.opacity = "0.5"; // outside vision: no dynamic details
    return { name: info, stacks: null };
  }
  const swatch = document.createElement("span");
  Object.assign(swatch.style, {
    display: "inline-block",
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: colourOf(p),
    marginRight: "4px",
  });
  info.append(swatch, name);
  if (p.locked) info.append(" 🔒");
  if (p.queue.length > 0) info.append(" 🔨"); // only ever on your own Planets

  const stacks = document.createElement("div");
  Object.assign(stacks.style, {
    display: "flex",
    gap: "4px",
    justifyContent: "center",
    alignItems: "flex-end", // piles of different heights share a base
  });
  p.stacks.forEach((stack, i) => {
    const units = stack.reduce((n, s) => n + s.count, 0);
    const pile = pancakes(units, colourOf(p));
    pile.title = `Stack ${i + 1}: ${units} units`;
    // Where a dragged Stack or Army can be dropped to land in this Stack.
    pile.dataset.planet = p.id;
    pile.dataset.stack = `${i}`;
    // Three piles in a triangle: the outer two on one line, the middle one up.
    if (i === 1) pile.style.marginBottom = "10px";
    if (units && onStackDown) {
      // The label layer ignores the pointer; a pile takes it back to be dragged.
      pile.style.pointerEvents = "auto";
      pile.style.cursor = "grab";
      pile.addEventListener("pointerdown", (e) => {
        if (e.button === 0) onStackDown(i, e);
      });
    }
    stacks.append(pile);
  });
  return { name: info, stacks };
}

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
  mesh.userData.planet = id;
  atmosphere.userData.planet = id;
  mesh.add(atmosphere);
  return { mesh, atmosphere };
}

/** Lays a tile's content out 3 × 3, so a layer wrapped within one tile still covers the screen. */
function tiled(tile: number, content: THREE.Object3D) {
  const group = new THREE.Group();
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const copy = content.clone();
      copy.position.set(i * tile, j * tile, 0);
      group.add(copy);
    }
  }
  return group;
}

/** Stars scattered over one tile, in screen pixels, mostly faint. */
function starTile(rnd: () => number) {
  const positions: number[] = [];
  const colours: number[] = [];
  for (let i = 0; i < 900; i++) {
    positions.push((rnd() - 0.5) * STAR_TILE, (rnd() - 0.5) * STAR_TILE, 0);
    const b = 0.25 + rnd() ** 3 * 0.75;
    colours.push(0.86 * b, 0.9 * b, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 1.5,
      sizeAttenuation: false,
      vertexColors: true,
    }),
  );
}

/** Two faint, soft glows in muted theme tones over one tile. */
function nebulaTile(rnd: () => number) {
  const group = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const tone =
      NEBULA_TONES[Math.floor(rnd() * NEBULA_TONES.length)] ?? "42,111,120";
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: canvasTexture(256, 256, (g) => {
          const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
          grad.addColorStop(0, `rgba(${tone},0.35)`);
          grad.addColorStop(0.5, `rgba(${tone},0.12)`);
          grad.addColorStop(1, `rgba(${tone},0)`);
          g.fillStyle = grad;
          g.fillRect(0, 0, 256, 256);
        }),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.position.set(
      (rnd() - 0.5) * NEBULA_TILE,
      (rnd() - 0.5) * NEBULA_TILE,
      -1,
    );
    glow.scale.set(900 + rnd() * 700, 600 + rnd() * 500, 1);
    group.add(glow);
  }
  return group;
}

/**
 * A spiral galaxy lying flat under the map, like EaW's: a warm core and two
 * arms of soft dots, seeded by the map's id. It sits below the Planets in the
 * world, so the camera's perspective shows across it.
 */
function galaxyDisc(mapId: string, box: THREE.Box3) {
  const rnd = random(hash(`${mapId}/disc`) || 1);
  const S = 1024;
  const texture = canvasTexture(S, S, (g) => {
    const c = S / 2;
    g.globalCompositeOperation = "lighter";
    const core = g.createRadialGradient(c, c, 0, c, c, S * 0.22);
    core.addColorStop(0, "rgba(255,236,200,0.55)");
    core.addColorStop(0.35, "rgba(200,190,220,0.18)");
    core.addColorStop(1, "rgba(120,140,200,0)");
    g.fillStyle = core;
    g.fillRect(0, 0, S, S);
    const twist = rnd() * Math.PI * 2;
    // Where a point on an arm sits: a log-ish spiral, looser towards the rim.
    const armPoint = (arm: number, t: number, spread: number) => {
      const r = t * S * 0.48;
      const angle =
        twist + arm * Math.PI + t * 7 + (rnd() - 0.5) * spread * (0.4 + t);
      return [c + Math.cos(angle) * r, c + Math.sin(angle) * r] as const;
    };
    const dot = (x: number, y: number, r: number, fill: string) => {
      g.fillStyle = fill;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    };
    // A soft haze along each arm, then fine stars over it.
    for (let i = 0; i < 1400; i++) {
      const [x, y] = armPoint(i % 2, rnd() ** 0.8, 0.5);
      dot(x, y, 14 + rnd() * 20, "rgba(110,135,200,0.018)");
    }
    for (let i = 0; i < 16000; i++) {
      const [x, y] = armPoint(i % 2, rnd() ** 0.7, 0.9);
      const warm = rnd() < 0.15;
      const a = 0.08 + rnd() * 0.22;
      dot(
        x + (rnd() - 0.5) * 12,
        y + (rnd() - 0.5) * 12,
        0.5 + rnd() * 1.2,
        warm ? `rgba(240,205,160,${a})` : `rgba(170,190,240,${a})`,
      );
    }
  });
  const size = box.getSize(new THREE.Vector3());
  // Far below the map, so the Planets float over it and slide across it
  // when panning; big enough to still frame the map from up here.
  const extent = Math.max(size.x, size.z) * 4.5;
  const disc = new THREE.Mesh(
    new THREE.PlaneGeometry(extent, extent),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.5, // dim enough that Lanes and labels read over it
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.copy(box.getCenter(new THREE.Vector3())).setY(-DISC_DEPTH);
  disc.renderOrder = -1; // under the Lanes and Planets
  return disc;
}
