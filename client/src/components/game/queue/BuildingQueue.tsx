import { Button } from "@/components/ui/button";
import { PLANET_QUEUE_BUILDING } from "@/lib/query_keys";
import { client } from "@/lib/trpc";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

const BuildingQueue: React.FC<{ node: string }> = ({ node }) => {
    const { data } = useSuspenseQuery({
        queryKey: [PLANET_QUEUE_BUILDING, node],
        queryFn: ({ queryKey }) => {
            const id = queryKey.at(1);
            if (!id) throw new Error("No node id was given");
            return client.getQueue.query({ type: "building", node: id });
        }
    });

    return (
        <section className="col-span-1 border-l border-r">
            <div>
                {data.current ? (
                    <div>
                        {data.current.meta.id}
                        <Button size="icon" variant="destructive" onClick={() => client.cancelItem.mutate({ type: "building", node, item: data.current!.id })}>
                            <Trash2 />
                        </Button>
                    </div>
                ) : null}

            </div>
            <ul>
                {data.items.map(e => (
                    <li key={e.id}>
                        {e.meta.id}
                        <Button size="icon" variant="destructive" onClick={() => client.cancelItem.mutate({ type: "building", node, item: e.id })}>
                            <Trash2 />
                        </Button>
                    </li>
                ))}
            </ul>
        </section>
    );
}

export default BuildingQueue;