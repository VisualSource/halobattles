import { useParams } from "react-router-dom";
import { useState, Suspense } from 'react';
import UnitBuildOptions from "../../components/UnitOptions";
import Fallback from "../../components/OptionsFallback";
import Queue from "../../components/Queue";

const queueIdA = "7a627f73-dbdd-4d00-86ab-2ba8b1135abc";
const queueIdB = "54547d3f-23eb-4820-b1be-8a70607074df"

const UnitQueue: React.FC = () => {
    const [extraQueue] = useState(false);
    const { id } = useParams();
    if (!id) throw new Error("Node id is missing");

    return (
        <div className="grid grid-cols-3 w-full h-full">
            <Queue queueId={queueIdA} nodeId={id} />
            {extraQueue ? (
                <Queue queueId={queueIdB} nodeId={id} />
            ) : (
                <div className="h-full flex items-center justify-center">
                    Build a SOMEBULDING to extend queue
                </div>
            )}
            <Suspense fallback={<Fallback />}>
                <UnitBuildOptions nodeId={id} queueId={queueIdA} />
            </Suspense>
        </div>
    )
}

export default UnitQueue;