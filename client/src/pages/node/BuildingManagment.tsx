import { Badge, Button } from 'flowbite-react';
import { useParams } from 'react-router-dom';
import { Suspense, useState } from 'react';
import { useNodeBuildings, useNodeMaxBuildings } from "../../hooks/useGetNode";
import { useIsNodeOwner, useIsNodeSpy } from '../../hooks/useGetNode';
import type { Building } from 'server/src/object/Location';
import Fallback from '../../components/OptionsFallback';
import { trpc } from '../../lib/network';

const Building: React.FC<{ item: Building, isOwner: boolean, isSpy: boolean }> = ({ isOwner, isSpy, item }) => {
    const { id } = useParams();
    if (!id) throw new Error("No node id was set.");
    const [data] = trpc.getBulidingInfo.useSuspenseQuery(item.id);
    const mutation = trpc.modifyBuilding.useMutation();

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
                    {(isOwner || isSpy) ? data.levels[item.level].values.map((bouns, i) => (
                        <Badge key={i} color={bouns.color}>{bouns.text}</Badge>
                    )) : null}
                </div>
            </section>
            {(isOwner || isSpy) ? <div className='flex  gap-2'>
                {(data.maxLevel === -1 || data.maxLevel === item.level) ? null : (<Button onClick={() => mutation.mutate({ type: "upgrade", objId: item.objId, nodeId: id })}>Upgrade</Button>)}
                <Button color="red" onClick={() => mutation.mutate({ type: "delete", objId: item.objId, nodeId: id })}>Delete</Button>
            </div> : null}
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