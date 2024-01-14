import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { UnitStackState } from 'halobattles-shared';
import { client } from "../trpc";
export default class UnitStack extends CSS2DObject {
    private container = document.createElement("div");
    private _state: UnitStackState = UnitStackState.Empty;
    private level1: HTMLDivElement;
    private level2: HTMLDivElement;
    private level3: HTMLDivElement;
    private level4: HTMLDivElement;
    private top: HTMLImageElement;
    public index = 0;

    constructor() {
        super(document.createElement("div"));
        this.name = "unit-stack";
        this.container.classList.add("z-10", "pointer-events-auto", "h-10", "w-10", "flex", "flex-column", "items-center", "justify-center", "relative", "bottom-2");
        this.container.draggable = true;
        this.element.appendChild(this.container);

        this.level1 = this.createItem("top-2", "z-40");
        this.level2 = this.createItem("top-4", "z-30", "hidden");
        this.level3 = this.createItem("top-6", "z-20", "hidden");
        this.level4 = this.createItem("top-8", "hidden");
        this.top = this.createTop(undefined, "hidden");

        this.container.appendChild(this.top);
        this.container.appendChild(this.level1);
        this.container.appendChild(this.level2);
        this.container.appendChild(this.level3);
        this.container.appendChild(this.level4);

        this.container.addEventListener("drop", (ev) => {
            ev.preventDefault();
            const data = ev.dataTransfer?.getData("transfer/id");
            if (!data) throw new Error("Failed to get transfer id");
            client.moveGroup.mutate({ from: data, to: `${this.parent?.parent?.uuid};${this.index}` });
        });
        this.container.addEventListener("dragstart", (ev) => {
            ev.dataTransfer?.setData("transfer/id", `${this.parent?.parent?.uuid};${this.index}`);
        });
        this.container.addEventListener("dragover", ev => ev.preventDefault());
    }

    public set icon(icon: string | undefined | null) {
        if (!icon) {
            this.top.classList.add("hidden");
            return;
        }
        this.top.classList.remove("hidden");
        this.top.src = icon;
    }

    public get icon(): string {
        return this.top.src;
    }

    public set draggable(value: boolean) {
        this.container.draggable = value;
    }

    public get draggable(): boolean {
        return this.container.draggable;
    }

    public get state(): UnitStackState {
        return this._state;
    }

    public set state(value: UnitStackState) {
        if (this._state === value) return;

        this._state = value;

        switch (this.state) {
            case UnitStackState.Empty: {
                this.container.classList.add("bottom-2");
                this.container.classList.remove("bottom-4", "bottom-6", "bottom-8", "bottom-10");

                this.level2.classList.add("hidden");
                this.level3.classList.add("hidden");
                this.level4.classList.add("hidden");
                this.top.classList.add("hidden");
                break;
            }
            case UnitStackState.One: {
                this.container.classList.add("bottom-4");
                this.container.classList.remove("bottom-2", "bottom-6", "bottom-8", "bottom-10");

                this.level2.classList.add("hidden");
                this.level3.classList.add("hidden");
                this.level4.classList.add("hidden");
                this.top.classList.remove("hidden");
                break;
            }
            case UnitStackState.Half: {
                this.container.classList.add("bottom-6");
                this.container.classList.remove("bottom-2", "bottom-4", "bottom-8", "bottom-10");

                this.level2.classList.remove("hidden");
                this.level3.classList.add("hidden");
                this.level4.classList.add("hidden");
                this.top.classList.remove("hidden");
                break;
            }
            case UnitStackState.Three: {
                this.container.classList.add("bottom-8");
                this.container.classList.remove("bottom-2", "bottom-4", "bottom-6", "bottom-10");

                this.level2.classList.remove("hidden");
                this.level3.classList.remove("hidden");
                this.level4.classList.add("hidden");
                this.top.classList.remove("hidden");
                break;
            }
            case UnitStackState.Full: {
                this.container.classList.add("bottom-10");
                this.container.classList.remove("bottom-2", "bottom-4", "bottom-6", "bottom-8");

                this.level2.classList.remove("hidden");
                this.level3.classList.remove("hidden");
                this.level4.classList.remove("hidden");
                this.top.classList.remove("hidden");
                break;
            }
        }
    }

    private createItem(...className: string[]): HTMLDivElement {
        const level = document.createElement("div");
        level.classList.add("h-10", "w-10", "rounded-full", "shadow-lg", "bg-black", "absolute", "border-2", "border-gray-600", ...className);
        return level;
    }

    private createTop(icon: string = "/question.jpg", ...className: string[]): HTMLImageElement {
        const image = document.createElement("img");
        image.classList.add("pointer-events-none", "h-10", "w-10", "rounded-full", "shadow-lg", "absolute", "z-50", ...className);
        image.src = icon;
        return image;
    }
}