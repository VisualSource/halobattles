import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { GroupType } from "server/src/object/Location";
import { network } from '../network';

export const enum StackState {
    Empty,
    One,
    Half,
    Three,
    Max,
}

export default class UnitStack extends CSS2DObject {
    private container = document.createElement("div");
    private _state: StackState = StackState.Empty;
    private stack1: HTMLDivElement;
    private stack2: HTMLDivElement;
    private stack3: HTMLDivElement;
    private stack4: HTMLDivElement;
    private top: HTMLImageElement;
    constructor(private objectId: string, private groupPosition: GroupType) {
        super(document.createElement("div"));
        this.container.classList.add("pointer-events-auto", "h-10", "w-10", "flex", "flex-column", "items-center", "justify-center", "relative", "bottom-2");
        this.container.draggable = false;
        this.container.setAttribute("group", groupPosition);

        this.container.addEventListener("dragstart", ev => {
            ev.dataTransfer?.setData("application/json", JSON.stringify({
                id: this.objectId,
                type: this.groupPosition
            }));
        });
        this.container.addEventListener("drop", (ev) => {
            ev.preventDefault();
            const data = JSON.parse(ev.dataTransfer?.getData("application/json") ?? "null") as { id: string; type: GroupType; } | null;
            if (!data) throw new Error("Faild to get transfer data.");
            network.transferUnits.mutate({
                from: {
                    id: data.id,
                    group: data.type
                },
                to: {
                    id: this.objectId,
                    group: this.groupPosition
                },
            });
        });
        this.container.addEventListener("dragover", ev => ev.preventDefault());
        this.element.appendChild(this.container);

        this.stack1 = this.createStack("top-2", "z-40");
        this.stack2 = this.createStack("top-4", "z-30", "hidden");
        this.stack3 = this.createStack("top-6", "z-20", "hidden");
        this.stack4 = this.createStack("top-8", "hidden");
        this.top = this.createStackTop({ className: ["hidden"] });

        this.container.appendChild(this.top);
        this.container.appendChild(this.stack1);
        this.container.appendChild(this.stack2);
        this.container.appendChild(this.stack3);
        this.container.appendChild(this.stack4);

    }

    public setTopImage(src = "/Basic_Elements_(128).jpg"): void {
        this.top.src = src;
    }

    public setDraggable(value: boolean) {
        this.container.draggable = value;
    }

    public get state(): StackState {
        return this._state;
    }
    public setState(state: StackState): void {
        if (this._state === state) return;

        this._state = state;

        switch (state) {
            case StackState.Empty: {
                this.container.classList.add("bottom-2");
                this.container.classList.remove("bottom-4", "bottom-6", "bottom-8", "bottom-10");

                this.stack2.classList.add("hidden");
                this.stack3.classList.add("hidden");
                this.stack4.classList.add("hidden");
                this.top.classList.add("hidden");
                break;
            }
            case StackState.One: {
                this.container.classList.add("bottom-4");
                this.container.classList.remove("bottom-2", "bottom-6", "bottom-8", "bottom-10");

                this.stack2.classList.add("hidden");
                this.stack3.classList.add("hidden");
                this.stack4.classList.add("hidden");
                this.top.classList.remove("hidden");

                break;
            }
            case StackState.Half: {
                this.container.classList.add("bottom-6");
                this.container.classList.remove("bottom-2", "bottom-4", "bottom-8", "bottom-10");

                this.stack2.classList.remove("hidden");
                this.stack3.classList.add("hidden");
                this.stack4.classList.add("hidden");
                this.top.classList.remove("hidden");

                break;
            }
            case StackState.Three: {
                this.container.classList.add("bottom-8");
                this.container.classList.remove("bottom-2", "bottom-4", "bottom-6", "bottom-10");

                this.stack2.classList.remove("hidden");
                this.stack3.classList.remove("hidden");
                this.stack4.classList.add("hidden");
                this.top.classList.remove("hidden");
                break;
            }
            case StackState.Max: {
                this.container.classList.add("bottom-10");
                this.container.classList.remove("bottom-2", "bottom-4", "bottom-6", "bottom-8");

                this.stack2.classList.remove("hidden");
                this.stack3.classList.remove("hidden");
                this.stack4.classList.remove("hidden");
                this.top.classList.remove("hidden");
                break;
            }
        }

    }
    private createStack(...className: string[]) {
        const stack = document.createElement("div");
        stack.classList.add("h-10", "w-10", "rounded-full", "shadow-lg", "bg-black", "absolute", "border-2", "border-gray-600", ...className);
        return stack;
    }
    private createStackTop({ src = "/Basic_Elements_(128).jpg", className = [] }: { src?: string; className?: string[] }) {
        const img = document.createElement("img");
        img.classList.add("pointer-events-none", "h-10", "w-10", "rounded-full", "shadow-lg", "absolute", "z-50", ...className);
        img.src = src;
        return img;
    }
}