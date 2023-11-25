import Engine from "@/lib/engine";
import UnitStack from "@/lib/game_objects/unit_stack";
import { useEffect, useState } from "react";
import { type Mesh } from "three";
import { Select, SelectContent, SelectTrigger, SelectLabel, SelectGroup, SelectItem, SelectValue } from "./ui/select";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";

const DebugMenu: React.FC = () => {
    const [selection, setSelection] = useState<Mesh | null>(null);


    useEffect(() => {
        const event = (ev: Event) => {
            const engine = Engine.Get();

            const id = (ev as CustomEvent<{ id: string }>).detail.id;

            const object = engine.getObject(id);

            if (!object) return;

            setSelection(object as Mesh);
        }

        window.addEventListener("event::selection", event);

        return () => {
            window.removeEventListener("event::selection", event);
        }
    }, []);


    return (
        <div className="absolute top-0 left-0 w-56 bg-zinc-600 text-zinc-50">
            <header className="bg-zinc-800">
                <h1 className="font-bold p-1">Debug</h1>
            </header>
            <div>
                {selection ? selection.children.map((child, i) => {
                    if (child.name === "name-label") return null;

                    const unitstack = child.children.at(0) as UnitStack | undefined;
                    if (!unitstack) throw new Error("No unit stack on node.");

                    return (
                        <div key={i}>
                            <h1 className="p-1 font-bold">{child.name}</h1>
                            <label>
                                <span>State</span>
                                <Select>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Stack State" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectLabel>Stack State</SelectLabel>
                                            <SelectItem value="empty">Empty</SelectItem>
                                            <SelectItem value="one">One</SelectItem>
                                            <SelectItem value="two">Two</SelectItem>
                                            <SelectItem value="three">Three</SelectItem>
                                            <SelectItem value="full">Full</SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </label>
                            <div className="flex">
                                <Input type="text" />
                                <Button>Set</Button>
                            </div>
                            <label>
                                <Switch />
                                <span>Draggable</span>
                            </label>

                        </div>
                    );
                }) : null}
            </div>
        </div>
    )
}

export default DebugMenu;