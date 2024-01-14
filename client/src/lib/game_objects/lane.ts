import { Vector3, BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineBasicMaterialParameters, Line } from 'three';
import { LaneType } from 'halobattles-shared';

export default class Lane extends Line {
    public nodes: string[] = []
    public laneType: LaneType;
    constructor({ from, to, nodes, type }: { type: string, from: Vector3, to: Vector3, nodes: string[] }, style: LineBasicMaterialParameters) {
        const vertices = [from.x, from.y, from.z, to.x, to.y, to.z];
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));

        const material = new LineBasicMaterial(style);

        super(geometry, material);

        this.renderOrder = 0;
        this.name = "Lane";

        this.laneType = type as LaneType;
        this.nodes = nodes;
    }

    public isLane(from: string, to: string): boolean {
        return this.nodes.includes(from) && this.nodes.includes(to);
    }

    public isLaneWithType(from: string, to: string, type: LaneType): boolean {
        return this.isLane(from, to) && this.laneType === type;
    }
}