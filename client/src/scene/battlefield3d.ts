import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type {
  Battle,
  Battlefield,
  BuildPad,
  ControlPoint,
  Side,
  Squad,
  SquadOrder,
  Volley,
} from "../match/store";
import {
  type BattlefieldDrawing,
  type BattlefieldLook,
  fogOver,
  groupBadge,
  type OverlayLine,
  POINT_NAMES,
  UNHELD,
} from "./battlefield";
import { isTyping } from "./galaxy";

// The 3D drawing of a Battlefield (#93; docs/specs/tactical-battle-spec.md#3d-drawing):
// terraced ground under an RTS camera. A cell is 1 world unit; x runs along
// the width, z down the map's rows, y up.

const LEVEL = 0.8; // world units per height level
const WATER_DEPTH = 0.45; // a water cell's bed below level 0
const PITCH = (55 * Math.PI) / 180; // the camera's tilt from the ground
const TICK_MS = 200; // one sim tick: how far apart updates come, until they've been timed
const TURN = 7; // radians a second a vehicle or aircraft turns to its heading
const TRACER_MS = 250;
const FLY = 2.6; // how high aircraft fly over the highest ground
const MAX_PER_FORM = 1024; // instances per shape: 45 squads a side × 4, and buildings, with room
// Where a squad's members stand in its cell, by how many are left.
const SPOTS: [number, number][][] = [
  [],
  [[0, 0]],
  [
    [-0.2, 0],
    [0.2, 0],
  ],
  [
    [-0.2, -0.17],
    [0.2, -0.17],
    [0, 0.2],
  ],
  [
    [-0.2, -0.2],
    [0.2, -0.2],
    [-0.2, 0.2],
    [0.2, 0.2],
  ],
];
const PAN_KEYS: Record<string, [number, number]> = {
  arrowleft: [-1, 0],
  arrowright: [1, 0],
  arrowup: [0, -1],
  arrowdown: [0, 1],
};

/** A squad's placeholder shape. */
export type Form = "infantry" | "vehicle" | "air" | "building" | "post";

export type BattlefieldLook3D = BattlefieldLook & {
  /** Whether ground units can't cross a Terrain: at level 0 that's water, drawn as a bed under a see-through surface. */
  blocked: (id: string) => boolean;
  /** A Terrain's cover: trees at −2 or below, rocks at −1. */
  cover: (id: string) => number;
  /** The shape a squad is drawn as. */
  form: (sq: Squad) => Form;
  /** Its model's URL (a .glb), drawn in place of the shape once loaded. */
  model: (sq: Squad) => string | undefined;
};

// A model, instanced: its body in its own colours, its trim in the side's.
type Model = { body: THREE.InstancedMesh; trim: THREE.InstancedMesh | null };

// A squad as drawn: where it's moving from and to, in cells, over ms from t0.
type Token = {
  sq: Squad;
  form: Form;
  model: string | undefined;
  from: THREE.Vector2;
  to: THREE.Vector2;
  t0: number;
  ms: number;
  heading: number; // the way it's going
  facing: number; // the way it's drawn, turning to heading
  pos: THREE.Vector3; // where it stands now, in world units
};

type Effect = { obj: THREE.Line | THREE.Mesh; t0: number; ms: number };

// A Landing Zone's or a pad's marks on the ground: an outline, a fill, a
// capture arc, and its label.
type Mark = {
  group: THREE.Group;
  outline: THREE.Mesh;
  fill: THREE.Mesh;
  arc: THREE.Mesh;
  progress: number;
};

export class Battlefield3DScene implements BattlefieldDrawing {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.5, 500);
  private readonly observer: ResizeObserver;
  private readonly ground: THREE.Mesh;
  private readonly corners: Float32Array; // (width + 1) × (height + 1) corner heights
  private readonly ceiling: number; // the highest ground: aircraft fly level above it
  private frame = 0;
  // The camera looks at target from distance, turned yaw about the vertical.
  private readonly target: THREE.Vector3;
  private distance: number;
  private readonly maxDistance: number;
  private yaw = 0;
  private drag: { x: number; y: number; button: number } | null = null;
  private readonly held = new Set<string>(); // pan and rotate keys down
  private last = 0;
  // How far apart updates come, on average: each move glides that long, so
  // a squad moving cell to cell keeps going rather than stopping between.
  private gap = TICK_MS;
  private lastUpdate = 0;
  private lastPoints: ControlPoint[] = [];
  private readonly tokens = new Map<number, Token>();
  private readonly labels = new CSS2DRenderer();
  private readonly fog: THREE.DataTexture;
  private fogOf: Side | null | false;
  private lastSquads: Squad[] = [];
  private lastPads: BuildPad[] = [];
  private readonly points: Mark[] = [];
  private readonly pads: Mark[] = [];
  private readonly lines = new THREE.Group();
  private selected: number | null = null;
  // Commanding a side: the left button picks its squads, by click or a box
  // dragged on screen; the right button orders them; the middle pans.
  private commandSide: Side | null = null;
  private readonly picked = new Set<number>();
  private groupOf = new Map<number, number>(); // each squad's control group
  private readonly badges = new Map<number, CSS2DObject>(); // their numbers, over the tokens
  private armed = false; // the next left click is an Attack-move
  private readonly pickedRings = new Map<number, THREE.Mesh>();
  private readonly pickedRing = onTop(
    new THREE.MeshBasicMaterial({ color: "#facc15" }),
  );
  private readonly moveLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    onTop(
      new THREE.LineBasicMaterial({
        color: "#e6ebef",
        transparent: true,
        opacity: 0.7,
      }),
    ),
  );
  private readonly attackLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    onTop(new THREE.LineBasicMaterial({ color: "#f08a7a" })),
  );
  private readonly box = document.createElement("div");
  // The minimap, top left: the ground, the fog, squads, Landing Zones
  // and what the camera sees. Clicking or dragging on it moves the camera.
  private readonly mini = document.createElement("canvas");
  private readonly miniGround = document.createElement("canvas"); // a pixel a cell
  private readonly miniFog = document.createElement("canvas");
  private miniDrag = false;
  private boxFrom: { x: number; y: number } | null = null;
  private pressed: { x: number; y: number } | null = null;
  private readonly ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.62, 32).rotateX(-Math.PI / 2),
    onTop(new THREE.MeshBasicMaterial({ color: "#f2f5f7" })),
  );
  private readonly effects: Effect[] = [];
  private readonly forms: Record<Form, THREE.InstancedMesh>;
  // By URL; null while it loads, or if it couldn't (its squads keep their shape).
  private readonly models = new Map<string, Model | null>();
  private disposed = false;
  private readonly still = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  onPick?: (squad: number | null) => void;
  onPadMenu?: (pad: number, clientX: number, clientY: number) => void;
  onSelect?: (squads: number[]) => void;
  onOrder?: BattlefieldDrawing["onOrder"];

  constructor(
    private readonly container: HTMLElement,
    private readonly field: Battlefield,
    private readonly look: BattlefieldLook3D,
  ) {
    const { width: w, height: h } = field;
    this.scene.background = new THREE.Color("#04070a");
    this.scene.add(new THREE.HemisphereLight("#dfe8f0", "#2a2f24", 1.6));
    const sun = new THREE.DirectionalLight("#fff4e0", 1.8);
    sun.position.set(-w * 0.4, 60, -h * 0.6);
    sun.target.position.set(w / 2, 0, h / 2);
    this.scene.add(sun, sun.target);

    this.corners = new Float32Array((w + 1) * (h + 1));
    for (let z = 0; z <= h; z++) {
      for (let x = 0; x <= w; x++) {
        let sum = 0;
        let n = 0;
        for (const [cx, cz] of [
          [x - 1, z - 1],
          [x, z - 1],
          [x - 1, z],
          [x, z],
        ] as const) {
          if (cx < 0 || cz < 0 || cx >= w || cz >= h) continue;
          sum += this.top(cz * w + cx);
          n++;
        }
        this.corners[z * (w + 1) + x] = sum / n;
      }
    }
    this.ceiling = this.corners.reduce((a, b) => Math.max(a, b), 0); // no spread: a big map has 66k corners
    // The fog: multiplied into the ground's colours, a texel a cell.
    this.fog = new THREE.DataTexture(new Uint8Array(w * h * 4).fill(255), w, h);
    this.fog.magFilter = THREE.LinearFilter;
    this.fog.colorSpace = THREE.SRGBColorSpace;
    this.fog.needsUpdate = true;
    this.fogOf = look.you;
    this.ring.visible = false;
    this.ring.renderOrder = 4;
    this.scene.add(this.lines, this.ring, this.moveLines, this.attackLines);
    this.moveLines.renderOrder = this.attackLines.renderOrder = 4;
    Object.assign(this.box.style, {
      position: "absolute",
      display: "none",
      border: "1px dashed #e6ebef",
      background: "#4fa3e014",
      pointerEvents: "none",
    });
    this.ground = this.terrain();
    this.scene.add(this.ground, this.water(), ...this.dressing());
    // Each shape stands on y = 0 of its own geometry.
    const lift = (g: THREE.BufferGeometry, y: number) => g.translate(0, y, 0);
    const shape = (g: THREE.BufferGeometry) => {
      const m = new THREE.InstancedMesh(
        g,
        new THREE.MeshLambertMaterial(),
        MAX_PER_FORM,
      );
      m.count = 0;
      m.frustumCulled = false; // instances move; the base geometry's bounds don't
      this.scene.add(m);
      return m;
    };
    this.forms = {
      infantry: shape(lift(new THREE.CapsuleGeometry(0.08, 0.2, 3, 8), 0.18)),
      vehicle: shape(lift(new THREE.BoxGeometry(0.32, 0.18, 0.46), 0.09)),
      air: shape(new THREE.ConeGeometry(0.16, 0.42, 5).rotateX(Math.PI / 2)),
      building: shape(lift(new THREE.BoxGeometry(0.8, 0.6, 0.8), 0.3)),
      post: shape(lift(new THREE.BoxGeometry(0.95, 1.2, 0.95), 0.6)),
    };

    this.target = new THREE.Vector3(w / 2, 0, h / 2);
    this.maxDistance = Math.max(w, h) * 1.1;
    this.distance = this.maxDistance * 0.7;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const canvas = this.renderer.domElement;
    canvas.style.display = "block";
    canvas.style.touchAction = "none";
    this.labels.domElement.style.position = "absolute";
    this.labels.domElement.style.inset = "0";
    this.labels.domElement.style.pointerEvents = "none";
    this.drawMiniGround();
    const scale = Math.min(180 / w, 140 / h);
    this.mini.width = Math.round(w * scale * 2); // drawn at twice its size, for sharpness
    this.mini.height = Math.round(h * scale * 2);
    Object.assign(this.mini.style, {
      position: "absolute",
      left: "10px",
      top: "10px",
      width: `${Math.round(w * scale)}px`,
      height: `${Math.round(h * scale)}px`,
      border: "1px solid #3a4652",
      borderRadius: "4px",
      cursor: "pointer",
      touchAction: "none",
    });
    this.mini.setAttribute(
      "aria-label",
      "Minimap: click or drag to move the camera",
    );
    this.mini.addEventListener("pointerdown", this.onMini);
    this.mini.addEventListener("pointermove", this.onMini);
    this.mini.addEventListener("pointerup", this.onMini);
    container.append(canvas, this.labels.domElement, this.box, this.mini);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("dblclick", this.onDouble);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.mini.addEventListener("contextmenu", (e) => e.preventDefault()); // the right button orders
    // On the container, so moving onto the minimap over the canvas still counts.
    container.addEventListener("pointerenter", this.onHover);
    container.addEventListener("pointerleave", this.onHover);
    // Captured, so it's taken before the galaxy map under the Battle window pans too.
    window.addEventListener("keydown", this.onKey, true);
    window.addEventListener("keyup", this.onKey, true);
    window.addEventListener("blur", this.onBlur);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    window.removeEventListener("keydown", this.onKey, true);
    window.removeEventListener("keyup", this.onKey, true);
    window.removeEventListener("blur", this.onBlur);
    this.container.removeEventListener("pointerenter", this.onHover);
    this.container.removeEventListener("pointerleave", this.onHover);
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss(); // browsers cap how many WebGL contexts are open
    this.renderer.domElement.remove();
    for (const b of this.badges.values()) b.element.remove();
    this.labels.domElement.remove();
    this.box.remove();
    this.mini.remove();
  }

  /** The Battle as your side sees it now: its squads move to their new cells. */
  update(battle: Battle) {
    const now = performance.now();
    const since = now - this.lastUpdate;
    if (this.lastUpdate && since < 1000)
      // a pause isn't the pace
      this.gap = Math.min(1000, Math.max(50, this.gap * 0.7 + since * 0.3));
    this.lastUpdate = now;
    const seen = new Set<number>();
    for (const sq of battle.squads) {
      seen.add(sq.id);
      const at = new THREE.Vector2(sq.x + 0.5, sq.y + 0.5);
      const t = this.tokens.get(sq.id);
      if (!t) {
        const model = this.look.model(sq);
        if (model && !this.models.has(model)) this.loadModel(model);
        this.tokens.set(sq.id, {
          sq,
          form: this.look.form(sq),
          model,
          from: at.clone(),
          to: at,
          t0: now,
          ms: this.gap,
          heading: 0,
          facing: 0,
          pos: new THREE.Vector3(at.x, 0, at.y),
        });
        continue;
      }
      t.sq = sq;
      if (t.to.equals(at)) continue;
      t.from.set(t.pos.x, t.pos.z);
      t.heading = Math.atan2(at.x - t.from.x, at.y - t.from.y);
      t.to.copy(at);
      t.t0 = now;
      t.ms = this.gap * 1.05; // a touch longer, so a late update doesn't leave it standing
    }
    for (const id of this.tokens.keys())
      if (!seen.has(id)) this.tokens.delete(id);
    this.lastPoints = battle.points;
    this.lastPads = battle.pads;
    this.lastSquads = battle.squads;
    this.drawPoints(battle.points);
    this.drawPads(battle.pads);
    this.drawFog();
    // Squads that died or left drop out of the selection.
    if ([...this.picked].some((id) => !seen.has(id)))
      this.pick([...this.picked].filter((id) => seen.has(id)));
  }

  /** Whose Sight clears the fog: a side, both sides (null), or none: no fog (false). */
  setFog(of: Side | null | false) {
    this.fogOf = of;
    this.drawFog();
  }

  /** Replaces the overlay lines: drawn a little over the ground, over everything. */
  overlay(lines: OverlayLine[]) {
    for (const obj of this.lines.children) {
      const line = obj as THREE.Line;
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.lines.clear();
    const lift = (c: { x: number; y: number }) =>
      new THREE.Vector3(
        c.x + 0.5,
        this.heightAt(c.x + 0.5, c.y + 0.5) + 0.3,
        c.y + 0.5,
      );
    for (const l of lines) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([lift(l.from), lift(l.to)]),
        onTop(
          l.dashed
            ? new THREE.LineDashedMaterial({
                color: l.colour,
                dashSize: 0.8,
                gapSize: 0.5,
              })
            : new THREE.LineBasicMaterial({ color: l.colour }),
        ),
      );
      if (l.dashed) line.computeLineDistances();
      line.renderOrder = 4;
      this.lines.add(line);
    }
  }

  /** Rings a squad on the ground, following it; null rings none. */
  select(squad: number | null) {
    this.selected = squad;
  }

  /** A tick's fire: a tracer from each shooter you can see, and a flash where hits land. */
  fire(volleys: Volley[]) {
    // Effects are cleared by the frame loop, which a hidden tab pauses: they'd pile up unseen (#110).
    if (document.hidden) return;
    const now = performance.now();
    for (const v of volleys) {
      const target = this.tokens.get(v.target);
      if (!target) continue;
      const at = this.aim(target);
      const actor = v.actor ? this.tokens.get(v.actor) : undefined;
      if (actor) {
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([this.aim(actor), at]),
          new THREE.LineBasicMaterial({
            color: this.look.sideColour[actor.sq.side],
            transparent: true,
          }),
        );
        this.scene.add(line);
        this.effects.push({ obj: line, t0: now, ms: TRACER_MS });
      }
      if (v.hits > 0) {
        // Bigger when it kills.
        const flash = new THREE.Mesh(
          new THREE.SphereGeometry(v.kills > 0 ? 0.32 : 0.2, 10, 8),
          new THREE.MeshBasicMaterial({ color: "#ffd27a", transparent: true }),
        );
        flash.position.copy(at);
        this.scene.add(flash);
        this.effects.push({ obj: flash, t0: now, ms: TRACER_MS * 1.5 });
      }
    }
  }

  /** Where fire leaves or lands on a squad: a little above where it stands. */
  private aim(t: Token) {
    return t.pos.clone().setY(t.pos.y + (t.form === "post" ? 0.8 : 0.25));
  }

  /** Commands side's squads from the map, or with null stops. */
  command(side: Side | null) {
    const changed = side !== this.commandSide;
    this.commandSide = side;
    if (changed) this.pick([]); // the other side's squads aren't yours to order
  }

  /** Sets the picked squads, ringing each, and tells onSelect. */
  pick(squads: number[]) {
    this.picked.clear();
    for (const id of squads) this.picked.add(id);
    this.armed = false;
    this.renderer.domElement.style.cursor = "";
    this.onSelect?.([...this.picked]);
  }

  /** Shows each squad's control group, by id, over its token. */
  setGroups(groups: Map<number, number>) {
    this.groupOf = groups;
  }

  /** Moves the camera to the middle of these squads. */
  centreOn(squads: number[]) {
    const at = squads.flatMap((id) => {
      const t = this.tokens.get(id);
      return t ? [t.pos] : [];
    });
    if (at.length === 0) return;
    this.target.x = at.reduce((n, p) => n + p.x, 0) / at.length;
    this.target.z = at.reduce((n, p) => n + p.z, 0) / at.length;
  }

  /** A number over each squad in a control group. */
  private drawBadges() {
    for (const [id, b] of this.badges) {
      const group = this.groupOf.get(id);
      if (
        group &&
        this.tokens.has(id) &&
        b.element.textContent === String(group)
      )
        continue;
      this.scene.remove(b);
      b.element.remove();
      this.badges.delete(id);
    }
    for (const [id, group] of this.groupOf) {
      const t = this.tokens.get(id);
      if (!t) continue;
      let b = this.badges.get(id);
      if (!b) {
        const el = groupBadge(group);
        el.classList.remove("ml-1");
        el.classList.add("font-mono", "text-[10px]");
        b = new CSS2DObject(el);
        b.center.set(-0.6, 1.4);
        this.badges.set(id, b);
        this.scene.add(b);
      }
      b.position.copy(t.pos);
    }
  }

  /** A double-click on a squad of yours picks every one of its unit on screen. */
  private readonly onDouble = (e: MouseEvent) => {
    if (this.commandSide === null) return;
    const id = this.squadNear(e.clientX, e.clientY, (sq) => this.orderable(sq));
    const unit = id === null ? undefined : this.tokens.get(id)?.sq.unit;
    if (unit === undefined) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const picks: number[] = [];
    for (const t of this.tokens.values()) {
      const s = this.onScreen(t);
      if (
        t.sq.unit === unit &&
        this.orderable(t.sq) &&
        !s.behind &&
        s.x >= rect.left &&
        s.x <= rect.right &&
        s.y >= rect.top &&
        s.y <= rect.bottom
      )
        picks.push(t.sq.id);
    }
    this.pick(picks);
  };

  /** The next left click sends the picked squads on an Attack-move. */
  armAttackMove() {
    if (this.picked.size === 0) return;
    this.armed = true;
    this.renderer.domElement.style.cursor = "crosshair";
  }

  /** A squad you can order: your own, alive and able to move. */
  private orderable(sq: Squad) {
    return sq.side === this.commandSide && !sq.building && !sq.commandPost;
  }

  /** Where a squad is drawn on screen, in client pixels. */
  private onScreen(t: Token) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = this.aim(t).project(this.camera);
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
      behind: v.z > 1,
    };
  }

  /** The squad drawn nearest a screen point, within 18 px, that passes ok. */
  private squadNear(
    clientX: number,
    clientY: number,
    ok: (sq: Squad) => boolean = () => true,
  ) {
    let best: number | null = null;
    let bestD = 18;
    for (const t of this.tokens.values()) {
      if (!ok(t.sq)) continue;
      const s = this.onScreen(t);
      const d = Math.hypot(s.x - clientX, s.y - clientY);
      if (!s.behind && d < bestD) [best, bestD] = [t.sq.id, d];
    }
    return best;
  }

  /** The cell under a screen point, if it's on the map. */
  private cellAt(clientX: number, clientY: number) {
    const at = this.groundAt(clientX, clientY);
    if (!at) return null;
    return {
      x: Math.min(Math.max(Math.floor(at.x), 0), this.field.width - 1),
      y: Math.min(Math.max(Math.floor(at.z), 0), this.field.height - 1),
    };
  }

  /** Orders the picked squads at a screen point, and marks where: on a pad, onto it, to take it. With queue, after their other orders. */
  private order(
    clientX: number,
    clientY: number,
    kind: "move" | "attackMove",
    queue = false,
  ) {
    if (this.picked.size === 0) return;
    const enemy =
      kind === "move"
        ? this.squadNear(clientX, clientY, (sq) => sq.side !== this.commandSide)
        : null;
    const at = this.groundAt(clientX, clientY);
    const pad =
      at &&
      this.lastPads.find(
        (q) =>
          Math.abs(q.x + 0.5 - at.x) <= 0.8 &&
          Math.abs(q.y + 0.5 - at.z) <= 0.8,
      );
    const cell = pad ? { x: pad.x, y: pad.y } : this.cellAt(clientX, clientY);
    if (!cell) return;
    const o: SquadOrder =
      enemy !== null
        ? { kind: "attack", target: enemy, queue }
        : { kind, cell, queue };
    this.onOrder?.([...this.picked], o);
    const mark = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.55, 20).rotateX(-Math.PI / 2),
      onTop(
        new THREE.MeshBasicMaterial({
          color: enemy !== null ? "#f08a7a" : "#7fdca0",
          transparent: true,
        }),
      ),
    );
    mark.renderOrder = 4;
    mark.position.set(
      cell.x + 0.5,
      this.heightAt(cell.x + 0.5, cell.y + 0.5) + 0.08,
      cell.y + 0.5,
    );
    this.scene.add(mark);
    this.effects.push({ obj: mark, t0: performance.now(), ms: 600 });
  }

  /** Rings each picked squad, and lines to where each is going or firing. */
  private drawOrders() {
    for (const [id, ring] of this.pickedRings) {
      if (this.picked.has(id) && this.tokens.has(id)) continue;
      this.scene.remove(ring);
      this.pickedRings.delete(id);
    }
    const moves: number[] = [];
    const attacks: number[] = [];
    const lift = 0.3;
    for (const id of this.picked) {
      const t = this.tokens.get(id);
      if (!t) continue;
      let ring = this.pickedRings.get(id);
      if (!ring) {
        ring = new THREE.Mesh(this.ring.geometry, this.pickedRing);
        ring.renderOrder = 4;
        this.pickedRings.set(id, ring);
        this.scene.add(ring);
      }
      const { x, z } = t.pos;
      const y = (t.form === "air" ? t.pos.y : this.heightAt(x, z)) + 0.06;
      ring.position.set(x, y, z);
      const target = t.sq.target ? this.tokens.get(t.sq.target) : undefined;
      if (target)
        attacks.push(
          x,
          y + lift,
          z,
          target.pos.x,
          target.pos.y + lift,
          target.pos.z,
        );
      else if (t.sq.goal) {
        const gx = t.sq.goal.x + 0.5;
        const gz = t.sq.goal.y + 0.5;
        moves.push(x, y + lift, z, gx, this.heightAt(gx, gz) + lift, gz);
      }
      // Then each queued order's leg, from where the one before ends.
      let from = target
        ? { x: target.pos.x, z: target.pos.z }
        : t.sq.goal
          ? { x: t.sq.goal.x + 0.5, z: t.sq.goal.y + 0.5 }
          : { x, z };
      for (const w of t.sq.queue) {
        const to = { x: w.x + 0.5, z: w.y + 0.5 };
        (w.attack ? attacks : moves).push(
          from.x,
          this.heightAt(from.x, from.z) + lift,
          from.z,
          to.x,
          this.heightAt(to.x, to.z) + lift,
          to.z,
        );
        from = to;
      }
    }
    const set = (lines: THREE.LineSegments, points: number[]) =>
      lines.geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(points, 3),
      );
    set(this.moveLines, moves);
    set(this.attackLines, attacks);
  }

  /** The Landing Zone under a screen point, by index, or null. */
  pointAt(clientX: number, clientY: number) {
    const at = this.groundAt(clientX, clientY);
    if (!at) return null;
    const r = this.look.captureRadius + 0.5;
    const i = this.lastPoints.findIndex(
      (p) => Math.hypot(p.x + 0.5 - at.x, p.y + 0.5 - at.z) <= r,
    );
    return i < 0 ? null : i;
  }

  /** Where a screen point meets the ground, in world units. */
  private groundAt(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    return ray.intersectObject(this.ground)[0]?.point ?? null;
  }

  private isWater(i: number) {
    const id = this.field.terrains[this.field.terrain[i] ?? 0] ?? "";
    return (this.field.heights[i] ?? 0) === 0 && this.look.blocked(id);
  }

  /** The ground's top in world units: a cell's level, or a water bed. */
  private top(i: number) {
    return this.isWater(i)
      ? -WATER_DEPTH
      : (this.field.heights[i] ?? 0) * LEVEL;
  }

  /**
   * The ground: a cell's corners at the average of the cells round them, so
   * a level change is a slope ground units can be seen to climb (the sim
   * lets them step between any two walkable cells); each cell coloured by
   * its Terrain, lighter per level, with a little noise. The map's edge drops
   * to a skirt.
   */
  private terrain() {
    const { width: w, height: h, terrains, terrain, heights } = this.field;
    const colours = terrains.map(
      (id) => new THREE.Color(this.look.terrainColour(id)),
    );
    const pos: number[] = [];
    const col: number[] = [];
    const uv: number[] = [];
    const quad = (
      a: number[],
      b: number[],
      c: number[],
      d: number[],
      colour: THREE.Color,
    ) => {
      for (const v of [a, b, c, a, c, d]) {
        pos.push(...v);
        col.push(colour.r, colour.g, colour.b);
        uv.push((v[0] ?? 0) / w, (v[2] ?? 0) / h); // the fog texture, a texel a cell
      }
    };
    const at = (x: number, z: number) => [x, this.corner(x, z), z];
    const skirt = -WATER_DEPTH - 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const c = (colours[terrain[i] ?? 0] ?? new THREE.Color()).clone();
        c.offsetHSL(
          0,
          0,
          0.05 * (heights[i] ?? 0) + (noise(x, y) - 0.5) * 0.04,
        );
        quad(at(x, y), at(x, y + 1), at(x + 1, y + 1), at(x + 1, y), c);
      }
    }
    const edge = new THREE.Color("#1a1f1a");
    for (let x = 0; x < w; x++) {
      for (const z of [0, h]) {
        const a = at(x, z);
        const b = at(x + 1, z);
        quad(a, [x, skirt, z], [x + 1, skirt, z], b, edge);
      }
    }
    for (let z = 0; z < h; z++) {
      for (const x of [0, w]) {
        const a = at(x, z);
        const b = at(x, z + 1);
        quad(a, [x, skirt, z], [x, skirt, z + 1], b, edge);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return new THREE.Mesh(
      g,
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        map: this.fog,
        side: THREE.DoubleSide,
      }),
    );
  }

  /** Darkens the ground out of Sight; a pad shows only in Sight, or if it's yours. */
  private drawFog() {
    const { width: w, height: h } = this.field;
    const alpha = fogOver(
      this.field,
      this.look,
      this.lastSquads,
      this.lastPads,
      this.fogOf,
    );
    const data = this.fog.image.data as Uint8Array;
    for (let i = 0; i < w * h; i++) {
      const v = 255 * (1 - (alpha[i] ?? 0));
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    }
    this.fog.needsUpdate = true;
    this.miniFog.width = w;
    this.miniFog.height = h;
    const fctx = this.miniFog.getContext("2d");
    if (fctx) {
      const img = fctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++)
        img.data[i * 4 + 3] = (alpha[i] ?? 0) * 255;
      fctx.putImageData(img, 0, 0);
    }
    this.lastPads.forEach((p, i) => {
      const m = this.pads[i];
      if (m)
        m.group.visible =
          (alpha[p.y * w + p.x] ?? 0) === 0 ||
          (!!this.fogOf && p.owner === this.fogOf);
    });
  }

  /** A Landing Zone's or pad's marks, laid flat on the ground at a cell. */
  private mark(
    x: number,
    y: number,
    outline: THREE.BufferGeometry,
    fill: THREE.BufferGeometry,
    text: string,
    className: string,
  ) {
    const group = new THREE.Group();
    group.position.set(
      x + 0.5,
      this.heightAt(x + 0.5, y + 0.5) + 0.08,
      y + 0.5,
    );
    const flat = (g: THREE.BufferGeometry, opacity: number) => {
      const m = new THREE.Mesh(
        g.rotateX(-Math.PI / 2),
        onTop(new THREE.MeshBasicMaterial({ transparent: true, opacity })),
      );
      m.renderOrder = 3; // over the ground, under the overlays
      group.add(m);
      return m;
    };
    const m: Mark = {
      group,
      fill: flat(fill, 0.25),
      outline: flat(outline, 0.95),
      arc: flat(new THREE.BufferGeometry(), 0.95),
      progress: 0,
    };
    const el = document.createElement("div");
    el.className = className;
    el.textContent = text;
    const label = new CSS2DObject(el);
    label.position.y = 0.6;
    group.add(label);
    this.scene.add(group);
    return m;
  }

  /** A mark's capture arc, from 12 o'clock, for progress ticks of captureTicks. */
  private arc(m: Mark, progress: number, inner: number, outer: number) {
    if (progress === m.progress) return;
    m.progress = progress;
    const done = Math.min(1, progress / Math.max(1, this.look.captureTicks));
    m.arc.geometry.dispose();
    m.arc.geometry =
      progress > 0
        ? new THREE.RingGeometry(
            inner,
            outer,
            48,
            1,
            Math.PI / 2,
            -Math.PI * 2 * done,
          ).rotateX(-Math.PI / 2)
        : new THREE.BufferGeometry();
  }

  /** Each Landing Zone: its capture area in the holder's colour, its letter, and the taker's arc. */
  private drawPoints(points: ControlPoint[]) {
    const r = this.look.captureRadius + 0.5;
    points.forEach((p, i) => {
      this.points[i] ??= this.mark(
        p.x,
        p.y,
        new THREE.RingGeometry(r - 0.25, r, 48),
        new THREE.CircleGeometry(r, 48),
        `LZ ${POINT_NAMES[i] ?? "?"}`,
        "font-display font-bold text-base text-white [text-shadow:0_0_4px_#000,0_0_2px_#000]",
      );
      const m = this.points[i] as Mark;
      const owner = p.owner ? this.look.sideColour[p.owner] : UNHELD;
      colourOf(m.fill).set(owner);
      colourOf(m.outline).set(owner);
      colourOf(m.arc).set(p.taker ? this.look.sideColour[p.taker] : UNHELD);
      this.arc(m, p.progress, r + 0.1, r + 0.45);
    });
  }

  /** Each build pad: a square in its holder's colour, amber while a turret goes up, and the taker's arc. */
  private drawPads(pads: BuildPad[]) {
    pads.forEach((p, i) => {
      this.pads[i] ??= this.mark(
        p.x,
        p.y,
        new THREE.RingGeometry(0.7, 0.9, 4, 1, Math.PI / 4), // a square ring, edges along the grid
        new THREE.PlaneGeometry(1.2, 1.2),
        String(i + 1),
        "font-mono text-[10px] text-white [text-shadow:0_0_3px_#000,0_0_2px_#000]",
      );
      const m = this.pads[i] as Mark;
      const colour = (s: Side | null) => (s ? this.look.sideColour[s] : UNHELD);
      colourOf(m.outline).set(colour(p.owner));
      colourOf(m.arc).set(colour(p.taker));
      colourOf(m.fill).set("#f0a93b");
      m.fill.visible = p.building !== "";
      this.arc(m, p.progress, 1.0, 1.25);
    });
  }

  /** The minimap's ground: each cell in its Terrain colour, lighter per level. */
  private drawMiniGround() {
    const { width: w, height: h, terrains, terrain, heights } = this.field;
    this.miniGround.width = w;
    this.miniGround.height = h;
    const ctx = this.miniGround.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(w, h);
    const colours = terrains.map(
      (id) => new THREE.Color(this.look.terrainColour(id)),
    );
    for (let i = 0; i < w * h; i++) {
      const c = (colours[terrain[i] ?? 0] ?? new THREE.Color()).clone();
      c.offsetHSL(0, 0, 0.07 * (heights[i] ?? 0));
      img.data[i * 4] = c.r * 255;
      img.data[i * 4 + 1] = c.g * 255;
      img.data[i * 4 + 2] = c.b * 255;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  /** The minimap, each frame: ground, fog, Landing Zones, squads, and the camera's view. */
  private drawMini() {
    const ctx = this.mini.getContext("2d");
    if (!ctx) return;
    const k = this.mini.width / this.field.width; // canvas pixels per cell
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.miniGround, 0, 0, this.mini.width, this.mini.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.miniFog, 0, 0, this.mini.width, this.mini.height);
    ctx.lineWidth = 2;
    for (const p of this.lastPoints) {
      ctx.strokeStyle = p.owner ? this.look.sideColour[p.owner] : UNHELD;
      ctx.beginPath();
      ctx.arc(
        (p.x + 0.5) * k,
        (p.y + 0.5) * k,
        (this.look.captureRadius + 0.5) * k,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    for (const t of this.tokens.values()) {
      ctx.fillStyle = this.look.sideColour[t.sq.side];
      const s = t.form === "building" || t.form === "post" ? 8 : 6; // the canvas is at twice its size
      ctx.fillRect(t.pos.x * k - s / 2, t.pos.z * k - s / 2, s, s);
    }
    // Where the screen's corners meet the ground: what the camera sees.
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ray = new THREE.Raycaster();
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([x, y]) => {
      ray.setFromCamera(new THREE.Vector2(x, y), this.camera);
      return ray.ray.intersectPlane(ground, new THREE.Vector3());
    });
    ctx.strokeStyle = "#f2f5f7";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    corners.forEach((c, i) => {
      if (!c) return;
      if (i === 0) ctx.moveTo(c.x * k, c.z * k);
      else ctx.lineTo(c.x * k, c.z * k);
    });
    ctx.closePath();
    ctx.stroke();
  }

  private readonly onMini = (e: PointerEvent) => {
    if (e.type === "pointerdown" && e.button === 2) {
      // A right-click on the minimap sends the picked squads there.
      const rect = this.mini.getBoundingClientRect();
      const cell = {
        x: clamp(
          Math.floor(((e.clientX - rect.left) / rect.width) * this.field.width),
          0,
          this.field.width - 1,
        ),
        y: clamp(
          Math.floor(
            ((e.clientY - rect.top) / rect.height) * this.field.height,
          ),
          0,
          this.field.height - 1,
        ),
      };
      if (this.commandSide !== null && this.picked.size > 0)
        this.onOrder?.([...this.picked], {
          kind: "move",
          cell,
          queue: e.shiftKey,
        });
      return;
    }
    if (e.type === "pointerdown") {
      if (e.button !== 0) return;
      this.mini.setPointerCapture(e.pointerId);
      this.miniDrag = true;
    } else if (e.type === "pointerup") {
      this.miniDrag = false;
      return;
    }
    if (!this.miniDrag) return;
    const rect = this.mini.getBoundingClientRect();
    this.target.x = clamp(
      ((e.clientX - rect.left) / rect.width) * this.field.width,
      0,
      this.field.width,
    );
    this.target.z = clamp(
      ((e.clientY - rect.top) / rect.height) * this.field.height,
      0,
      this.field.height,
    );
  };

  /** A grid corner's height: the average of the cells round it. */
  private corner(x: number, z: number) {
    return this.corners[z * (this.field.width + 1) + x] ?? 0;
  }

  /** The ground's height under a point, in world units, between its cell's corners. */
  private heightAt(x: number, z: number) {
    const { width: w, height: h } = this.field;
    const cx = Math.min(w - 1, Math.max(0, Math.floor(x)));
    const cz = Math.min(h - 1, Math.max(0, Math.floor(z)));
    const fx = Math.min(1, Math.max(0, x - cx));
    const fz = Math.min(1, Math.max(0, z - cz));
    const top = this.corner(cx, cz) * (1 - fx) + this.corner(cx + 1, cz) * fx;
    const bottom =
      this.corner(cx, cz + 1) * (1 - fx) + this.corner(cx + 1, cz + 1) * fx;
    return top * (1 - fz) + bottom * fz;
  }

  /**
   * Placeholder cover: a tree or two on each cell of a Terrain with cover −2
   * or less, a rock on about half of those with −1, tinted by the ground.
   */
  private dressing() {
    const { width: w, height: h, terrains, terrain } = this.field;
    type Item = [number, number, number, THREE.Color]; // x, z, a jitter, colour
    const trees: Item[] = [];
    const rocks: Item[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (this.isWater(i)) continue;
        const id = terrains[terrain[i] ?? 0] ?? "";
        const cover = this.look.cover(id);
        const n = noise(x, y);
        const c = new THREE.Color(this.look.terrainColour(id));
        if (cover <= -2) {
          c.multiplyScalar(0.6);
          trees.push([x + 0.3 + n * 0.4, y + 0.3 + noise(y, x) * 0.4, n, c]);
          if (n > 0.5)
            trees.push([x + 0.75 - n * 0.3, y + 0.8 - n * 0.4, 1 - n, c]);
        } else if (cover < 0 && n > 0.5) {
          c.multiplyScalar(0.75);
          rocks.push([x + 0.2 + n * 0.6, y + 0.25 + noise(y, x) * 0.5, n, c]);
        }
      }
    }
    const place = (g: THREE.BufferGeometry, items: Item[]) => {
      const m = new THREE.InstancedMesh(
        g,
        new THREE.MeshLambertMaterial(),
        Math.max(1, items.length),
      );
      const o = new THREE.Object3D();
      items.forEach(([x, z, n, c], k) => {
        o.position.set(x, this.heightAt(x, z), z);
        o.rotation.y = n * 6.28;
        o.scale.setScalar(0.75 + n * 0.5);
        o.updateMatrix();
        m.setMatrixAt(k, o.matrix);
        m.setColorAt(k, c);
      });
      m.count = items.length;
      return m;
    };
    return [
      place(new THREE.ConeGeometry(0.22, 0.75, 6).translate(0, 0.37, 0), trees),
      place(new THREE.DodecahedronGeometry(0.15).translate(0, 0.07, 0), rocks),
    ];
  }

  /** A see-through surface just under level 0, over every water bed. */
  private water() {
    const { width: w, height: h, terrains, terrain } = this.field;
    const at = terrain.findIndex((_, i) => this.isWater(i));
    const id = at < 0 ? undefined : terrains[terrain[at] ?? 0];
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshLambertMaterial({
        color: id ? this.look.terrainColour(id) : "#2d5d78",
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(w / 2, -0.12, h / 2);
    plane.visible = !!id;
    return plane;
  }

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private tick(t: number) {
    const dt = Math.min(0.1, (t - (this.last || t)) / 1000);
    this.last = t;
    // Held keys: pan at a speed that scales with how far out the camera is.
    let dx = 0;
    let dz = 0;
    for (const k of this.held) {
      const p = PAN_KEYS[k];
      if (p) [dx, dz] = [dx + p[0], dz + p[1]];
      if (k === "q") this.yaw += dt * 1.6;
      if (k === "e") this.yaw -= dt * 1.6;
    }
    if (dx || dz) this.pan(dx * this.distance * dt, dz * this.distance * dt);
    this.place();
    this.drawSquads(t, dt);
    if (this.commandSide !== null || this.pickedRings.size > 0)
      this.drawOrders();
    this.drawBadges();
    const sel =
      this.selected === null ? undefined : this.tokens.get(this.selected);
    this.ring.visible = !!sel;
    if (sel)
      this.ring.position.set(
        sel.pos.x,
        (sel.form === "air" ? sel.pos.y : this.heightAt(sel.pos.x, sel.pos.z)) +
          0.06,
        sel.pos.z,
      );
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      if (!e) continue;
      const k = (t - e.t0) / e.ms;
      const m = e.obj.material as THREE.Material;
      if (k < 1) {
        m.opacity = 1 - k;
        continue;
      }
      this.scene.remove(e.obj);
      e.obj.geometry.dispose();
      m.dispose();
      this.effects.splice(i, 1);
    }
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    this.drawMini();
    this.frame = requestAnimationFrame((n) => this.tick(n));
  }

  /** Loads a model: its body and trim, each instanced. */
  private loadModel(url: string) {
    this.models.set(url, null);
    const instanced = (
      geometry: THREE.BufferGeometry,
      vertexColors: boolean,
    ) => {
      const m = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshLambertMaterial({ vertexColors, flatShading: true }),
        MAX_PER_FORM,
      );
      m.count = 0;
      m.frustumCulled = false; // instances move; the base geometry's bounds don't
      this.scene.add(m);
      return m;
    };
    new GLTFLoader().load(
      url,
      (gltf) => {
        if (this.disposed) return;
        let body: THREE.InstancedMesh | null = null;
        let trim: THREE.InstancedMesh | null = null;
        gltf.scene.updateMatrixWorld();
        gltf.scene.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
          if ((o.material as THREE.Material).name === "trim")
            trim = instanced(g, false);
          else if (body)
            console.warn(
              url,
              "has more than one body mesh: only its first is drawn",
            );
          else body = instanced(g, !!g.attributes.color);
        });
        if (body) this.models.set(url, { body, trim });
      },
      undefined,
      () => {}, // its squads keep their placeholder shape
    );
  }

  /**
   * Every squad's living members (up to 4) in its cell, moving between
   * ticks; aircraft fly above the ground; vehicles and aircraft face the way
   * they last moved, and so does infantry with a model.
   */
  private drawSquads(now: number, dt: number) {
    const counts: Record<Form, number> = {
      infantry: 0,
      vehicle: 0,
      air: 0,
      building: 0,
      post: 0,
    };
    const modelCounts = new Map<Model, number>();
    const o = new THREE.Object3D();
    const sides: Record<Side, THREE.Color> = {
      attacker: new THREE.Color(this.look.sideColour.attacker),
      defender: new THREE.Color(this.look.sideColour.defender),
    };
    for (const t of this.tokens.values()) {
      const k = this.still ? 1 : Math.min(1, (now - t.t0) / t.ms);
      // Turn the short way round, no faster than TURN.
      const turn = Math.atan2(
        Math.sin(t.heading - t.facing),
        Math.cos(t.heading - t.facing),
      );
      t.facing += this.still
        ? turn
        : Math.sign(turn) * Math.min(Math.abs(turn), TURN * dt);
      const x = t.from.x + (t.to.x - t.from.x) * k;
      const z = t.from.y + (t.to.y - t.from.y) * k;
      t.pos.set(
        x,
        t.form === "air" ? this.ceiling + FLY : this.heightAt(x, z),
        z,
      );
      const model = t.model ? this.models.get(t.model) : null;
      const mesh = model?.body ?? this.forms[t.form];
      const many =
        t.form === "infantry" || t.form === "vehicle" || t.form === "air";
      const spots = SPOTS[many ? Math.min(4, t.sq.count) : 1] ?? [];
      for (const [sx, sz] of spots) {
        const n = model ? (modelCounts.get(model) ?? 0) : counts[t.form]++;
        if (model) modelCounts.set(model, n + 1);
        if (n >= MAX_PER_FORM) break;
        o.position.set(
          x + sx,
          t.form === "air" ? t.pos.y : this.heightAt(x + sx, z + sz),
          z + sz,
        );
        // A capsule looks the same any way round; a model faces where it's going.
        o.rotation.set(0, t.form === "infantry" && !model ? 0 : t.facing, 0);
        o.scale.setScalar(t.sq.dropship ? 2.4 : 1);
        o.updateMatrix();
        mesh.setMatrixAt(n, o.matrix);
        if (model) {
          model.trim?.setMatrixAt(n, o.matrix);
          model.trim?.setColorAt(n, sides[t.sq.side]);
        } else mesh.setColorAt(n, sides[t.sq.side]);
      }
    }
    const done = (mesh: THREE.InstancedMesh, count: number) => {
      mesh.count = Math.min(MAX_PER_FORM, count);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    for (const form of Object.keys(this.forms) as Form[])
      done(this.forms[form], counts[form]);
    for (const model of this.models.values()) {
      if (!model) continue;
      done(model.body, modelCounts.get(model) ?? 0);
      if (model.trim) done(model.trim, modelCounts.get(model) ?? 0);
    }
  }

  /** Sets the camera from its target, distance, pitch and yaw. */
  private place() {
    const flat = Math.cos(PITCH) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * flat,
      this.target.y + Math.sin(PITCH) * this.distance,
      this.target.z + Math.cos(this.yaw) * flat,
    );
    this.camera.lookAt(this.target);
  }

  /** Moves the target by screen-relative amounts: right and down the screen. */
  private pan(right: number, down: number) {
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    this.target.x = clamp(
      this.target.x + right * c + down * s,
      0,
      this.field.width,
    );
    this.target.z = clamp(
      this.target.z - right * s + down * c,
      0,
      this.field.height,
    );
  }

  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.distance = clamp(
      this.distance * Math.exp(e.deltaY * 0.0012),
      6,
      this.maxDistance,
    );
  };

  // Watching: left-drag pans, middle-drag rotates. Commanding: the left
  // button picks, the right orders, the middle pans (Q/E rotate).
  private readonly onDown = (e: PointerEvent) => {
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.pressed = { x: e.clientX, y: e.clientY };
    if (e.button === 1) e.preventDefault(); // not the browser's autoscroll
    if (this.commandSide !== null && e.button === 0)
      this.boxFrom = { x: e.clientX, y: e.clientY }; // a click, or a box
    else if (this.commandSide !== null && e.button === 1)
      this.drag = { x: e.clientX, y: e.clientY, button: 0 };
    else if (e.button === 0 || e.button === 1)
      this.drag = { x: e.clientX, y: e.clientY, button: e.button };
  };

  private readonly onMove = (e: PointerEvent) => {
    const from = this.boxFrom;
    if (from) {
      const rect = this.container.getBoundingClientRect();
      Object.assign(this.box.style, {
        display: "block",
        left: `${Math.min(from.x, e.clientX) - rect.left}px`,
        top: `${Math.min(from.y, e.clientY) - rect.top}px`,
        width: `${Math.abs(e.clientX - from.x)}px`,
        height: `${Math.abs(e.clientY - from.y)}px`,
      });
      return;
    }
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    if (this.drag.button === 1) {
      this.yaw -= dx * 0.006;
      return;
    }
    // A pixel's worth of ground at the target's distance.
    const perPixel =
      (2 * this.distance * Math.tan((this.camera.fov * Math.PI) / 360)) /
      this.container.clientHeight;
    this.pan(-dx * perPixel, (-dy * perPixel) / Math.sin(PITCH));
  };

  private readonly onUp = (e: PointerEvent) => {
    this.renderer.domElement.releasePointerCapture(e.pointerId);
    this.drag = null;
    const p = this.pressed;
    this.pressed = null;
    const from = this.boxFrom;
    this.boxFrom = null;
    this.box.style.display = "none";
    const click = !!p && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= 4;
    // A right-click on a pad you can see opens its menu: commanding, only on
    // one you hold, since right-clicking another sends squads to take it.
    if (e.button === 2 && click) {
      const at = this.groundAt(e.clientX, e.clientY);
      const pad = at
        ? this.lastPads.findIndex(
            (q, i) =>
              this.pads[i]?.group.visible &&
              (this.commandSide === null || q.owner === this.commandSide) &&
              Math.abs(q.x + 0.5 - at.x) <= 0.8 &&
              Math.abs(q.y + 0.5 - at.z) <= 0.8,
          )
        : -1;
      if (pad >= 0 && this.onPadMenu) {
        this.onPadMenu(pad, e.clientX, e.clientY);
        return;
      }
    }
    if (this.commandSide !== null) {
      if (e.button === 2) {
        this.armed = false;
        this.renderer.domElement.style.cursor = "";
        this.order(e.clientX, e.clientY, "move", e.shiftKey);
      } else if (e.button === 0 && click && this.armed) {
        this.order(e.clientX, e.clientY, "attackMove", e.shiftKey);
        this.armed = false;
        this.renderer.domElement.style.cursor = "";
      } else if (e.button === 0 && click) {
        const id = this.squadNear(e.clientX, e.clientY, (sq) =>
          this.orderable(sq),
        );
        const next = new Set(e.shiftKey ? this.picked : []);
        if (id !== null && e.shiftKey && next.has(id)) next.delete(id);
        else if (id !== null) next.add(id);
        this.pick([...next]);
      } else if (e.button === 0 && from) {
        // A box on screen: every squad of yours drawn inside it.
        const [x0, x1] = [
          Math.min(from.x, e.clientX),
          Math.max(from.x, e.clientX),
        ];
        const [y0, y1] = [
          Math.min(from.y, e.clientY),
          Math.max(from.y, e.clientY),
        ];
        const next = new Set(e.shiftKey ? this.picked : []);
        for (const t of this.tokens.values()) {
          const s = this.onScreen(t);
          if (
            this.orderable(t.sq) &&
            !s.behind &&
            s.x >= x0 &&
            s.x <= x1 &&
            s.y >= y0 &&
            s.y <= y1
          )
            next.add(t.sq.id);
        }
        this.pick([...next]);
      }
      return;
    }
    // Watching: a click, not a pan, picks the squad drawn under it.
    if (e.button === 0 && click && this.onPick)
      this.onPick(this.squadNear(e.clientX, e.clientY));
  };

  private readonly onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    // Commanding, Q selects your army: turn with the middle button instead.
    const turn = (k === "q" || k === "e") && this.commandSide === null;
    if (!(k in PAN_KEYS) && !turn) return;
    if (e.type === "keyup") {
      this.held.delete(k);
      return;
    }
    // Only with the pointer over it: the galaxy map pans on the same keys.
    if (!this.hovered) return;
    if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    this.held.add(k);
    e.preventDefault(); // the galaxy map skips a used key
  };

  private hovered = false;
  private readonly onHover = (e: PointerEvent) => {
    this.hovered = e.type === "pointerenter";
  };

  private readonly onBlur = () => this.held.clear();
}

/** Draws a material over everything: marks and lines stay readable over hills. */
function onTop<M extends THREE.Material>(m: M) {
  m.depthTest = false;
  m.depthWrite = false;
  return m;
}

const colourOf = (m: THREE.Mesh) =>
  (m.material as THREE.MeshBasicMaterial).color;

// A cell's steady jitter, 0 to 1.
const noise = (x: number, y: number) => {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
