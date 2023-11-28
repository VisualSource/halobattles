import { Mesh, MeshBasicMaterial, Shape, EllipseCurve, CircleGeometry, Clock, Color, Vector2, Vector3, Vector4, Quaternion, Matrix4, Spherical, Sphere, Box3, Raycaster, MathUtils, PerspectiveCamera, Scene, ShapeGeometry, BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineBasicMaterialParameters, Line } from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js';
import CameraControls from "camera-controls";
import UnitStack from './game_objects/unit_stack';

export class Node extends Mesh {

    constructor(color: number, position: { x: number; y: number; }, radis: { x: number; y: number } = { x: 8, y: 6 }) {
        const sphere = new CircleGeometry(20, 50);
        const materal = new MeshBasicMaterial({ color: new Color(color) });
        super(sphere, materal);

        this.position.set(position.x, position.y, 0);
        this.layers.enable(1);
        this.renderOrder = 100;
        this.name = "Node";

        let x = -15;
        let y = 10;
        for (let i = 0; i < 3; i++) {
            const curve = new EllipseCurve(0, 0, radis.x, radis.y, 0, 2 * Math.PI, false, 0);

            const shape = new Shape().setFromPoints(curve.getPoints(50));
            const ellipseGeomerty = new ShapeGeometry(shape);

            const materal = new MeshBasicMaterial({ color: 0x262826 });
            const ellipse = new Mesh(ellipseGeomerty, materal);
            ellipse.name = `node-ellipse-${i}`;
            ellipse.renderOrder = 101;
            ellipse.position.set(x, y, 0);
            ellipse.add(new UnitStack());

            ellipse.addEventListener("removed", () => {
                ellipse.children.at(0)?.dispatchEvent({ type: "removed" });
            });

            this.add(ellipse);

            x += 15;
            y = i % 2 == 0 ? 20 : 10;
        }

        const label = new CSS2DObject(document.createElement("div"));
        label.element.innerText = "Name";
        label.element.classList.add("text-white", "font-bold");
        label.position.set(0, -20, 0);
        label.name = "name-label";

        this.add(label);

        this.addEventListener("removed", () => { for (const child of this.children) child.dispatchEvent({ type: "removed" }) });
    }

    public get label(): string | undefined {
        return (this.children.at(3) as CSS2DObject | undefined)?.element.innerText;
    }

    public set label(value: string) {
        const label = this.children.at(3) as CSS2DObject | undefined;
        if (!label) throw new Error("Failed to get label");

        label.element.innerText = value;
    }

    public get color(): string {
        return "#" + (this.material as MeshBasicMaterial).color.getHexString()
    }

    public set color(value: string) {
        (this.material as MeshBasicMaterial).color.set(new Color(value));
    }


}


export class Lane extends Line {
    public fromUUID: string;
    public toUUID: string;
    constructor(from: { x: number; y: number, z: number; uuid: string; }, to: { x: number, y: number, z: number; uuid: string; }, style: LineBasicMaterialParameters) {
        const vertices = [from.x, from.y, from.z, to.x, to.y, to.z];
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));

        const material = new LineBasicMaterial(style);

        super(geometry, material);

        this.renderOrder = 0;
        this.name = "Lane";

        this.fromUUID = from.uuid;
        this.toUUID = to.uuid;
    }

    public isLane(from: string, to: string): boolean {
        return (this.fromUUID === from || this.toUUID === from) && (this.toUUID === to || this.fromUUID === to);
    }
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
    static Create(container: HTMLDivElement): Engine {
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
    private raycaster: Raycaster = new Raycaster();
    private renderer: SVGRenderer;
    private clock = new Clock();
    private overlay: CSS2DRenderer;
    private controls: CameraControls;
    private camera: PerspectiveCamera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 10000);
    public scene: Scene = new Scene();
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
        this.renderer.domElement.addEventListener("click", this.onClick);
        container.appendChild(this.renderer.domElement);

        this.camera.position.z = 500;
        this.controls = new CameraControls(this.camera, this.renderer.domElement as never as HTMLDivElement);
        this.controls.distance = 300;
        this.controls.infinityDolly = false;
        this.controls.minDistance = 100;
        this.controls.maxDistance = 300;
        this.controls.mouseButtons.left = CameraControls.ACTION.TRUCK;

        window.addEventListener("resize", this.resize);

        const node = new Node(0x0033ff, { x: 0, y: 0 }, { x: 8, y: 6 });

        this.scene.add(node);

        this.eventLoop();
    }

    public saveState() {
        const data: { nodes: { uuid: string; position: unknown; color: string; label: string; }[], linkes: { uuid: string; to: string; from: string; }[] } = {
            nodes: [],
            linkes: []
        }
        for (const child of this.scene.children) {
            if (child.name === "Node") {
                data.nodes.push({
                    uuid: child.uuid,
                    position: child.position,
                    color: (child as Node).color,
                    label: (child as Node).label ?? "Unnamed"
                });
            }

            if (child.name === "Lane") {
                data.linkes.push({
                    uuid: child.uuid,
                    from: (child as Lane).fromUUID,
                    to: (child as Lane).toUUID
                })
            }
        }

        return data;
    }

    public async lookAt(x: number, y: number): Promise<void> {

        await this.controls.setLookAt(this.camera.position.x, this.camera.position.y, this.camera.position.z, x, y, this.camera.position.z, true);

    }

    public getObject(uuid: string) {
        return this.scene.getObjectByProperty("uuid", uuid);
    }

    public unproject(x: number, y: number) {
        let vec = new Vector3(x, y, 0.5);

        vec = vec.unproject(this.camera);

        const dir = vec.sub(this.camera.position).normalize();

        return this.camera.position.clone().add(dir.multiplyScalar((0 - this.camera.position.z) / dir.z));
    }

    public addNode({ color, x, y, name = "Node" }: { color: number, x: number, y: number, name: string }) {

        const node = new Node(color, { x, y }, { x: 8, y: 6 });

        node.label = name;

        this.scene.add(node);

        return node.uuid;
    }

    public addLane(from: string, to: string) {

        const fromObj = this.scene.getObjectByProperty("uuid", from);
        const toObj = this.scene.getObjectByProperty("uuid", to);

        if (!fromObj || !toObj) throw new Error("Failed to find objects");

        const lane = new Lane({ ...fromObj.position, uuid: fromObj.uuid }, { ...toObj.position, uuid: toObj.uuid }, { linewidth: 2, color: new Color(0xff3401) });

        this.scene.add(lane);

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

    public destory() {
        this.container.removeChild(this.renderer.domElement);
        this.container.removeChild(this.overlay.domElement);

        window.removeEventListener("resize", this.resize);
        cancelAnimationFrame(this.renderId);
    }

    private eventLoop = () => {
        const delta = this.clock.getDelta();
        this.controls.update(delta);
        this.renderer.render(this.scene, this.camera);
        this.overlay.render(this.scene, this.camera);
        this.renderId = requestAnimationFrame(this.eventLoop);
    }
}