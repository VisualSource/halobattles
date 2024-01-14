import { LaneType } from "halobattles-shared";
import { Cable } from "lucide-react";
import { useState } from "react";

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader } from "@ui/alert-dialog";
import { Select, SelectContent, SelectTrigger, SelectItem, SelectValue } from "@ui/select";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@ui/dialog";
import Lane from "@/lib/game_objects/lane";
import type Node from "@/lib/game_objects/node";
import { Button } from "@ui/button";
import { Label } from "@ui/label";
import Engine from "@/lib/engine";


const LinkDialog = () => {
    const [alertOpen, setAlertOpen] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [laneType, setLaneType] = useState<LaneType>(LaneType.Slow);
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

                    const exists = engine.children.some(value => {
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

                    engine.addLane({ nodes: [fromValue, toValue], type: laneType });

                    setIsOpen(false);
                }}>

                    <Label>From</Label>
                    <Select onValueChange={e => setFromValue(e)}>
                        <SelectTrigger >
                            <SelectValue id="from-node" />
                        </SelectTrigger>
                        <SelectContent>
                            {Engine.Get().children.map(a => (
                                a.name !== "Lane" ? <SelectItem value={a.uuid} key={a.uuid}>
                                    <div className="text-left">{(a as Node).label}</div>
                                    <div>{a.uuid}</div>
                                </SelectItem> : null))}
                        </SelectContent>
                    </Select>

                    <Label>To</Label>
                    <Select onValueChange={e => setToValue(e)}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {Engine.Get().children.map(a => (
                                a.name !== "Lane" ? <SelectItem value={a.uuid} key={a.uuid}>
                                    <div className="text-left">{(a as Node).label}</div>
                                    <div>{a.uuid}</div>
                                </SelectItem> : null))}
                        </SelectContent>
                    </Select>

                    <Label>Lane Type</Label>
                    <Select defaultValue={LaneType.Slow} onValueChange={e => setLaneType(e as LaneType)}>
                        <SelectTrigger >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(LaneType).map(([key, l], i) => (
                                <SelectItem value={l} key={i}>
                                    {key}
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

export default LinkDialog;