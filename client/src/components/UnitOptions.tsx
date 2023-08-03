import { Tooltip } from "flowbite-react";
import clsx from 'clsx';
import { usePlayerCredits, usePlayerCap } from "../hooks/usePlayer";
import QueueEngine from "../lib/QueueEngine";
import { trpc } from "../lib/network";


const UnitBuildOptions: React.FC<{ nodeId: string, queueId: string }> = ({ nodeId, queueId }) => {
    const [options] = trpc.getUnitOptions.useSuspenseQuery(nodeId);
    const buy = trpc.buyItem.useMutation();
    const playerCerdits = usePlayerCredits();
    const cap = usePlayerCap();

    return (
        <section className="grid grid-cols-4 overflow-y-scroll">
            {options.map((value, i) => (
                <Tooltip key={i} content={(
                    <div>
                        <h1 className="font-bold">{value.name}</h1>
                        <p className="text-gray-500 mb-2 max-w-xs">{value.description}</p>
                        <div><span className="font-bold">Cost:</span> {value.cost.toLocaleString()}</div>
                        <div><span className="font-bold">Build Time:</span> {value.time}</div>
                        <div>
                            {value.globalMax !== -1 ? <div><span className="font-bold">Max Global</span> {value.capSize}</div> : null}
                            <div><span className="font-bold">Cap Size:</span> {value.capSize}</div>
                            <div><span className="font-bold">Damage Type:</span> {value.stats.damageType}</div>
                            <div><span className="font-bold">Health:</span> {value.stats.health}</div>
                            <div><span className="font-bold">Shealds:</span> {value.stats.shealds}</div>
                            <div><span className="font-bold">Hit Change:</span> {value.stats.hitChange}</div>
                        </div>
                    </div>
                )
                }>
                    <button key={i} className={clsx((playerCerdits < value.cost) || !(cap.max >= (cap.current + value.capSize)) || (value.globalMax !== -1 && ((cap.restrictions[`unit-${value.id}`] + 1) > value.globalMax)) ? "cursor-not-allowed bg-gray-800" : "cursor-cell", "border-2 border-gray-600 hover:bg-gray-800 rounded-sm aspect-square p-2")} onClick={() => {
                        if (playerCerdits < value.cost || !(cap.max >= (cap.current + value.capSize)) || (value.globalMax !== -1 && ((cap.restrictions[`unit-${value.id}`] + 1) > value.globalMax))) return;
                        try {
                            buy.mutate({
                                type: "unit",
                                id: value.id
                            });

                            QueueEngine.enqueue({
                                nodeId,
                                objData: {
                                    duration: value.time,
                                    id: value.id,
                                    icon: value.icon,
                                    name: value.name
                                },
                                queueId: queueId,
                                time: value.time,
                                type: value.type
                            })
                        } catch (error) {
                            console.error(error);
                        }
                    }}>
                        <img className={clsx("rounded-md", (playerCerdits < value.cost) || !(cap.max >= (cap.current + value.capSize)) || (value.globalMax !== -1 && ((cap.restrictions[`unit-${value.id}`] + 1) > value.globalMax)) ? "grayscale" : undefined)} src={value.icon} alt="building icon" />
                    </button>
                </Tooltip >
            ))}
            {
                Array.from({ length: (6 * 6) - options.length }).map((_, i) => (
                    <button className="border-2 border-gray-600 hover:bg-gray-800 rounded-sm aspect-square cursor-cell p-2" key={i}>

                    </button>
                ))
            }
        </section >
    );
}

export default UnitBuildOptions;