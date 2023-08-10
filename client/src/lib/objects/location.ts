import { CircleGeometry, Color, EllipseCurve, Mesh, MeshBasicMaterial, Shape, ShapeGeometry, Vector3 } from "three";
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { GroupType, Unit, Building, LocationProps, BuildTypes } from "server/src/object/Location";
import UnitStack, { StackState } from "./stack";
import type { UUID } from "server";
import { user } from "../user";


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

    const mat = new MeshBasicMaterial({ color: 0x262826 });
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
    public contested: boolean;
    public name: string;
    public maxBuildingsSlots: number;
    public objectId: string;
    public connectsTo: string[] = [];
    public node: Mesh;
    public spies: UUID[] = [];
    public color: number;
    public owner: string | null;
    public units: { [key in GroupType]: Unit[] }
    public queueIds: { [key in BuildTypes]: { a: UUID; b: UUID; } }
    public buildings: Building[] = [];
    public stacks: { [key in GroupType]: UnitStack }
    constructor({ queueIds, contested, objectId, position, connectsTo, owner, units, buildings, name, spies, maxBuildingSlots, color }: LocationProps) {
        this.objectId = objectId;
        this.queueIds = queueIds;
        this.connectsTo = connectsTo;
        this.owner = owner;
        this.units = units;
        this.buildings = buildings;
        this.name = name;
        this.color = color;
        this.maxBuildingsSlots = maxBuildingSlots;
        this.spies = spies;
        this.contested = contested;

        const ellipseXR = 8;
        const ellipseYR = 6;
        const center = createEllipse(ellipseXR, ellipseYR, 0, 20, this.objectId, "center");
        const left = createEllipse(ellipseXR, ellipseYR, -15, 10, this.objectId, "left");
        const right = createEllipse(ellipseXR, ellipseYR, 15, 10, this.objectId, "right");

        this.stacks = {
            left: left.stack,
            center: center.stack,
            right: right.stack
        }

        this.updateStackState("center");
        this.updateStackState("right");
        this.updateStackState("left");

        this.node = createSphere(position.x, position.y, color);
        this.node.layers.enable(1);
        this.node.add(left.ellipse, right.ellipse, center.ellipse,);
        this.node.userData.objectId = this.objectId;

        const debugLabel = new CSS2DObject(document.createElement("div"));
        debugLabel.element.innerText = this.name;
        debugLabel.element.classList.add("text-black", "font-bold");
        debugLabel.position.set(0, -20, 0)

        this.node.add(debugLabel);
    }
    public setSpies(spies: UUID[]): void {
        this.spies = spies;

        this.updateStackState("center");
        this.updateStackState("left");
        this.updateStackState("right");

    }
    public setOwner(owner: string | null, color: number): void {
        this.owner = owner;
        (this.node.material as THREE.MeshBasicMaterial).color = new Color(color);
    }
    public stacksMovable(value: boolean) {
        this.stacks.center.setDraggable(value);
        this.stacks.left.setDraggable(value);
        this.stacks.right.setDraggable(value);
    }
    public updateStackState(group: GroupType): void {
        const stackSize = this.units[group].length;

        let stackType = StackState.Empty;
        switch (true) {
            case stackSize >= 1:
                stackType = StackState.One;
                break;
            case stackSize >= 5:
                stackType = StackState.Half;
                break;
            case stackSize >= 20:
                stackType = StackState.Three;
                break;
            case stackSize >= 35:
                stackType = StackState.Max;
                break;
            default:
                break;
        }

        if (stackType !== StackState.Empty) {
            const player = user.getUser();
            const canView = this.owner === player || this.spies.includes(player as UUID);
            this.stacks[group].setTopImage(canView ? this.units[group][0].icon : undefined);
        }

        this.stacks[group].setState(stackType);
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
        this.updateStackState(group);
    }
}