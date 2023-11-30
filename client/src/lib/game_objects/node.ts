import { Mesh, MeshBasicMaterial, Shape, EllipseCurve, CircleGeometry, Color, ShapeGeometry } from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import UnitStack from './unit_stack';

export default class Node extends Mesh {

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

            (ellipse.children.at(0) as UnitStack).index = i;

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

    public getStack(idx: number): UnitStack {
        if (idx < 0 || idx > 2) throw new Error("Index out of range.");

        const stack = this.children.at(idx)?.children.at(0) as UnitStack | undefined;
        if (!stack) throw new Error("Stack at given index does not exists");

        return stack;
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