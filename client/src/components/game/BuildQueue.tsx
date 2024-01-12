import { Suspense } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { useSuspenseQuery } from "@tanstack/react-query";
import { client } from "@/lib/trpc";

const BuildOptions: React.FC<{ node: string }> = ({ node }) => {
    const { data } = useSuspenseQuery({
        queryKey: ["PLANET_BUILD_OPTIONS", node],
        queryFn: async ({ queryKey }) => {
            const key = queryKey.at(1);
            if (!key) throw new Error("Failed to load build options");
            return client.getBuildOptions.query(key);
        }
    })
    return (
        <>
            {data.map((_, i) => (
                <button type="button" key={i} className="h-20 w-20 bg-zinc-400 hover:bg-zinc-400/50 rounded-md">

                </button>
            ))}
        </>
    );
}

const BuildQueue: React.FC<{ node: string }> = ({ node }) => {
    return (
        <div className="grid grid-cols-3 grid-rows-none h-full">
            <section className="col-span-1"></section>
            <section className="col-span-1 border-l border-r"></section>
            <section className="col-span-1 bg-zinc-900">
                <ScrollArea>
                    <div className="flex flex-wrap gap-2 p-2">
                        <Suspense fallback={<></>}>
                            <BuildOptions node={node} />
                        </Suspense>
                    </div>
                </ScrollArea>
            </section>
        </div>
    );
}

export default BuildQueue