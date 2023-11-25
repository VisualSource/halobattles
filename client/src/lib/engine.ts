import { Mesh, MeshBasicMaterial, Shape, EllipseCurve, CircleGeometry, Clock, Color, Vector2, Vector3, Vector4, Quaternion, Matrix4, Spherical, Sphere, Box3, Raycaster, MathUtils, PerspectiveCamera, Scene, ShapeGeometry, type Object3DEventMap, type Object3D } from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js';
import CameraControls from "camera-controls";
import UnitStack from './game_objects/unit_stack';

const Node = (color: Color, position: { x: number; y: number }, radis: { x: number; y: number }) => {
    const sphere = new CircleGeometry(20, 50);

    const materal = new MeshBasicMaterial({ color });
    const mesh = new Mesh(sphere, materal);

    mesh.position.set(position.x, position.y, 0);
    mesh.layers.enable(1);
    mesh.renderOrder = 100;
    mesh.name = "Node";
    mesh.userData = {
        id: crypto.randomUUID()
    }

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

        mesh.add(ellipse);

        x += 15;
        y = i % 2 == 0 ? 20 : 10;
    }

    const label = new CSS2DObject(document.createElement("div"));
    label.element.innerText = "Name";
    label.element.classList.add("text-white", "font-bold");
    label.position.set(0, -20, 0);
    label.name = "name-label"

    mesh.add(label);

    return mesh;
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

        window.addEventListener("resize", this.resize);

        const node = Node(new Color(0x0033ff), { x: 0, y: 0 }, { x: 8, y: 6 });

        this.scene.add(node);

        this.eventLoop();
    }

    public getObject(uuid: string) {
        return this.scene.getObjectByProperty("uuid", uuid);
    }

    public addToScene(...object: Object3D<Object3DEventMap>[]) {
        this.scene.add(...object);
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