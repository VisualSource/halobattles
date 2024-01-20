import { Suspense } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { useSuspenseQuery } from "@tanstack/react-query";
import { client } from "@/lib/trpc";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Container, UserPlus2 } from "lucide-react";

const BuildOptionsBuildings: React.FC<{ node: string }> = ({ node }) => {
    const { data } = useSuspenseQuery({
        queryKey: ["PLANET_BUILDINGS_BUILD_OPTIONS", node],
        queryFn: async ({ queryKey }) => {
            const key = queryKey.at(1);
            if (!key) throw new Error("Failed to load build options");
            return client.getBuildOptionsBuildings.query(key);
        }
    });

    return (<>
        {data.map((a, i) => (
            <HoverCard>
                <HoverCardTrigger asChild>
                    <button type="button" key={i} className="h-20 w-20 bg-zinc-400 hover:bg-zinc-400/50 rounded-md p-2">
                        <img className="h-full w-full object-cover rounded-md" src={a.icon} />
                    </button>
                </HoverCardTrigger>
                <HoverCardContent className="w-80">
                    <div className="flex justify-between space-x-4">
                        <div className="flex justify-center p-2">
                            <Avatar>
                                <AvatarImage src={a.icon} />
                                <AvatarFallback>VC</AvatarFallback>
                            </Avatar>
                        </div>
                        <div className="space-y-1">
                            <h4 className="text-sm font-semibold">{a.name}</h4>
                            <p className="text-sm">{a.description}</p>
                            <div className="flex flex-col items-start pt-2">
                                <p className="text-xs text-zinc-500">Supply Cost: {a.supplies}</p>
                                <p className="text-xs text-zinc-500">Energy Cost: {a.energy}</p>
                                <p className="text-xs text-zinc-500">Supply Upkeep: {a.upkeep_supplies}</p>
                                <p className="text-xs text-zinc-500">Energy Upkeep: {a.upkeep_energy}</p>
                                {a.max_global_instances !== -1 ? (<p className="text-xs text-zinc-500">Max Instances: {a.max_global_instances}</p>) : null}
                                {a.max_local_instances !== -1 ? (<p className="text-xs text-zinc-500">Max Instances: {a.max_local_instances}</p>) : null}
                                {a.damage !== 0 ? (
                                    <div>
                                        <p className="text-xs text-zinc-500">Shield: {a.shield}</p>
                                        <p className="text-xs text-zinc-500">Armor: {a.armor}</p>
                                        <p className="text-xs text-zinc-500">Health: {a.health}</p>
                                        <p className="text-xs text-zinc-500">Stat:  {a.stat}</p>
                                        <p className="text-xs text-zinc-500">Weapon Type:  {a.weapon_type}</p>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </HoverCardContent>
            </HoverCard>
        ))}
    </>);
}

const BuildOptionsUnits: React.FC<{ node: string }> = ({ node }) => {
    const { data } = useSuspenseQuery({
        queryKey: ["PLANET_UNIT_BUILD_OPTIONS", node],
        queryFn: async ({ queryKey }) => {
            const key = queryKey.at(1);
            if (!key) throw new Error("Failed to load build options");
            return client.getBuildOptionsUnits.query(key);
        }
    })
    return (
        <>
            {data.map((a, i) => (
                <HoverCard>
                    <HoverCardTrigger asChild>
                        <button type="button" key={i} className="h-20 w-20 bg-zinc-400 hover:bg-zinc-400/50 rounded-md p-2">
                            <img className="h-full w-full object-cover rounded-md p-2" src={a.icon} />
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
                <Tabs>
                    <TabsList className="w-full">
                        <TabsTrigger value="units">
                            <UserPlus2 />
                        </TabsTrigger>
                        <TabsTrigger value="buildings_tech">
                            <Container />
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="units">
                        <ScrollArea>
                            <div className="flex flex-wrap gap-2 p-2">
                                <Suspense fallback={<></>}>
                                    <BuildOptionsUnits node={node} />
                                </Suspense>
                            </div>
                        </ScrollArea>
                    </TabsContent>
                    <TabsContent value="buildings_tech">
                        <ScrollArea>
                            <div className="flex flex-wrap gap-2 p-2">
                                <Suspense fallback={<></>}>
                                    <BuildOptionsBuildings node={node} />
                                </Suspense>
                            </div>
                        </ScrollArea>
                    </TabsContent>
                </Tabs>
            </section>
        </div>
    );
}

export default BuildQueue