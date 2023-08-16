import { useParams } from 'react-router-dom';
import { Suspense, useState } from 'react';
import useGetNode, { useNodeBuildings, useNodeMaxBuildings } from "../../hooks/useGetNode";
import { useIsNodeOwner, useIsNodeSpy } from '../../hooks/useGetNode';
import type { Building } from 'server/src/object/Location';
import Fallback from '../../components/OptionsFallback';
import { trpc } from '../../lib/network';
import { usePlayerCredits } from '../../hooks/usePlayer';
import QueueEngine from '../../lib/QueueEngine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';

const Building: React.FC<{ item: Building, isOwner: boolean, isSpy: boolean }> = ({ isOwner, isSpy, item }) => {
    const [loading, setLoading] = useState(false);
    const { id } = useParams();
    if (!id) throw new Error("No node id was set.");
    const [data] = trpc.getBulidingInfo.useSuspenseQuery(item.id);
    const mutation = trpc.deleteBuilding.useMutation();
    const buy = trpc.buyItem.useMutation();
    const credits = usePlayerCredits();
    const node = useGetNode();

    if (!node) throw new Error("Unable to get node");

    const level = data.levels[item.level];
    if (!level) throw new Error("Unable to get level data");

    return (
        <div className="col-span-1 p-2" data-obj-id={item.objId}>
            <div className="flex my-2">
                <img className="aspect-square h-20 rounded-md" src={(isOwner || isSpy) ? item.icon : "/Basic_Elements_(128).jpg"} />
                <div className="ml-4">
                    <h2 className="text-3xl font-bold">{(isOwner || isSpy) ? data.name : "Unknown"}</h2>
                    <h4>Level: {(isOwner || isSpy) ? item.level : "?"}</h4>
                </div>
            </div>
            <p className="text-sm mb-2">{(isOwner || isSpy) ? data.description : "Unknown description"}</p>
            <hr className="mb-2" />
            <section className="mb-4">
                <h2 className="mb-2 text-lg font-semibold text-white">Bouns:</h2>
                <div className='flex flex-wrap gap-4'>
                    {(isOwner || isSpy) ? level.values.map((bouns, i) => (
                        <Badge key={i} color={bouns.color}>{bouns.text}</Badge>
                    )) : null}
                </div>
            </section>
            {isOwner ? (
                <div className='flex  gap-2'>
                    {(data.maxLevel === -1 || data.maxLevel === item.level) ? null : (
                        <HoverCard>
                            <HoverCardContent>
                                <h1 className="text-lg font-bold mb-2">Upgrade to level {item.level + 1}</h1>
                                <div className="mb-2">
                                    <div><span className="font-bold">Cost:</span> {(data.levels[item.level + 1].build?.cost ?? Number.MAX_SAFE_INTEGER).toLocaleString()}</div>
                                    <div><span className="font-bold">Build time:</span> {(data.levels[item.level + 1].build?.time ?? Number.MAX_SAFE_INTEGER).toLocaleString()}s</div>
                                </div>
                                <div className='flex flex-wrap gap-4'>
                                    {data.levels[item.level + 1].values.map((bouns, i) => (
                                        <Badge key={i} variant={bouns.color === "red" ? "destructive" : "secondary"} >{bouns.text}</Badge>
                                    ))}
                                </div>

                            </HoverCardContent>
                            <HoverCardTrigger>
                                <Button variant="secondary" disabled={credits < credits - (level.build?.cost ?? Infinity)} onClick={async () => {
                                    try {
                                        const nextLevel = item.level + 1;
                                        const nextData = data.levels[nextLevel];
                                        if (!nextData) throw new Error("Failed to get next level data");

                                        await buy.mutateAsync({
                                            type: data.type,
                                            id: item.id,
                                            level: nextLevel,
                                        });

                                        QueueEngine.enqueue({
                                            type: data.type,
                                            nodeId: node.objectId,
                                            queueId: node.queueIds.buildings.a,
                                            objData: {
                                                duration: nextData.build?.time ?? 0,
                                                icon: data.icon,
                                                id: data.id,
                                                level: nextLevel,
                                                inst: item.objId,
                                                name: `[Upgrade] ${data.name}`
                                            },
                                            time: nextData.build?.time ?? 0
                                        });
                                    } catch (error) {
                                        console.error(error);
                                    }
                                }}>Upgrade</Button>
                            </HoverCardTrigger>
                        </HoverCard>
                    )}
                    <Button variant="destructive" disabled={loading} onClick={() => {
                        setLoading(true);
                        mutation.mutateAsync({ objId: item.objId, nodeId: id }).finally(() => setLoading(false));
                    }}>Delete</Button>
                </div>
            ) : null}
        </div>
    );
}

const BuildingManagment: React.FC = () => {
    const [selected, setSelected] = useState<number>();
    const isOwner = useIsNodeOwner();
    const isSpy = useIsNodeSpy();
    const buildings = useNodeBuildings();
    const maxSlots = useNodeMaxBuildings();

    const size = (maxSlots ?? 0) - (buildings?.length ?? 0);

    return (
        <div className="grid grid-cols-3 divide-x-2 divide-gray-600 w-full">
            <div className="grid col-span-2 grid-rows-6 grid-cols-6">
                {buildings?.map((value, key) => (
                    <button onClick={() => setSelected(key)} key={key} className="w-full p-2 flex items-center justify-center relative col-span-1 row-span-1 border-2 border-gray-600 bg-gray-900">
                        <img className="rounded-md aspect-square h-16" src={(isOwner || isSpy) ? value.icon : "/Basic_Elements_(128).jpg"} alt={value.objId} />
                    </button>
                ))}
                {Array.from({ length: size }).map((_, i) => (
                    <button className="w-full col-span-1 row-span-1 border-2 border-gray-600 hover:bg-gray-800 cursor-cell rounded-none" key={i}></button>
                ))}
                {Array.from({ length: (6 * 6) - size }).map((_, i) => (
                    <div className="w-full col-span-1 row-span-1 border-2 border-gray-600 bg-gray-800 cursor-not-allowed" key={i}></div>
                ))}
            </div>
            {selected !== undefined && buildings && buildings[selected] ? (
                <Suspense fallback={<Fallback />}>
                    <Building isOwner={isOwner} isSpy={isSpy} item={buildings[selected]} />
                </Suspense>
            ) : (
                <div className="col-span-1 p-2 flex justify-center items-center">
                    <span>Select item to view details.</span>
                </div>
            )}
        </div>
    );
}

export default BuildingManagment;