import { CircleGeometry, EllipseCurve, Mesh, MeshBasicMaterial, Shape, ShapeGeometry, Vector3 } from "three";
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { GroupType, Unit, Building } from "server/src/object/Location";
import UnitStack, { StackState } from "./stack";

type UUID = `${string}-${string}-${string}-${string}`;

type Props = {
    name: string;
    objectId: UUID;
    position: {
        x: number;
        y: number;
    };
    owner: UUID | null;
    units: {
        left: Unit[];
        center: Unit[];
        right: Unit[];
    };
    buildings: Building[],
    connectsTo: UUID[];
}

function createSphere(x: number, y: number, color = 0x00ff00) {

    const sphere = new CircleGeometry(20, 32);

    const mat = new MeshBasicMaterial({ color });
    const mesh = new Mesh(sphere, mat);
    mesh.position.set(x, y, 0);
    mesh.renderOrder = 100;

    return mesh;
}

function createEllipse(xr: number, yr: number, x: number, y: number, uuid: string, group: GroupType) {
    const curve = new EllipseCurve(
        0, 0,           // ax, aY
        xr, yr,           // xRadius, yRadius
        0, 2 * Math.PI,  // aStartAngle, aEndAngle
        false,            // aClockwise
        0                 // aRotation
    );

    const points = curve.getPoints(50);

    const shap = new Shape().setFromPoints(points);
    const ellipseGeometry = new ShapeGeometry(shap);

    const mat = new MeshBasicMaterial({ color: 0x00ff00 });
    const ellipse = new Mesh(ellipseGeometry, mat);
    ellipse.renderOrder = 101
    ellipse.position.set(x, y, 0);

    const drag = new UnitStack(uuid, group);

    ellipse.add(drag);

    return {
        ellipse,
        stack: drag
    }
}

export default class Location {
    public name: string;
    public objectId: string;
    public connectsTo: string[] = [];
    public node: Mesh;
    public owner: string | null;
    public units: { [key in GroupType]: Unit[] }
    public buildings: Building[] = [];
    public stacks: { [key in GroupType]: UnitStack }
    constructor({ objectId, position, connectsTo, owner, units, buildings, name }: Props) {
        this.objectId = objectId;
        this.connectsTo = connectsTo;
        this.owner = owner;
        this.units = units;
        this.buildings = buildings;
        this.name = name;

        const ellipseXR = 8;
        const ellipseYR = 6;
        const center = createEllipse(ellipseXR, ellipseYR, 0, 20, this.objectId, "center");
        const right = createEllipse(ellipseXR, ellipseYR, -15, 10, this.objectId, "right");
        const left = createEllipse(ellipseXR, ellipseYR, 15, 10, this.objectId, "left");

        this.stacks = {
            left: left.stack,
            center: center.stack,
            right: right.stack
        }

        this.node = createSphere(position.x, position.y, 0x0f0ff00);
        this.node.layers.enable(1);
        this.node.add(right.ellipse, left.ellipse, center.ellipse);
        this.node.userData.objectId = this.objectId;

        const debugLabel = new CSS2DObject(document.createElement("div"));
        debugLabel.element.innerText = this.objectId;
        debugLabel.element.classList.add("text-black");
        debugLabel.position.set(0, -20, 0)

        this.node.add(debugLabel);
    }
    public stacksMovable(value: boolean) {
        this.stacks.center.setDraggable(value);
        this.stacks.left.setDraggable(value);
        this.stacks.right.setDraggable(value);
    }

    public get position(): Vector3 {
        return this.node.position;
    }
    public clearGroup(group: GroupType): void {
        this.units[group] = [];
        this.stacks[group].setState(StackState.Empty);
    }
    public setGroupUnits(group: GroupType, units: Unit[]): void {
        this.units[group] = units;

        //@TODO calc state that sould be displayed

        this.stacks[group].setState(units.length ? StackState.Max : StackState.Empty);
        this.stacks[group].setTopImage();
    }
}