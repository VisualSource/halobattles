import { Badge, Tooltip } from "flowbite-react";
import QueueEngine from "../lib/QueueEngine";
import { trpc } from "../lib/network";


const BuildOptions: React.FC<{ nodeId: string, queueId: string }> = ({ nodeId, queueId }) => {
    const [options] = trpc.getBuildOptions.useSuspenseQuery(nodeId)

    return (
        <section className="grid grid-cols-4 overflow-y-scroll">
            {options.map((value, i) => (
                <Tooltip key={i} content={(
                    <div>
                        <h1 className="font-bold">{value.name}</h1>
                        <p className="text-gray-500 mb-2 max-w-xs">{value.description}</p>
                        <div><span className="font-bold">Cost:</span> {value.levels[1]?.build?.cost.toLocaleString() ?? 0}</div>
                        <div className="mb-2"><span className="font-bold">Build Time:</span> {value.levels[1]?.build?.time}</div>
                        <div className="flex flex-wrap">
                            {value.levels[1]?.values.map(value => (
                                <Badge size="xs" color={value.color}>{value.text}</Badge>
                            ))}
                        </div>
                    </div>
                )}>
                    <button className="border-2 border-gray-600 hover:bg-gray-800 rounded-sm aspect-square cursor-cell p-2" onClick={() => QueueEngine.get().addItem({
                        nodeId,
                        objData: {
                            duration: value.levels[1]?.build?.time ?? 0,
                            id: value.id,
                            icon: value.icon,
                            name: value.name
                        },
                        queueId: queueId,
                        time: value.levels[1]?.build?.time ?? 0,
                        type: value.type
                    })}>
                        <img className="rounded-md" src={value.icon} alt="building icon" />
                    </button>
                </Tooltip>
            ))}
            {Array.from({ length: (6 * 6) - options.length }).map((_, i) => (
                <button className="border-2 border-gray-600 hover:bg-gray-800 rounded-sm aspect-square cursor-cell p-2" key={i}>

                </button>
            ))}
        </section>
    );
}

export default BuildOptions;