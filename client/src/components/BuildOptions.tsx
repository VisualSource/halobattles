import { Badge, Tooltip } from "flowbite-react";
import clsx from 'clsx';
import { usePlayerCredits } from "../hooks/usePlayer";
import QueueEngine from "../lib/QueueEngine";
import { trpc } from "../lib/network";



const BuildOptions: React.FC<{ nodeId: string, queueId: string }> = ({ nodeId, queueId }) => {
    const [options] = trpc.getBuildOptions.useSuspenseQuery(nodeId)
    const buy = trpc.buyItem.useMutation();
    const playerCerdits = usePlayerCredits();

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
                            {value.levels[1]?.values.map((value, i) => (
                                <Badge key={i} size="xs" color={value.color}>{value.text}</Badge>
                            ))}
                        </div>
                    </div>
                )}>
                    <button className={clsx(playerCerdits < (value.levels[1]?.build?.cost ?? Infinity) ? "cursor-not-allowed bg-gray-800" : "cursor-cell", "border-2 border-gray-600 hover:bg-gray-800 rounded-sm aspect-square p-2")} onClick={() => {
                        if (playerCerdits < (value.levels[1]?.build?.time ?? Infinity)) return;
                        try {
                            buy.mutate({
                                type: "building-tech",
                                id: value.id,
                                level: 1
                            });

                            QueueEngine.enqueue({
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
                            })
                        } catch (error) {
                            console.error(error);
                        }
                    }}>
                        <img className={clsx("rounded-md", playerCerdits < (value.levels[1]?.build?.cost ?? Infinity) ? "grayscale" : undefined)} src={value.icon} alt="building icon" />
                    </button>
                </Tooltip>
            ))}
            {Array.from({ length: (6 * 6) - options.length }).map((_, i) => (
                <button className="border-2 border-gray-600 hover:bg-gray-800 rounded-sm aspect-square cursor-cell p-2" key={i}></button>
            ))}
        </section>
    );
}

export default BuildOptions;