import { useState, Suspense } from 'react';
import UnitBuildOptions from "../../components/UnitOptions";
import Fallback from "../../components/OptionsFallback";
import useGetNode from "../../hooks/useGetNode";
import Queue from "../../components/Queue";

const UnitQueue: React.FC = () => {
    const [extraQueue] = useState(false);
    const node = useGetNode();
    if (!node) throw new Error("Node id is missing");

    return (
        <div className="grid grid-cols-3 w-full">
            <Queue queueId={node.queueIds.units.a} nodeId={node.objectId} />
            {extraQueue ? (
                <Queue queueId={node.queueIds.units.b} nodeId={node.objectId} />
            ) : (
                <div className="h-full flex items-center justify-center">
                    Build a SOMEBULDING to extend queue
                </div>
            )}
            <Suspense fallback={<Fallback />}>
                <UnitBuildOptions nodeId={node.objectId} queueId={node.queueIds.units.a} />
            </Suspense>
        </div>
    )
}

export default UnitQueue;