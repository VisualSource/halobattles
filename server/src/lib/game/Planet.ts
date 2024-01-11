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
    public position: { x: number; y: number; z: number };
    public color: string;
    public label: string;
    constructor({ uuid, position, color, label }: PlanetProps) {
        this.uuid = uuid;
        this.position = position;
        this.color = color;
        this.label = label;
    }
    asJson(): PlanetProps {
        return {
            uuid: this.uuid,
            position: this.position,
            color: this.color,
            label: this.label
        }
    }
}