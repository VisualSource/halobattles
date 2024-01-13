import { Clock, Color, Vector2, Vector3, Vector4, Quaternion, Matrix4, Spherical, Sphere, Box3, Raycaster, MathUtils, PerspectiveCamera, Scene, Object3D, Object3DEventMap } from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js';
import { update as tweenUpdate } from "@tweenjs/tween.js";
import { UnitStackState } from 'halobattles-shared';
import CameraControls from "camera-controls";
import Lane, { LaneType } from './game_objects/lane';
import Node from './game_objects/node';

export type MapData = {
    nodes: { stacks?: Record<0 | 1 | 2, { state: UnitStackState, icon: string | null }>, owner: string | null; icon: string | null; uuid: string; position: { x: number; y: number; z: number }; color: string; label: string; }[],
    linkes: { uuid: string; nodes: string[], type: string }[]
}

const subset = {
    Vector2: Vector2,
    Vector3: Vector3,
    Vector4: Vector4,
    Quaternion: Quaternion,
    Matrix4: Matrix4,
    Spherical: Spherical,
    Box3: Box3,
    Sphere: Sphere,
    Raycaster: Raycaster,
    MathUtils: MathUtils
}

export default class Engine {
    static Exists() {
        return !!Engine.INSTANCE
    }
    static INSTANCE: Engine | null = null;
    static Create(): Engine {
        const container = document.getElementById("game-container") as HTMLDivElement | null;
        if (!container) throw new Error("No container with id of 'game-container' exists in dom.");
        console.info("Engine created");
        Engine.INSTANCE = new Engine(container);
        return Engine.INSTANCE;
    }
    static Get(): Engine {
        if (!Engine.INSTANCE) throw new Error("No Instace was created");
        return Engine.INSTANCE;
    }
    static Destory(): void {
        Engine.INSTANCE?.destory();
        Engine.INSTANCE = null;
    }
    public ownerId: string | null = null;
    private camera: PerspectiveCamera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 10000);
    private raycaster: Raycaster = new Raycaster();
    private scene: Scene = new Scene();
    private clock = new Clock();
    private renderer: SVGRenderer;
    private overlay: CSS2DRenderer;
    private controls: CameraControls;
    private isDirty = true;
    private renderId: number;
    constructor(private container: HTMLDivElement) {
        CameraControls.install({ THREE: subset });

        this.scene.background = new Color(0x000000);

        this.overlay = new CSS2DRenderer();
        this.overlay.setSize(window.innerWidth, window.innerHeight);
        this.overlay.domElement.classList.add("absolute", "top-0", "pointer-events-none");
        container.appendChild(this.overlay.domElement);

        this.renderer = new SVGRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.domElement.addEventListener("click", this.onClick, { passive: true });
        container.appendChild(this.renderer.domElement);

        this.camera.position.z = 500;
        this.controls = new CameraControls(this.camera, this.renderer.domElement as never as HTMLDivElement);
        this.controls.distance = 300;
        this.controls.infinityDolly = false;
        this.controls.minDistance = 100;
        this.controls.maxDistance = 300;
        this.controls.mouseButtons.left = CameraControls.ACTION.TRUCK;

        window.addEventListener("resize", this.resize);

        this.eventLoop();
    }

    public saveState() {
        const data: MapData = {
            nodes: [],
            linkes: []
        }
        for (const child of this.scene.children) {
            if (child.name === "Node") {
                data.nodes.push({
                    owner: (child as Node).ownerId,
                    icon: (child as Node).icon,
                    uuid: child.uuid,
                    position: child.position,
                    color: (child as Node).color,
                    label: (child as Node).label ?? "Unnamed"
                });
            }

            if (child.name === "Lane") {
                data.linkes.push({
                    uuid: child.uuid,
                    nodes: (child as Lane).nodes,
                    type: (child as Lane).laneType
                });
            }
        }

        return data;
    }

    public async lookAt(x: number, y: number): Promise<void> {

        await this.controls.setLookAt(this.camera.position.x, this.camera.position.y, this.camera.position.z, x, y, this.camera.position.z, true);

    }

    public addObject(obj: Object3D<Object3DEventMap>) {
        this.scene.add(obj);

        this.isDirty = true;
    }

    public getObject<T = Node>(uuid: string) {
        return this.scene.getObjectByProperty("uuid", uuid) as T;
    }

    public unproject(x: number, y: number) {
        let vec = new Vector3(x, y, 0.5);

        vec = vec.unproject(this.camera);

        const dir = vec.sub(this.camera.position).normalize();

        return this.camera.position.clone().add(dir.multiplyScalar((0 - this.camera.position.z) / dir.z));
    }

    public addNode({ stacks, owner, icon, color, x, y, name = "Node" }: { stacks?: Record<0 | 1 | 2, { state: UnitStackState, icon: string | null }>, owner: string | null, icon: string | null, color: number, x: number, y: number, name: string }, uuid?: string) {

        const node = new Node(color, { x, y }, { x: 8, y: 6 });

        node.label = name;
        node.icon = icon;
        node.ownerId = owner;

        if (stacks) {
            Object.entries(stacks).forEach(([key, value]) => {
                node.setStack(+key as 0 | 1 | 2, value);
            });
        }

        if (uuid) {
            node.uuid = uuid;
        }

        this.scene.add(node);

        this.isDirty = true;

        return node.uuid;
    }

    public addLane({ type = LaneType.Slow, nodes }: { type?: string; nodes: string[] }, uuid?: string) {
        if (nodes.length !== 2) throw new Error("Failed less then 2 nodes.");

        const nodeA = this.scene.getObjectByProperty("uuid", nodes[0]);
        const nodeB = this.scene.getObjectByProperty("uuid", nodes[1]);

        if (!nodeA || !nodeB) throw new Error("Failed to find objects");

        const lane = new Lane({
            from: nodeA.position,
            to: nodeB.position,
            nodes: [nodeA.uuid, nodeB.uuid],
            type
        }, {
            linewidth: type === LaneType.Slow ? 2 : 4,
            color: new Color(0xff3401)
        });

        if (uuid) lane.uuid = uuid;

        this.scene.add(lane);


        this.isDirty = true;
    }

    public get children() {
        return this.scene.children;
    }

    public loadState(map: MapData): void {

        this.scene.remove(...this.scene.children);

        for (const a of map.nodes) {
            this.addNode({
                color: new Color(a.color).getHex(),
                icon: a.icon,
                name: a.label,
                owner: a.owner,
                x: a.position.x,
                y: a.position.y,
                stacks: a.stacks
            }, a.uuid);
        }

        for (const b of map.linkes) {
            this.addLane({ type: b.type, nodes: b.nodes }, b.uuid);
        }

        this.isDirty = true;
    }

    private resize = () => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.overlay.setSize(window.innerWidth, window.innerHeight);
    }

    private onClick = (ev: MouseEvent) => {
        const point = new Vector2((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);

        this.raycaster.layers.set(1);
        this.raycaster.setFromCamera(point, this.camera);

        const intersects = this.raycaster.intersectObjects(this.scene.children);

        const obj = intersects.at(0);
        if (!obj) return;

        window.dispatchEvent(new CustomEvent("event::selection", { detail: { id: obj.object.uuid } }));
    }

    public makeDirty() {
        this.isDirty = true;
    }

    public destory() {
        this.container.removeChild(this.renderer.domElement);
        this.container.removeChild(this.overlay.domElement);

        window.removeEventListener("resize", this.resize);
        cancelAnimationFrame(this.renderId);
    }

    private eventLoop = () => {
        const delta = this.clock.getDelta();
        const update = this.controls.update(delta);

        if (this.isDirty || update) {
            this.renderer.render(this.scene, this.camera);
            this.overlay.render(this.scene, this.camera);

            this.isDirty = false;
        }
        tweenUpdate();

        this.renderId = requestAnimationFrame(this.eventLoop);
    }
}