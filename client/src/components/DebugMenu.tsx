import Engine from "@/lib/engine";
import UnitStack, { UnitStackState } from "@/lib/game_objects/unit_stack";
import { useEffect, useState, } from "react";
import { createPortal } from 'react-dom';
import { MeshBasicMaterial, type Mesh, Color } from "three";
import { Select, SelectContent, SelectTrigger, SelectLabel, SelectGroup, SelectItem, SelectValue } from "./ui/select";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { ChevronDown, ChevronUp } from "lucide-react";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { Separator } from "./ui/separator";

type ContextProps = { x: number; y: number; worldX: number; worldY: number; };

const ContextMenu: React.FC<ContextProps> = (props) => {
    return (
        <div className="absolute w-28 bg-zinc-800 text-white p-1 z-50" style={{ top: `${props.y}px`, left: `${props.x}px` }}>
            <button onClick={(ev) => {
                ev.preventDefault();
                const engine = Engine.Get();

                const pos = engine.unproject(props.worldX, props.worldY);

                engine.addNode({ x: pos.x, y: pos.y, name: "New World", color: 0x00ffed });

            }}>Create Node</button>
        </div>
    );
}

const DebugMenu: React.FC = () => {
    const [contextLoction, setContextLocation] = useState<ContextProps | null>(null);
    const [showContext, setShowContext] = useState(false);
    const [show, setShow] = useState(false);
    const [selection, setSelection] = useState<Mesh | null>(null);


    useEffect(() => {
        const onContextMenu = (ev: MouseEvent) => {
            const point = { x: (ev.clientX / window.innerWidth) * 2 - 1, y: -(ev.clientY / window.innerHeight) * 2 + 1 };

            setContextLocation({ x: ev.clientX, y: ev.clientY, worldX: point.x, worldY: point.y });

            setShowContext(true);
        }

        const onClick = () => {
            setShowContext(false);
        }

        const event = (ev: Event) => {
            setShowContext(false);

            const engine = Engine.Get();

            const id = (ev as CustomEvent<{ id: string }>).detail.id;

            const object = engine.getObject(id);

            if (!object) return;

            setSelection(object as Mesh);
            setShow(true);
        }

        window.addEventListener("event::selection", event);
        window.addEventListener("click", onClick);
        window.addEventListener("contextmenu", onContextMenu);

        return () => {
            window.removeEventListener("click", onClick);
            window.removeEventListener("contextmenu", onContextMenu);
            window.removeEventListener("event::selection", event);
        }
    }, []);


    return (
        <div className="absolute top-0 left-0 w-64 bg-zinc-600 text-zinc-50 z-50">
            <header className="bg-zinc-800 flex flex-col">
                <div className="flex justify-between">
                    <h1 className="font-bold p-1">Debug</h1>
                    <button onClick={() => setShow(e => !e)}>
                        {show ? <ChevronUp /> : <ChevronDown />}
                    </button>
                </div>

                <div className="flex p-1">
                    <button onClick={() => {
                        const engine = Engine.Get();

                        console.log(engine.saveState());


                    }}>Save</button>
                </div>
            </header>
            {show ? (
                <div className="p-1">

                    {selection ? (<div key={selection.uuid} className="flex flex-col gap-1">
                        <div>
                            <Button variant="destructive" size="sm" onClick={() => {
                                selection.removeFromParent();
                                setSelection(null);
                                setShow(false);
                            }}>Delete Node</Button>
                        </div>

                        <h1 className="text-sm font-mono">
                            ID: <code>{selection.uuid}</code>
                        </h1>

                        <div>
                            <Label>Node Name</Label>
                            <Input onChange={(e) => {
                                (selection?.children.at(3) as CSS2DObject).element.innerText = e.target.value;
                            }} defaultValue={(selection?.children.at(3) as CSS2DObject).element.innerText} />
                        </div>

                        <div>
                            <Label>Node Color</Label>
                            <Input defaultValue={"#" + (selection.material as MeshBasicMaterial).color.getHexString()} type="color" onChange={(ev) => {
                                (selection.material as MeshBasicMaterial).color.set(new Color(ev.target.value));
                            }} />
                        </div>

                    </div>) : null}
                    {selection ? selection.children.map((child, i) => {
                        if (child.name === "name-label") return null;

                        const unitstack = child.children.at(0) as UnitStack | undefined;
                        if (!unitstack) throw new Error("No unit stack on node.");

                        return (
                            <div key={i} className="flex flex-col gap-2 animate-in ease-in">
                                <h1 className="p-1 font-bold">{child.name}</h1>
                                <Separator />
                                <div className="flex flex-col gap-1">
                                    <Label>State</Label>
                                    <Select defaultValue={unitstack.getState()} onValueChange={(value => {
                                        unitstack.setState(value as UnitStackState);
                                    })} >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select Stack State" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                <SelectLabel>Stack State</SelectLabel>
                                                {Object.entries(UnitStackState).map(([key, a], i) => (
                                                    <SelectItem value={key} key={i}>{a}</SelectItem>
                                                ))}
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-col">
                                    <Label>Icon</Label>
                                    <div className="flex gap-1 mt-1">
                                        <Input defaultValue={unitstack.getIcon()} id={`stack-${i}`} type="text" />
                                        <Button onClick={() => {
                                            const item = document.getElementById(`stack-${i}`) as HTMLInputElement | undefined;
                                            if (!item) return;
                                            unitstack.setIcon(item.value);
                                        }}>Set</Button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch defaultChecked={unitstack.draggable} onCheckedChange={(e) => {
                                        unitstack.draggable = e;
                                    }} />
                                    <Label>Draggable</Label>
                                </div>
                            </div>
                        );
                    }) : (
                        <div>
                            <h1>No Selection</h1>
                        </div>
                    )}
                </div>
            ) : null}


            {showContext && contextLoction ? createPortal(<ContextMenu {...contextLoction} />, document.body) : null}
        </div>
    )
}

export default DebugMenu;