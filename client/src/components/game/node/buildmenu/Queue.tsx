import { intervalToDuration } from 'date-fns/intervalToDuration';
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useReducer } from "react";
import { Trash2 } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { client } from "@/lib/trpc";

type QueueProps = {
    node: string;
    name: string,
    type: "unit" | "building",
    keyQuery: string;
}

const reducer = (state: { time: number, label: string }) => {
    const int = state.time - 1000;

    const value = intervalToDuration({ start: 0, end: int });

    return {
        time: int,
        label: `${value.minutes}:${(value.seconds?.toString() ?? "").padStart(2, "0")}`
    }
}

const QueueItem: React.FC<{ time: number, icon: string; name: string; type: "unit" | "building"; node: string; id: string }> = ({ time, type, node, id, icon, name }) => {
    const [timer, dispatch] = useReducer(reducer, { time: time, label: "Starting" });

    useEffect(() => {
        const internval = setInterval(() => dispatch(), 1000);
        return () => {
            clearInterval(internval);
        }
    }, []);

    return (
        <div className="flex w-full p-2 justify-between">
            <div className="flex gap-2">
                <Avatar className="h-12 w-12 rounded-md">
                    <AvatarImage className="rounded-md" src={icon} />
                    <AvatarFallback>UN</AvatarFallback>
                </Avatar>
                <div>
                    <h4 className="font-bold text-zinc-50">{name}</h4>
                    <p>{timer.label}</p>
                </div>
            </div>

            <Button size="icon" variant="destructive" onClick={() => client.cancelItem.mutate({ type, node, item: id })}>
                <Trash2 />
            </Button>
        </div>
    );

}

const Queue: React.FC<QueueProps> = ({ name, type, node, keyQuery }) => {
    const { data } = useSuspenseQuery({
        queryKey: [keyQuery, node],
        queryFn: ({ queryKey }) => {
            const id = queryKey.at(1);
            if (!id) throw new Error("No node id was given.");
            return client.getQueue.query({ type, node: id });
        }
    });

    return (
        <section className="col-span-1 border-l border-r text-zinc-50">
            <div className="p-2">
                <h1 className="text-xl font-bold">{name}</h1>
                {data.current ? (
                    <QueueItem time={data.current.meta.build_time} icon={data.current.meta.icon} name={data.current.meta.name} id={data.current.id} type={type} node={node} />
                ) : <div>No Item</div>}
            </div>
            <Separator className="dark:bg-slate-50" />
            <ul>
                {data.items.length ? (
                    data.items.map(e => (
                        <li className="flex w-full p-2 justify-between">
                            <div className="flex gap-2">
                                <Avatar className="h-12 w-12 rounded-md">
                                    <AvatarImage className="rounded-md" src={e.meta.icon} />
                                    <AvatarFallback>UN</AvatarFallback>
                                </Avatar>
                                <div>
                                    <h4 className="font-bold text-zinc-50">{e.meta.name}</h4>
                                </div>
                            </div>

                            <Button size="icon" variant="destructive" onClick={() => client.cancelItem.mutate({ type: "building", node, item: e.id })}>
                                <Trash2 />
                            </Button>
                        </li>
                    ))
                ) : <li className="p-2 text-zinc-50 text-center">Queue Empty</li>}
            </ul>
        </section>
    );
}

export default Queue;