import { ChevronDown, ChevronUp, Globe, Package, PackageX, RefreshCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Mesh, MathUtils } from "three";
import { UnitStackState } from 'halobattles-shared';

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Separator } from "@ui/separator";
import { Switch } from "@ui/switch";
import { Button } from "@ui/button";
import { Label } from "@ui/label";
import { Input } from "@ui/input";

import ContextContainer, { type ContextProps } from "./ContextContainer";
import UnitStack from "@/lib/game_objects/unit_stack";
import Node from "@/lib/game_objects/node";
import LinkDialog from "./NodeLinkDialog";
import Engine from "@/lib/engine";

const Menu: React.FC = () => {
    const [refresh, setRefrest] = useState(0);
    const [contextLoction, setContextLocation] = useState<ContextProps | null>(null);
    const [showContext, setShowContext] = useState(false);
    const [show, setShow] = useState(true);
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
        <div className="absolute top-0 left-0 w-64 bg-zinc-600 text-zinc-50 z-50 h-screen">
            <header className="bg-zinc-800 flex flex-col h-10">
                <div className="flex justify-between">
                    <h1 className="font-bold p-1">Debug</h1>
                    <button onClick={() => setShow(e => !e)}>
                        {show ? <ChevronUp /> : <ChevronDown />}
                    </button>
                </div>
            </header>
            {show ? (
                <Tabs defaultValue="selection" className="flex flex-col" style={{ height: "calc(100vh - 40px)" }}>
                    <TabsList className="rounded-none">
                        <TabsTrigger value="selection">
                            <Package />
                        </TabsTrigger>
                        <TabsTrigger value="scene">
                            <Globe />
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="scene" className="overflow-y-scroll">
                        <div className="flex p-1 gap-1">
                            <Button size="sm" className="flex gap-1" onClick={() => {
                                const engine = Engine.Get();

                                console.log(engine.saveState());

                            }}><Save /> <span>Save</span></Button>
                            <LinkDialog />
                            <Button size="sm" onClick={() => setRefrest(MathUtils.randInt(0, Number.MAX_SAFE_INTEGER))}>
                                <RefreshCcw />
                            </Button>
                        </div>
                        <Separator />
                        <ul className="p-1 divide-y-2" key={refresh}>
                            {Engine.Exists() ? Engine.Get().children.map((item, i) => (
                                <li key={i} className="p-1 flex">
                                    <button className="text-xs flex flex-col justify-start text-left" onClick={() => Engine.Get().lookAt(item.position.x, item.position.y)}>
                                        <div className="font-bold">{(item as Node).label ?? item.name}</div>
                                        <div>{item.uuid}</div>
                                    </button>
                                    <div className="flex justify-center px-1 text-red-600 hover:text-red-700">
                                        <button onClick={() => item.removeFromParent()}>
                                            <PackageX size={20} />
                                        </button>
                                    </div>
                                </li>
                            )) : null}
                        </ul>
                    </TabsContent>
                    <TabsContent value="selection" className="overflow-y-scroll">
                        <div className="p-1">

                            {selection ? (<div key={selection.uuid} className="flex flex-col gap-1">
                                <h1 className="text-sm font-mono">
                                    ID: <code>{selection.uuid}</code>
                                </h1>


                                <div>
                                    <Label>Owner</Label>
                                    <Input onChange={(e) => {
                                        (selection as Node).ownerId = e.target.value ?? null;
                                    }} defaultValue={(selection as Node).ownerId ?? undefined} />
                                </div>

                                <div>
                                    <Label>Node Icon</Label>
                                    <Input onChange={(e) => {
                                        (selection as Node).icon = e.target.value ?? null;
                                    }} defaultValue={(selection as Node).icon ?? undefined} />
                                </div>

                                <div>
                                    <Label>Node Name</Label>
                                    <Input onChange={(e) => {
                                        (selection as Node).label = e.target.value ?? null;
                                    }} defaultValue={(selection as Node).label ?? undefined} />
                                </div>

                                <div>
                                    <Label>Node Color</Label>
                                    <Input defaultValue={(selection as Node).color} type="color" onChange={(ev) => {
                                        (selection as Node).color = ev.target.value;
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
                                            <Select defaultValue={unitstack.state} onValueChange={(value => {
                                                unitstack.state = value as UnitStackState;
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
                                                <Input defaultValue={unitstack.icon} id={`stack-${i}`} type="text" />
                                                <Button onClick={() => {
                                                    const item = document.getElementById(`stack-${i}`) as HTMLInputElement | undefined;
                                                    if (!item) return;
                                                    unitstack.icon = item.value;
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
                    </TabsContent>
                </Tabs>
            ) : null}


            {showContext && contextLoction ? createPortal(<ContextContainer {...contextLoction} />, document.body) : null}
        </div>
    )
}

export default Menu;