import { Suspense } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { useSuspenseQuery } from "@tanstack/react-query";
import { client } from "@/lib/trpc";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

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
            {data.map((a, i) => (
                <HoverCard>
                    <HoverCardTrigger asChild>
                        <button type="button" key={i} className="h-20 w-20 bg-zinc-400 hover:bg-zinc-400/50 rounded-md p-2">
                            <img className="h-full w-full object-contain rounded-full" src={a.icon} />
                        </button>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80">
                        <div className="flex flex-col justify-between space-x-4">
                            <div className="flex justify-center p-2">
                                <Avatar>
                                    <AvatarImage src={a.icon} />
                                    <AvatarFallback>VC</AvatarFallback>
                                </Avatar>
                            </div>
                            <div className="space-y-1">
                                <h4 className="text-sm font-semibold">{a.name}</h4>
                                <p className="text-sm">Supplies Cost: {a.supplies}</p>
                                <p className="text-sm">Energy Cost {a.energy}</p>
                                <div className="flex items-center pt-2">
                                    Unit Cap {a.unit_cap}
                                    Leader Cap: {a.leader_cap}
                                    Max Unique: {a.max_unique}
                                    <span className="text-xs text-muted-foreground">

                                        Stat {a.stat}
                                        Type {a.unit_type}
                                        Weapon {a.weapon_type}
                                        Armor {a.armor}
                                        Health {a.health}
                                        Shield {a.shield}
                                        Attributes: {a.attributes}
                                        Damage {a.damage}


                                    </span>
                                </div>
                            </div>
                        </div>
                    </HoverCardContent>
                </HoverCard>
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