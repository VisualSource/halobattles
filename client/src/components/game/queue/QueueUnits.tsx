import { useSuspenseQuery } from "@tanstack/react-query";
import { PLANET_QUEUE_UNITS } from "@/lib/query_keys";
import { client } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

const QueueUnits: React.FC<{ node: string }> = ({ node }) => {
    const { data } = useSuspenseQuery({
        queryKey: [PLANET_QUEUE_UNITS, node],
        queryFn: ({ queryKey }) => {
            const id = queryKey.at(1);
            if (!id) throw new Error("No node id was given.");
            return client.getQueue.query({ type: "unit", node: id });
        }
    })

    return (
        <section className="col-span-1">
            <div>
                {data.current ? (
                    <div>
                        {data.current.meta.id}
                        <Button size="icon" variant="destructive" onClick={() => client.cancelItem.mutate({ type: "unit", node, item: data.current!.id })}>
                            <Trash2 />
                        </Button>
                    </div>
                ) : null}
            </div>
            <ul>
                {data.items.map((e => (
                    <li key={e.id}>
                        {e.meta.id}
                        <Button size="icon" variant="destructive" onClick={() => client.cancelItem.mutate({ type: "unit", node, item: e.id })}>
                            <Trash2 />
                        </Button>
                    </li>
                )))}

            </ul>
        </section>
    );
}

export default QueueUnits;