import { Badge, Tooltip } from "flowbite-react";
import QueueEngine from "../lib/QueueEngine";
import { trpc } from "../lib/network";

const UnitBuildOptions: React.FC<{ nodeId: string, queueId: string }> = ({ nodeId, queueId }) => {
    const [options] = trpc.getUnitOptions.useSuspenseQuery(nodeId)

    return (
        <section className="grid grid-cols-4 overflow-y-scroll">
            {options.map((value, i) => (
                <Tooltip content={(
                    <div>
                        <h1 className="font-bold">{value.name}</h1>
                        <p className="text-gray-500 mb-2 max-w-xs">{value.description}</p>
                        <div><span className="font-bold">Cost:</span> {value.cost.toLocaleString()}</div>
                        <div><span className="font-bold">Build Time:</span> {value.time}</div>
                        <div>
                            <div><span className="font-bold">Damage Type:</span> {value.stats.damageType}</div>
                            <div><span className="font-bold">Health:</span> {value.stats.health}</div>
                            <div><span className="font-bold">Shealds:</span> {value.stats.shealds}</div>
                            <div><span className="font-bold">Hit Change:</span> {value.stats.hitChange}</div>
                        </div>
                    </div>
                )
                }>
                    <button key={i} className="border-2 border-gray-600 hover:bg-gray-800 rounded-sm aspect-square cursor-cell p-2" onClick={() => QueueEngine.get().addItem({
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
                    })}>
                        <img className="rounded-md" src={value.icon} alt="building icon" />
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