import { PerspectiveCamera, Scene } from 'three';
import { } from "camera-controls";
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

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
    private renderer: SVGRenderer;
    private overlay: CSS2DRenderer;
    private camera: PerspectiveCamera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 10000);
    private scene: Scene = new Scene();
    private renderId: number;
    constructor(private container: HTMLDivElement) {


        this.overlay = new CSS2DRenderer();

        container.appendChild(this.overlay.domElement);

        this.renderer = new SVGRenderer();

        container.appendChild(this.renderer.domElement);

        this.eventLoop();
    }

    public destory() {
        this.container.removeChild(this.renderer.domElement);
        this.container.removeChild(this.overlay.domElement);
        cancelAnimationFrame(this.renderId);
    }

    private eventLoop = () => {

        this.renderer.render(this.scene, this.camera);
        this.overlay.render(this.scene, this.camera);

        this.renderId = requestAnimationFrame(this.eventLoop);
    }



}