import { useParams } from "react-router-dom";
import { useState, Suspense } from "react";
import Queue from "../../components/Queue";
import BuildOptions from "../../components/BuildOptions";
import Fallback from "../../components/OptionsFallback";


const queueIdA = "b0282443-999c-413a-8bb7-7b898768d48d";
const queueIdB = "a6b994cd-dcc6-482a-83c8-ed4fc353bcf3";


const BuildingQueue: React.FC = () => {
    const [extraQueue, _setExtraQueue] = useState(false);
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
                <BuildOptions nodeId={id} queueId={queueIdA} />
            </Suspense>
        </div>
    );
}

export default BuildingQueue;