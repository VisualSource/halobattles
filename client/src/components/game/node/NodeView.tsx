import { useNavigate, useParams } from "react-router-dom";
import { Globe, PackagePlus, Users2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@component/ui/tabs";
import UnitMangment from "./UnitMangment";
import BuildingMangment from "./BuildingMangment";
import BuildMenu from "./buildmenu/BuildMenu";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/trpc";

const NodeView: React.FC = () => {
    const { node } = useParams();
    const { data: ownsNode, isError } = useQuery({
        queryKey: ["OWNS_NODE", node],
        queryFn: async ({ queryKey }) => {
            const id = queryKey.at(1);
            if (!id) throw new Error("No node id");
            return client.ownsNode.query(id);
        },
        enabled: !!node,
        initialData: false
    })
    const navigate = useNavigate();
    const ref_outer = useRef<HTMLDivElement>(null);
    const ref_inner = useRef<HTMLDivElement>(null);


    useEffect(() => {
        const outer = ref_outer.current;
        const inner = ref_inner.current;
        const onClick = (ev: Event) => {
            if (!inner || !ev.target) return;

            if (!inner.contains(ev.target as HTMLElement)) {
                navigate(-1);
            }
        }

        if (outer && ref_inner.current) {
            ref_outer.current.addEventListener("click", onClick);
        }

        return () => {
            outer?.removeEventListener("click", onClick);
        }
    }, [navigate]);

    return (
        <div ref={ref_outer} className="absolute top-0 left-0 flex h-full w-full bg-zinc-600 bg-opacity-20 z-[1000] justify-center items-center">
            <div ref={ref_inner} className="bg-zinc-600 flex flex-col h-2/3 w-4/6">
                <Tabs className="flex flex-col h-full" defaultValue="units">
                    <main className="h-full w-full">
                        <TabsContent value="planet" className="h-full mt-0">
                            <BuildingMangment node={node as string} />
                        </TabsContent>
                        <TabsContent value="units" className="h-full mt-0">
                            <UnitMangment node={node as string} />
                        </TabsContent>
                        <TabsContent value="build" className="h-full mt-0">
                            <BuildMenu node={node as string} />
                        </TabsContent>
                    </main>
                    <footer className="bg-slate-800">
                        <TabsList className="rounded-none">
                            <TabsTrigger value="planet" title="world">
                                <Globe />
                            </TabsTrigger>
                            <TabsTrigger value="units" title="units">
                                <Users2 />
                            </TabsTrigger>
                            {(isError ? false : ownsNode) ? (
                                <TabsTrigger value="build" title="build">
                                    <PackagePlus />
                                </TabsTrigger>
                            ) : null}
                        </TabsList>
                    </footer>
                </Tabs>
            </div>
        </div>
    );
}

export default NodeView;