import { Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { client } from "@/lib/trpc";
import { useSuspenseQuery } from "@tanstack/react-query";

type QueueProps = {
    node: string;
    name: string,
    type: "unit" | "building",
    key: string;
}

const Queue: React.FC<QueueProps> = ({ name, type, node, key }) => {
    const { data } = useSuspenseQuery({
        queryKey: [key, node],
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
                    <div className="flex w-full p-2 justify-between">
                        <div className="flex gap-2">
                            <Avatar className="h-12 w-12 rounded-md">
                                <AvatarImage className="rounded-md" src={data.current.meta.icon} />
                                <AvatarFallback>UN</AvatarFallback>
                            </Avatar>
                            <div>
                                <h4 className="font-bold text-zinc-50">{data.current.meta.name}</h4>
                            </div>
                        </div>

                        <Button size="icon" variant="destructive" onClick={() => client.cancelItem.mutate({ type, node, item: data.current!.id })}>
                            <Trash2 />
                        </Button>
                    </div>
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