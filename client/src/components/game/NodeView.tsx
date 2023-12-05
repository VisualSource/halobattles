import { Globe, Users2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

const NodeView: React.FC = () => {
    return (
        <div className="absolute top-0 left-0 flex h-full w-full bg-zinc-600 bg-opacity-20 z-[1000] justify-center items-center">
            <div className="bg-zinc-600 flex flex-col h-2/3 w-4/6">
                <Tabs className="flex flex-col h-full">
                    <header className="flex justify-end">
                        <Link to="/game">
                            <X />
                        </Link>
                    </header>
                    <main className="h-full">
                        <TabsContent value="node" className="h-full">
                            <div className="grid grid-cols-4 grid-rows-6 h-full gap-2 w-1/2 p-1">
                                <div className="bg-zinc-900"></div>
                                <div className="bg-zinc-900"></div>
                                <div className="bg-zinc-900"></div>
                                <div className="bg-zinc-900"></div>
                                <div className="bg-zinc-900"></div>
                                <div className="bg-zinc-900"></div>
                                <div className="bg-zinc-900"></div>
                                <div className="bg-zinc-900"></div>
                                <div className="bg-zinc-900"></div>
                                <div className="bg-zinc-900"></div>
                            </div>
                        </TabsContent>
                        <TabsContent value="armay" className="h-full">
                            <div className="h-full grid grid-cols-3 grid-rows-1 gap-2 p-1">
                                <section className="grid grid-cols-4 grid-rows-6 gap-1">
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                </section>
                                <section className="grid grid-cols-4 grid-rows-6 gap-1">
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                </section>
                                <section className="grid grid-cols-4 grid-rows-6 gap-1">
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                    <div className="bg-zinc-900 col-span-1"></div>
                                </section>
                            </div>
                        </TabsContent>
                    </main>
                    <footer>
                        <TabsList>
                            <TabsTrigger value="node">
                                <Globe />
                            </TabsTrigger>
                            <TabsTrigger value="armay">
                                <Users2 />
                            </TabsTrigger>
                        </TabsList>
                    </footer>
                </Tabs>
            </div>
        </div>
    );
}

export default NodeView;