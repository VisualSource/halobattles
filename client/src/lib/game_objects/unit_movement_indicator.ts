import { CircleGeometry, Mesh, MeshBasicMaterial } from "three";

export default class UnitMovementIndicator extends Mesh {
    constructor(x: number, y: number) {
        const geometry = new CircleGeometry(5, 0);
        const material = new MeshBasicMaterial({ color: 0xffff00 });
        super(geometry, material);
        this.position.set(x, y, 1);
        this.name = "UnitMovementIndicator";
        this.renderOrder = 2;

    }
}