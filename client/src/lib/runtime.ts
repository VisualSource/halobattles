import { Tween, update } from '@tweenjs/tween.js';
import { network } from "../lib/network";
import { user } from '../lib/user';
import {
    PerspectiveCamera, Scene, Color, AmbientLight, Vector2,
    Vector3,
    Mesh,
    Vector4,
    Quaternion,
    CircleGeometry,
    MeshBasicMaterial,
    Clock,
    ColorManagement,
    Matrix4,
    Spherical,
    Box3,
    Sphere,
    Raycaster,
    MathUtils,
    Line,
    LineBasicMaterial,
    BufferGeometry,
    Float32BufferAttribute,
    LineBasicMaterialParameters,
} from 'three';
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { toast } from 'react-toastify';
import CameraControls from 'camera-controls';
import Location from "../lib/objects/location";
import QueueEngine, { QueueItem } from './QueueEngine';
import { Player } from 'server/src/object/GameState';
import type { UUID } from 'server';

const subsetOfTHREE = {
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
};

function makeLine(start: Vector3, end: Vector3, style: LineBasicMaterialParameters) {
    const vertices = [start.x, start.y, start.z, end.x, end.y, end.z];
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));

    const material = new LineBasicMaterial(style);
    const line = new Line(geometry, material);

    line.renderOrder = 0;

    return line;
}

function createTrianagle(x: number, y: number) {
    const geometry = new CircleGeometry(5, 0);
    const material = new MeshBasicMaterial({ color: 0xffff00 });
    const trianagle = new Mesh(geometry, material);
    trianagle.position.set(x, y, 1);
    return trianagle;
}

function modeTo(path: { id: UUID, position: { x: number; y: number }, duration: number }[], mesh: Mesh, onComplete: () => void) {

    mesh.position.set(path[0].position.x, path[0].position.y, 1);

    let root: Tween<Vector3>;
    let chain: Tween<Vector3>;
    for (let i = 1; i < path.length; i++) {
        const current = path[i];
        const nextTween = new Tween(mesh.position).to({ x: current.position.x, y: current.position.y }, 1000 * current.duration);

        if (i === (path.length - 1)) nextTween.onComplete(onComplete);

        if (i === 1) {
            root = nextTween;
            chain = nextTween;
        } else {
            chain!.chain(nextTween);
            chain = nextTween;
        }
    }
    root!.start();
}

export default class Runtime extends EventTarget {
    static INSTANCE: Runtime | null = null;
    static getInstance(): Runtime {
        if (!Runtime.INSTANCE) throw new Error("Runtime has not been created");
        return Runtime.INSTANCE;
    }
    static get(container: HTMLDivElement): Runtime {
        if (!Runtime.INSTANCE) {
            Runtime.INSTANCE = new Runtime(container);
        }
        return Runtime.INSTANCE;
    }
    private raycaster = new Raycaster();
    private camera: PerspectiveCamera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 10000);
    private scene: Scene = new Scene();
    private renderer: SVGRenderer;
    private htmlRenderer: CSS2DRenderer;
    private cameraControls: CameraControls;
    private clock = new Clock();
    private id: number;
    private locations: Location[] = [];
    public player: Player;
    private unsubscribe: () => void;
    constructor(private container: HTMLDivElement) {
        super();

        QueueEngine.init();

        CameraControls.install({
            THREE: subsetOfTHREE
        });
        ColorManagement.enabled = false;

        this.camera.position.z = 500;
        this.scene.background = new Color(0xf0f0f0);

        const ambient = new AmbientLight(0x80ffff);
        this.scene.add(ambient);

        this.htmlRenderer = new CSS2DRenderer();
        this.htmlRenderer.setSize(window.innerWidth, window.innerHeight);
        this.htmlRenderer.domElement.classList.add("absolute", "top-0", "pointer-events-none");

        container.appendChild(this.htmlRenderer.domElement);

        this.renderer = new SVGRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        window.addEventListener("resize", this.windowResize);
        this.renderer.domElement.addEventListener("click", this.click);

        container.appendChild(this.renderer.domElement);
        this.cameraControls = new CameraControls(this.camera, this.renderer.domElement as never as HTMLElement);
        this.cameraControls.distance = 300;

        this.cameraControls.infinityDolly = false;
        this.cameraControls.mouseButtons.left = CameraControls.ACTION.TRUCK;
        this.cameraControls.minDistance = 100;
        this.cameraControls.maxDistance = 300;
        this.render();
        this.init().then((value) => {
            this.unsubscribe = value;
        });
    }
    private async init() {
        const userId = user.getUser();
        const queue = QueueEngine.get();

        queue.addEventListener("item-done", (ev) => {
            const data = (ev as CustomEvent<{ type: "unit", nodeId: string; objData: { id: number; level?: number; inst?: string; } }>).detail;
            if (data.type !== "unit") {
                network.buildItem.mutate({
                    nodeId: data.nodeId,
                    type: data.type,
                    objData: {
                        id: data.objData.id,
                        level: data.objData.level,
                        inst: data.objData.inst
                    }
                });
                return;
            }

            network.buildItem.mutate({
                nodeId: data.nodeId,
                type: data.type,
                objData: {
                    id: data.objData.id,
                }
            })
        });

        queue.addEventListener("drop-item", (ev) => {
            const item = (ev as CustomEvent<QueueItem>).detail;
            network.refunedItem.mutate({
                id: item.objData.id,
                type: item.type,
            });
        });

        const notify = network.onNotify.subscribe(userId, {
            onData(value) {
                switch (value.type) {
                    case 'info':
                        toast.info(value.msg);
                        break;
                    case 'error':
                        toast.error(value.msg);
                        break;
                    case 'warn':
                        toast.warn(value.msg);
                        break;
                }
            },
            onError(err) {
                console.error(err);
                toast.error(err.message);
            },
        });

        const subscription = network.onTransferUnits.subscribe(userId, {
            onData: (value) => {
                //console.log("move", value);
                const trianagle = createTrianagle(0, 0);
                this.scene.add(trianagle);
                modeTo(value.path, trianagle, () => {
                    trianagle.removeFromParent();
                    if (value.owner === userId) network.finalizTransfer.mutate(value.transferId);
                });
            },
            onError(error) {
                toast.error(error.message);
                console.error(error)
            }
        });
        const locationSubscription = network.onLocationUpdate.subscribe(userId, {
            onData: (value) => {
                switch (value.type) {
                    case "set-owner": {
                        const node = this.getNode(value.payload.node);
                        node.setOwner(value.owner, value.payload.color);
                        node.stacksMovable(userId === value.owner);
                        break;
                    }
                    case "update-units-groups": {
                        for (const payload of value.payload) {
                            const node = this.getNode(payload.node);
                            node.setGroupUnits(payload.group, payload.units);
                        }
                        break;
                    }
                    case "set-contested-state": {
                        const node = this.getNode(value.payload.node);
                        node.contested = value.payload.state;
                        break;
                    }
                    case "update-buildings": {
                        const node = this.getNode(value.payload.node);
                        node.buildings = value.payload.buildings;
                        break;
                    }
                    case "set-spies": {
                        const node = this.getNode(value.payload.node);
                        node.setSpies(value.payload.spies);
                        break;
                    }
                    default:
                        break;
                }
                this.emit("node-update");
            },
            onError(error) {
                toast.error(error.message);
                console.error(error);
            }
        });
        const playerdata = network.onPlayerUpdate.subscribe(userId, {
            onData: (value) => {
                this.player = value;
                this.emit("player-update");
            },
            onError(err) {
                toast.error(err.message);
                console.error(err);
            },
        });

        const gameState = network.onGameOver.subscribe(userId, {
            onData: (value) => {
                window.dispatchEvent(new CustomEvent("game-over", { detail: value }));
            },
            onError(err) {
                toast.error(err.message);
                console.error(err);
            },
        });

        const mapdata = await network.getMap.query();

        const self = await network.getSelf.query();
        if (!self) throw new Error("Failed to get self!");
        this.player = self;

        this.emit("player-update");

        for (const data of mapdata) {
            const location = new Location(data);
            if (userId === data.owner) location.stacksMovable(true);
            this.locations.push(location);
            this.scene.add(location.node);
        }

        const createdLinks = new Set<string>();
        for (const node of this.locations) {
            for (const link of node.connectsTo) {
                const obj = this.locations.find(value => value.objectId === link);
                if (!obj) continue;
                const forward = `${node.objectId}:${obj?.objectId}`;
                const backwards = `${obj.objectId}:${node.objectId}`;
                if (createdLinks.has(forward) || createdLinks.has(backwards)) continue;

                createdLinks.add(forward);
                createdLinks.add(backwards);

                const line = makeLine(node.position, obj.position, {
                    color: Math.random() * 0xffffff,
                    linewidth: Math.floor((Math.random() * 100) % 2) ? 10 : 1
                });
                this.scene.add(line);
            }

        }

        return () => {
            gameState.unsubscribe();
            subscription.unsubscribe();
            playerdata.unsubscribe();
            locationSubscription.unsubscribe();
            notify.unsubscribe();
        }
    }
    public emit(event: string, payload?: unknown): void {
        this.dispatchEvent(new CustomEvent(event, { detail: payload }));
    }
    private click = (ev: MouseEvent) => {
        const point = new Vector2((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);

        this.raycaster.layers.set(1);
        this.raycaster.setFromCamera(point, this.camera);

        const intersects = this.raycaster.intersectObjects(this.scene.children);

        const obj = intersects.at(0);
        if (!obj || !obj.object.userData.objectId) return;

        window.dispatchEvent(new CustomEvent("node-selected", { detail: { id: obj.object.userData.objectId } }));
    }
    private render = () => {
        const delta = this.clock.getDelta();
        this.cameraControls.update(delta);
        update();
        this.renderer.render(this.scene, this.camera);
        this.htmlRenderer.render(this.scene, this.camera);
        this.id = requestAnimationFrame(this.render);
    }
    private windowResize = () => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.htmlRenderer.setSize(window.innerWidth, window.innerHeight);
    }
    public destory() {
        this.unsubscribe();

        this.renderer.domElement.removeEventListener("click", this.click);
        window.removeEventListener("resize", this.windowResize);
        cancelAnimationFrame(this.id);
        this.container.removeChild(this.renderer.domElement);
        this.container.removeChild(this.htmlRenderer.domElement);
        QueueEngine.get().destory();
    }
    public getNode(nodeId: string) {
        const node = this.locations.find(value => value.objectId === nodeId);
        if (!node) throw new Error("Failed to find node.");
        return node;
    }
}
