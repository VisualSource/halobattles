import { useParams } from "react-router-dom";
import { useState } from "react";
import QueueEngine from "../../lib/QueueEngine";
import Queue from "../../components/Queue";

const queueIdA = "b0282443-999c-413a-8bb7-7b898768d48d";
const queueIdB = "a6b994cd-dcc6-482a-83c8-ed4fc353bcf3"

const BuildingQueue: React.FC = () => {
    const [extraQueue, setExtraQueue] = useState(false);
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
            <section className="grid grid-cols-4 overflow-y-scroll">
                {Array.from({ length: 6 * 12 }).map((_, i) => (
                    <button onClick={() => {
                        if (id) QueueEngine.get().addItem({
                            nodeId: id,
                            objData: {
                                duration: 10,
                                id: "2f7eb6d0-2229-4d43-a2e7-aa097105e4bf",
                                icon: "https://halo.wiki.gallery/images/b/b0/HW_FieldArmory_Concept.jpg",
                                name: "Field Armory"
                            },
                            queueId: queueIdA,
                            time: 10,
                            type: "building"
                        })
                    }} key={i} className="border-2 border-gray-600 hover:bg-gray-800 rounded-sm aspect-square cursor-cell p-2">
                        <img className="rounded-md" src="https://halo.wiki.gallery/images/b/b0/HW_FieldArmory_Concept.jpg" alt="building icon" />
                    </button>
                ))}
            </section>
        </div>
    );
}

export default BuildingQueue;