import { type Json } from "./types.js"

type PlanetProps = {
    uuid: string,
    position: {
        x: number,
        y: number,
        z: number
    },
    color: string,
    label: string
}

export default class Planet implements Json<PlanetProps> {
    public uuid: string;
    public owner: string | null = null;
    public icon: string | null = null;
    public position: { x: number; y: number; z: number };
    public color: string;
    public label: string;
    public spies: string[] = [];
    public building_slots: number = 3;
    public buildings: { id: string; icon: string; instance: number; }[] = [];
    public units: {
        1: { icon: string; id: string; count: number }[],
        2: { icon: string; id: string; count: number }[],
        3: { icon: string; id: string; count: number }[]
    } = {
            1: [{ icon: "https://halo.wiki.gallery/images/0/0a/HW2_Banished_Locust.png", id: "addfff", count: 3 }],
            2: [],
            3: []
        }
    constructor({ uuid, position, color, label }: PlanetProps) {
        this.uuid = uuid;
        this.position = position;
        this.color = color;
        this.label = label;
    }
    asJson(): PlanetProps & { owner: string | null, icon: string | null; } {
        return {
            uuid: this.uuid,
            position: this.position,
            color: this.color,
            label: this.label,
            owner: this.owner,
            icon: this.icon,
        }
    }
}