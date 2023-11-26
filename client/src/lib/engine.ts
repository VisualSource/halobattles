import { Mesh, MeshBasicMaterial, Shape, EllipseCurve, CircleGeometry, Clock, Color, Vector2, Vector3, Vector4, Quaternion, Matrix4, Spherical, Sphere, Box3, Raycaster, MathUtils, PerspectiveCamera, Scene, ShapeGeometry, BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineBasicMaterialParameters, Line } from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js';
import CameraControls from "camera-controls";
import UnitStack from './game_objects/unit_stack';

export const Node = (color: number, position: { x: number; y: number }, radis: { x: number; y: number }) => {
    const sphere = new CircleGeometry(20, 50);

    const materal = new MeshBasicMaterial({ color: new Color(color) });
    const mesh = new Mesh(sphere, materal);

    mesh.position.set(position.x, position.y, 0);
    mesh.layers.enable(1);
    mesh.renderOrder = 100;
    mesh.name = "Node";

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

        mesh.add(ellipse);

        x += 15;
        y = i % 2 == 0 ? 20 : 10;
    }

    const label = new CSS2DObject(document.createElement("div"));
    label.element.innerText = "Name";
    label.element.classList.add("text-white", "font-bold");
    label.position.set(0, -20, 0);
    label.name = "name-label";

    mesh.add(label);

    mesh.addEventListener("removed", () => {
        for (const child of mesh.children) child.dispatchEvent({ type: "removed" });
    })

    return mesh;
}

export const Lane = (from: { x: number; y: number, z: number }, to: { x: number, y: number, z: number }, style: LineBasicMaterialParameters) => {
    const vertices = [from.x, from.y, from.z, to.x, to.y, to.z];

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));

    const material = new LineBasicMaterial(style);
    const line = new Line(geometry, material);

    line.renderOrder = 0;

    return line;
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
    private scene: Scene = new Scene();
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

        const node = Node(0x0033ff, { x: 0, y: 0 }, { x: 8, y: 6 });

        this.scene.add(node);

        this.eventLoop();
    }

    public saveState() {
        return this.scene.toJSON();
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

        const node = Node(color, { x, y }, { x: 8, y: 6 });

        (node.children.at(3) as CSS2DObject).element.innerText = name;

        this.scene.add(node);

        return node.uuid;
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