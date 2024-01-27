import { useSuspenseQuery } from "@tanstack/react-query";
import { client } from "@/lib/trpc";
import { Suspense } from "react";

import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from '@component/ui/context-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { PLANET_BUILDINGS } from "@/lib/query_keys";

const Inner: React.FC<{ node: string }> = ({ node }) => {
    const { data } = useSuspenseQuery({
        queryKey: [PLANET_BUILDINGS, node],
        refetchOnMount: true,
        queryFn: ({ queryKey }) => {
            const key = queryKey.at(1);
            if (!key) throw new Error("Failed to load planet buildings");
            return client.getBuildings.query(key)
        }
    });

    const nonHiddenBuildings = data.buildings.filter(e => e.display);
    const empty = Array.from({ length: data.slots - nonHiddenBuildings.length });

    return (
        <>
            {nonHiddenBuildings.map((item) => (
                <ContextMenu key={`${item.id}-${item.instance}`} modal={false}>
                    <ContextMenuTrigger>
                        <HoverCard>
                            <HoverCardTrigger>
                                <div className="bg-zinc-700">
                                    <div className="h-full p-2 rounded-md">
                                        <img src={item.icon} alt="building" className="object-contain h-full w-full rounded-md" />
                                    </div>
                                </div>
                            </HoverCardTrigger>
                            <HoverCardContent>
                                {item.instance}
                            </HoverCardContent>
                        </HoverCard>

                    </ContextMenuTrigger>
                    <ContextMenuContent className="z-[1001]">
                        <ContextMenuItem inset onClick={() => {
                            client.sellBuilding.mutate({ node, instance: item.instance });
                        }}>Sell</ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>
            ))}
            {empty.map((_, i) => (
                <div key={i} className="bg-zinc-900"></div>
            ))}
            {Array.from({ length: 24 - data.slots }).map((_, i) => (
                <div key={i}></div>
            ))}
        </>
    );
}

const BuildingMangment: React.FC<{ node: string }> = ({ node }) => {
    return (
        <div className="grid grid-cols-4 grid-rows-6 h-full gap-2 w-1/2 p-1 pb-3">
            <Suspense fallback={<div className="col-span-2">Loading</div>}>
                <Inner node={node} />
            </Suspense>
        </div>
    );
}

export default BuildingMangment;