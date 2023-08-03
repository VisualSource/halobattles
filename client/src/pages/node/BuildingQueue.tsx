import { useState, Suspense } from "react";
import BuildOptions from "../../components/BuildOptions";
import Fallback from "../../components/OptionsFallback";
import useGetNode from "../../hooks/useGetNode";
import Queue from "../../components/Queue";

const BuildingQueue: React.FC = () => {
    const [extraQueue] = useState(false);
    const node = useGetNode();
    if (!node) throw new Error("Node id is missing");

    return (
        <div className="grid grid-cols-3 w-full h-full">
            <Queue queueId={node.queueIds.buildings.a} nodeId={node.objectId} />
            {extraQueue ? (
                <Queue queueId={node.queueIds.buildings.b} nodeId={node.objectId} />
            ) : (
                <div className="h-full flex items-center justify-center">
                    Build a SOMEBULDING to extend queue
                </div>
            )}
            <Suspense fallback={<Fallback />}>
                <BuildOptions nodeId={node.objectId} queueId={node.queueIds.buildings.a} />
            </Suspense>
        </div>
    );
}

export default BuildingQueue;