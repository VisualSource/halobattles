import Engine, { Node, Lane } from "@/lib/engine";
import UnitStack, { UnitStackState } from "@/lib/game_objects/unit_stack";
import { useEffect, useState, } from "react";
import { createPortal } from 'react-dom';
import { type Mesh } from "three";
import { Select, SelectContent, SelectTrigger, SelectLabel, SelectGroup, SelectItem, SelectValue } from "./ui/select";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Cable, ChevronDown, ChevronUp, Globe, Package, Save } from "lucide-react";
import { Separator } from "./ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./ui/dialog";
import { ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenu, ContextMenuShortcut } from "./ui/context-menu";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader } from "./ui/alert-dialog";

type ContextProps = { x: number; y: number; worldX: number; worldY: number; };

const ContextMenuContainer: React.FC<ContextProps> = (props) => {
    return (

        <ContextMenu>
            <ContextMenuTrigger></ContextMenuTrigger>

            <ContextMenuContent className="absolute w-64" style={{ top: `${props.y}px`, left: `${props.x}px` }}>
                <ContextMenuItem inset onClick={(ev) => {
                    ev.preventDefault();
                    const engine = Engine.Get();

                    const pos = engine.unproject(props.worldX, props.worldY);

                    engine.addNode({ x: pos.x, y: pos.y, name: "New World", color: 0x00ffed });

                }}>
                    Create Node
                    <ContextMenuShortcut>Ctrl + n</ContextMenuShortcut>
                </ContextMenuItem>
            </ContextMenuContent>

        </ContextMenu>

    );
}

const LinkDialog = () => {
    const [alertOpen, setAlertOpen] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [fromValue, setFromValue] = useState<string>();
    const [toValue, setToValue] = useState<string>();
    return (
        <Dialog open={isOpen} onOpenChange={(v) => setIsOpen(v)}>
            <AlertDialog onOpenChange={(v) => setAlertOpen(v)} open={alertOpen}>
                <AlertDialogContent className="text-white">
                    <AlertDialogHeader>Link Warning.</AlertDialogHeader>
                    <AlertDialogDescription>Link Aready exists for nodes {fromValue} to {toValue}.</AlertDialogDescription>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Ok</AlertDialogCancel>
                    </AlertDialogFooter>
                </AlertDialogContent>

            </AlertDialog>


            <DialogTrigger asChild>
                <Button size="sm" className="flex gap-1">
                    <Cable /> <span>Link</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="text-white">
                <DialogTitle>Create Link</DialogTitle>

                <form className="flex flex-col gap-2" onSubmit={(ev) => {
                    ev.preventDefault();

                    if ((!fromValue || !toValue) || fromValue === toValue) {
                        return;
                    }

                    const engine = Engine.Get();

                    const exists = engine.scene.children.some(value => {
                        if (value.name === "Lane") {
                            return (value as Lane).isLane(fromValue, toValue);
                        } else {
                            return false;
                        }
                    });

                    if (exists) {
                        setAlertOpen(true);
                        return;
                    }

                    engine.addLane(fromValue, toValue);

                    setIsOpen(false);
                }}>

                    <Label>From</Label>
                    <Select onValueChange={e => setFromValue(e)}>
                        <SelectTrigger >
                            <SelectValue id="from-node" />
                        </SelectTrigger>
                        <SelectContent>
                            {Engine.Get().scene.children.map(a => (
                                <SelectItem value={a.uuid} key={a.uuid}>
                                    <div className="text-left">{(a as Node).label}</div>
                                    <div>{a.uuid}</div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Label>To</Label>
                    <Select onValueChange={e => setToValue(e)}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {Engine.Get().scene.children.map(a => (
                                <SelectItem value={a.uuid} key={a.uuid}>
                                    <div className="text-left">{(a as Node).label}</div>
                                    <div>{a.uuid}</div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button type="submit" className="mt-4">Create</Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}

const DebugMenu: React.FC = () => {
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
        <div className="absolute top-0 left-0 w-64 bg-zinc-600 text-zinc-50 z-50">
            <header className="bg-zinc-800 flex flex-col mb-1">
                <div className="flex justify-between">
                    <h1 className="font-bold p-1">Debug</h1>
                    <button onClick={() => setShow(e => !e)}>
                        {show ? <ChevronUp /> : <ChevronDown />}
                    </button>
                </div>
            </header>
            {show ? (
                <Tabs defaultValue="selection">
                    <TabsList>
                        <TabsTrigger value="selection">
                            <Package />
                        </TabsTrigger>
                        <TabsTrigger value="scene">
                            <Globe />
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="scene">
                        <div className="flex p-1 gap-1">
                            <Button size="sm" className="flex gap-1" onClick={() => {
                                const engine = Engine.Get();

                                console.log(engine.saveState());

                            }}><Save /> <span>Save</span></Button>
                            <LinkDialog />
                        </div>
                        <Separator />
                        <ul className="p-1 divide-y-2">
                            {Engine.Exists() ? Engine.Get().scene.children.map((item, i) => (
                                <li key={i} className="p-1">
                                    <button className="text-xs flex flex-col justify-start text-left" onClick={() => Engine.Get().lookAt(item.position.x, item.position.y)}>
                                        <div className="font-bold">{(item as Node).label ?? item.name}</div>
                                        <div>{item.uuid}</div>
                                    </button>
                                </li>
                            )) : null}
                        </ul>
                    </TabsContent>
                    <TabsContent value="selection">
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
                                        (selection as Node).label = e.target.value;
                                    }} defaultValue={(selection as Node).label} />
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
                    </TabsContent>


                </Tabs>
            ) : null}


            {showContext && contextLoction ? createPortal(<ContextMenuContainer {...contextLoction} />, document.body) : null}
        </div>
    )
}

export default DebugMenu;