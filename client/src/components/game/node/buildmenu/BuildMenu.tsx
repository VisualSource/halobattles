import { Container, UserPlus2 } from "lucide-react";
import { Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@component/ui/tabs";
import { PLANET_QUEUE_BUILDING, PLANET_QUEUE_UNITS } from "@/lib/query_keys";
import { ScrollArea } from "@component/ui/scroll-area";
import BuildingOptions from "./BuildingOptions";
import UnitOptions from "./UnitOptions";
import Queue from "./Queue";

const BuildMenu: React.FC<{ node: string }> = ({ node }) => {
    return (
        <div className="grid grid-cols-3 grid-rows-none h-full">
            <Suspense>
                <Queue node={node} key={PLANET_QUEUE_UNITS} name="Unit Queue:" type="unit" />
            </Suspense>
            <Suspense>
                <Queue node={node} key={PLANET_QUEUE_BUILDING} name="Building Queue:" type="building" />
            </Suspense>
            <section className="col-span-1 bg-zinc-900">
                <Tabs defaultValue="units">
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
                                    <UnitOptions node={node} />
                                </Suspense>
                            </div>
                        </ScrollArea>
                    </TabsContent>
                    <TabsContent value="buildings_tech">
                        <ScrollArea>
                            <div className="flex flex-wrap gap-2 p-2">
                                <Suspense fallback={<></>}>
                                    <BuildingOptions node={node} />
                                </Suspense>
                            </div>
                        </ScrollArea>
                    </TabsContent>
                </Tabs>
            </section>
        </div>
    );
}

export default BuildMenu;