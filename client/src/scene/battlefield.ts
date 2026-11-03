import * as THREE from "three";
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

/** Movement between two sim ticks: one tick, in ms. */
const TICK_MS = 200;
const TRACER_MS = 250;
const FOG = 0.6; // how dark unseen cells are

export type BattlefieldLook = {
  /** A Terrain id's placeholder colour. */
  terrainColour: (id: string) => string;
  /** Each side's colour. */
  sideColour: Record<Side, string>;
  /** Your side: its squads' Sight clears the fog. null, a Spectator: both sides' does. */
  you: Side | null;
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

type PadMark = {
  outline: THREE.Mesh;
  fill: THREE.Mesh;
  arc: THREE.Mesh;
  label: CSS2DObject;
  progress: number;
};

/** The colour of a build pad nobody holds. */
const UNHELD = "#9ca3af";

/** Control Points by index, as the Battle window names them. */
export const POINT_NAMES = "ABCDEFGH";

/** A line drawn over the Battlefield, cell to cell: the Battle Lab's AI overlays. */
export type OverlayLine = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  colour: string;
  dashed?: boolean;
};

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
  private readonly padMarks: PadMark[] = [];
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
  private pressed: { x: number; y: number } | null = null;
  // Whose Sight clears the fog: a side, both (null), or no fog at all (false).
  private fogOf: Side | null | false;
  private lastSquads: Squad[] = [];
  private readonly overlays = new THREE.Group();
  private readonly ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.7, 24),
    new THREE.MeshBasicMaterial({ color: "#f2f5f7" }),
  );
  private selected: number | null = null;
  /** Hears a click on the map: the squad under it, or null. */
  onPick?: (squad: number | null) => void;
  // Commanding a side: the left button picks its squads, by click or a
  // dragged box; the right button orders them; the middle button pans.
  private commandSide: Side | null = null;
  private readonly picked = new Set<number>();
  private armed = false; // the next left click is an Attack-move
  private readonly rings = new Map<number, THREE.Mesh>();
  private readonly moveLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: "#e6ebef",
      transparent: true,
      opacity: 0.7,
    }),
  );
  private readonly attackLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: "#f08a7a" }),
  );
  private readonly pickedRing = new THREE.MeshBasicMaterial({
    color: "#facc15",
  });
  private readonly box = document.createElement("div");
  private boxFrom: { x: number; y: number } | null = null;
  /** Hears the squads you've picked, when that changes. */
  onSelect?: (squads: number[]) => void;
  /** Hears an order to the picked squads. */
  onOrder?: (squads: number[], order: SquadOrder) => void;

  constructor(
    private readonly container: HTMLElement,
    private readonly field: Battlefield,
    private readonly look: BattlefieldLook,
  ) {
    this.scene.background = new THREE.Color("#04070a");
    this.fogOf = look.you;
    this.overlays.position.z = 1.2;
    this.ring.visible = false;
    this.ring.position.z = 1.3;
    this.scene.add(this.overlays, this.ring, this.moveLines, this.attackLines);
    this.moveLines.position.z = this.attackLines.position.z = 1.25;
    Object.assign(this.box.style, {
      position: "absolute",
      display: "none",
      border: "1px dashed #e6ebef",
      background: "#4fa3e014",
      pointerEvents: "none",
    });
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
    container.append(
      this.renderer.domElement,
      this.labels.domElement,
      this.box,
    );

    const canvas = this.renderer.domElement;
    canvas.style.touchAction = "none";
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault()); // the right button orders

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
    for (const m of this.padMarks) m.label.element.remove();
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
      t.label.element.textContent = sq.commandPost ? "CP" : String(sq.count);
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
    this.drawPads(battle.pads);
    this.lastSquads = battle.squads;
    this.drawFog(battle.squads);
    // Squads that died or left drop out of the selection.
    const gone = [...this.picked].filter((id) => !seen.has(id));
    if (gone.length > 0)
      this.pick([...this.picked].filter((id) => seen.has(id)));
  }

  /** Whose Sight clears the fog: a side, both sides (null), or none: no fog (false). */
  setFog(of: Side | null | false) {
    this.fogOf = of;
    this.drawFog(this.lastSquads);
  }

  /** Replaces the overlay lines. */
  overlay(lines: OverlayLine[]) {
    for (const obj of this.overlays.children) {
      const line = obj as THREE.Line;
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.overlays.clear();
    for (const l of lines) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(l.from.x + 0.5, -(l.from.y + 0.5), 0),
          new THREE.Vector3(l.to.x + 0.5, -(l.to.y + 0.5), 0),
        ]),
        l.dashed
          ? new THREE.LineDashedMaterial({
              color: l.colour,
              dashSize: 0.8,
              gapSize: 0.5,
            })
          : new THREE.LineBasicMaterial({ color: l.colour }),
      );
      if (l.dashed) line.computeLineDistances();
      this.overlays.add(line);
    }
  }

  /** Rings a squad, following it; null rings none. */
  select(squad: number | null) {
    this.selected = squad;
  }

  /** Commands side's squads from the map, or with null stops. */
  command(side: Side | null) {
    this.commandSide = side;
    if (side === null) this.pick([]);
  }

  /** Sets the picked squads, ringing each, and tells onSelect. */
  pick(squads: number[]) {
    this.picked.clear();
    for (const id of squads) this.picked.add(id);
    this.armed = false;
    this.renderer.domElement.style.cursor = "";
    this.onSelect?.([...this.picked]);
  }

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

  /** The world point under a pointer event. */
  private world(e: MouseEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      this.camera.left +
        ((e.clientX - rect.left) / rect.width) *
          (this.camera.right - this.camera.left),
      this.camera.top -
        ((e.clientY - rect.top) / rect.height) *
          (this.camera.top - this.camera.bottom),
    );
  }

  /** The nearest squad within a cell of a world point that passes ok, if any. */
  private squadAt(at: THREE.Vector2, ok: (sq: Squad) => boolean = () => true) {
    let best: number | null = null;
    let bestD = 0.8;
    for (const sq of this.lastSquads) {
      const t = this.tokens.get(sq.id);
      if (!t || !ok(sq)) continue;
      const d = Math.hypot(t.mesh.position.x - at.x, t.mesh.position.y - at.y);
      if (d < bestD) [best, bestD] = [sq.id, d];
    }
    return best;
  }

  /** Orders the picked squads at a world point, and marks where. */
  private order(at: THREE.Vector2, kind: "move" | "attackMove") {
    if (this.picked.size === 0) return;
    const enemy = this.squadAt(at, (sq) => sq.side !== this.commandSide);
    const cell = {
      x: Math.min(Math.max(Math.floor(at.x), 0), this.field.width - 1),
      y: Math.min(Math.max(Math.floor(-at.y), 0), this.field.height - 1),
    };
    this.onOrder?.(
      [...this.picked],
      enemy !== null && kind === "move"
        ? { kind: "attack", target: enemy }
        : { kind, cell },
    );
    const mark = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.55, 20),
      new THREE.MeshBasicMaterial({
        color: enemy !== null && kind === "move" ? "#f08a7a" : "#7fdca0",
        transparent: true,
      }),
    );
    mark.position.set(cell.x + 0.5, -(cell.y + 0.5), 1.3);
    this.scene.add(mark);
    this.effects.push({ obj: mark, t0: performance.now(), ms: 600 });
  }

  /** Rings each picked squad, and lines to where each is going or firing. */
  private drawOrders() {
    for (const [id, ring] of this.rings) {
      if (this.picked.has(id)) continue;
      this.scene.remove(ring);
      this.rings.delete(id);
    }
    const moves: number[] = [];
    const attacks: number[] = [];
    for (const sq of this.lastSquads) {
      const t = this.tokens.get(sq.id);
      if (!t || !this.picked.has(sq.id)) continue;
      let ring = this.rings.get(sq.id);
      if (!ring) {
        ring = new THREE.Mesh(this.ring.geometry, this.pickedRing);
        this.rings.set(sq.id, ring);
        this.scene.add(ring);
      }
      const { x, y } = t.mesh.position;
      ring.position.set(x, y, 1.3);
      const target = sq.target ? this.tokens.get(sq.target) : undefined;
      if (target)
        attacks.push(
          x,
          y,
          0,
          target.mesh.position.x,
          target.mesh.position.y,
          0,
        );
      else if (sq.goal)
        moves.push(x, y, 0, sq.goal.x + 0.5, -(sq.goal.y + 0.5), 0);
    }
    const set = (lines: THREE.LineSegments, points: number[]) =>
      lines.geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(points, 3),
      );
    set(this.moveLines, moves);
    set(this.attackLines, attacks);
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
    if (sq.commandPost) mesh.scale.setScalar(1.8); // the objective: bigger than any building
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
        el.textContent = `LZ ${POINT_NAMES[i] ?? "?"}`;
        const label = new CSS2DObject(el);
        group.add(label);
        this.scene.add(group);
        m = { disc, ring, arc, label, progress: 0 };
        this.markers.push(m);
      }
      const owner = p.owner ? this.look.sideColour[p.owner] : UNHELD;
      (m.disc.material as THREE.MeshBasicMaterial).color.set(owner);
      (m.ring.material as THREE.MeshBasicMaterial).color.set(owner);
      (m.arc.material as THREE.MeshBasicMaterial).color.set(
        p.taker ? this.look.sideColour[p.taker] : UNHELD,
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

  /**
   * Each build pad: a square outline in its holder's colour (grey for
   * nobody) with its number, filled amber while a turret goes up, and an arc
   * of the taker's colour for capture progress. A finished turret draws as
   * a building token. Over the fog, since pads are always visible.
   */
  private drawPads(pads: BuildPad[]) {
    const material = (opacity: number) =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
      });
    pads.forEach((p, i) => {
      let m = this.padMarks[i];
      if (!m) {
        const at = centre(p.x, p.y);
        const group = new THREE.Group();
        group.position.set(at.x, at.y, 0.8);
        // Four segments from 45°: a square ring, edges along the grid.
        const outline = new THREE.Mesh(
          new THREE.RingGeometry(0.75, 0.95, 4, 1, Math.PI / 4),
          material(0.95),
        );
        const fill = new THREE.Mesh(
          new THREE.PlaneGeometry(1.2, 1.2),
          material(0.45),
        );
        (fill.material as THREE.MeshBasicMaterial).color.set("#f0a93b");
        const arc = new THREE.Mesh(new THREE.BufferGeometry(), material(0.95));
        for (const o of [fill, outline, arc]) {
          o.renderOrder = 2.5;
          group.add(o);
        }
        const el = document.createElement("div");
        el.className =
          "font-mono text-[10px] text-white [text-shadow:0_0_3px_#000,0_0_2px_#000]";
        el.textContent = String(i + 1);
        const label = new CSS2DObject(el);
        label.center.set(0.5, 1.6);
        group.add(label);
        this.scene.add(group);
        m = { outline, fill, arc, label, progress: 0 };
        this.padMarks.push(m);
      }
      const colour = (s: Side | null) => (s ? this.look.sideColour[s] : UNHELD);
      (m.outline.material as THREE.MeshBasicMaterial).color.set(
        colour(p.owner),
      );
      (m.arc.material as THREE.MeshBasicMaterial).color.set(colour(p.taker));
      m.fill.visible = p.building !== "";
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
                1.05,
                1.3,
                32,
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
    const alpha = new Float32Array(w * h).fill(this.fogOf === false ? 0 : FOG);
    for (const sq of squads) {
      if (this.fogOf && sq.side !== this.fogOf) continue;
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
    const sel =
      this.selected === null ? undefined : this.tokens.get(this.selected);
    this.ring.visible = !!sel;
    if (this.commandSide !== null || this.rings.size > 0) this.drawOrders();
    if (sel)
      this.ring.position.set(sel.mesh.position.x, sel.mesh.position.y, 1.3);
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
    this.pressed = { x: e.clientX, y: e.clientY };
    if (this.commandSide !== null && e.button === 0) {
      this.boxFrom = { x: e.clientX, y: e.clientY }; // a click, or a box
    } else if (this.commandSide === null || e.button === 1) {
      this.drag = { x: e.clientX, y: e.clientY };
    }
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
    const perPixel = (this.fit * this.zoom) / this.container.clientHeight;
    this.centre.x -= (e.clientX - this.drag.x) * perPixel;
    this.centre.y += (e.clientY - this.drag.y) * perPixel;
    this.drag = { x: e.clientX, y: e.clientY };
    this.place();
  };

  private readonly onUp = (e: PointerEvent) => {
    this.drag = null;
    const p = this.pressed;
    this.pressed = null;
    const from = this.boxFrom;
    this.boxFrom = null;
    this.box.style.display = "none";
    if (this.commandSide !== null && p) {
      const click = Math.hypot(e.clientX - p.x, e.clientY - p.y) <= 4;
      if (e.button === 2) {
        this.armed = false;
        this.renderer.domElement.style.cursor = "";
        this.order(this.world(e), "move");
      } else if (e.button === 0 && click && this.armed) {
        this.order(this.world(e), "attackMove");
        this.armed = false;
        this.renderer.domElement.style.cursor = "";
      } else if (e.button === 0 && click) {
        const id = this.squadAt(this.world(e), (sq) => this.orderable(sq));
        const next = new Set(e.shiftKey ? this.picked : []);
        if (id !== null && e.shiftKey && next.has(id)) next.delete(id);
        else if (id !== null) next.add(id);
        this.pick([...next]);
      } else if (e.button === 0 && from) {
        const a = this.world(e);
        const b = this.world({
          clientX: from.x,
          clientY: from.y,
        } as MouseEvent);
        const next = new Set(e.shiftKey ? this.picked : []);
        for (const sq of this.lastSquads) {
          const t = this.tokens.get(sq.id);
          const at = t?.mesh.position;
          if (
            at &&
            this.orderable(sq) &&
            at.x >= Math.min(a.x, b.x) &&
            at.x <= Math.max(a.x, b.x) &&
            at.y >= Math.min(a.y, b.y) &&
            at.y <= Math.max(a.y, b.y)
          )
            next.add(sq.id);
        }
        this.pick([...next]);
      }
      return;
    }
    // A click, not a pan: the nearest squad within a cell, if any.
    if (!this.onPick || !p || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4)
      return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const wx =
      this.camera.left +
      ((e.clientX - rect.left) / rect.width) *
        (this.camera.right - this.camera.left);
    const wy =
      this.camera.top -
      ((e.clientY - rect.top) / rect.height) *
        (this.camera.top - this.camera.bottom);
    let best: number | null = null;
    let bestD = 0.8;
    for (const [id, t] of this.tokens) {
      const d = Math.hypot(t.mesh.position.x - wx, t.mesh.position.y - wy);
      if (d < bestD) [best, bestD] = [id, d];
    }
    this.onPick(best);
  };
}
