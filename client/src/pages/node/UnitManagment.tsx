import type { GroupType } from "server/src/object/Location";
import useGetNode, { useNodeUnitGroup } from "../../hooks/useGetNode";
import { trpc } from "../../lib/network";

type TransferItem = { id: number; type: GroupType; idx: number; };

const Grid: React.FC<{ type: GroupType, nodeId: string; }> = ({ nodeId, type }) => {
    const units = useNodeUnitGroup(type, nodeId);
    const mutation = trpc.internalTransfer.useMutation();

    return (
        <section className="grid grid-rows-6 grid-cols-4 overflow-y-scroll">
            {Array.from({ length: 6 * 4 }).map((_, key) => {
                const idx = units?.findIndex(value => value.idx === key);

                if (!units || idx === undefined || idx === -1) {
                    return (
                        <div className="w-full col-span-1 row-span-1 border-2 border-gray-600 hover:bg-gray-800" key={key} onDrop={(ev) => {
                            ev.preventDefault();
                            const data = JSON.parse(ev.dataTransfer?.getData("application/json") ?? "null") as TransferItem | null;
                            if (!data) throw new Error("Failed to get transfer data.");
                            if (data.id !== data.id) return;

                            mutation.mutateAsync({
                                nodeId: nodeId,
                                from: {
                                    group: data.type,
                                    id: data.id,
                                    idx: data.idx
                                },
                                to: {
                                    group: type,
                                    idx: key
                                }
                            });


                        }} onDragOver={(ev) => ev.preventDefault()}></div>
                    );
                }

                const unit = units[idx];

                return (
                    <button key={key} className="w-full p-2 relative col-span-1 row-span-1 border-2 border-gray-600 hover:bg-gray-800"
                        onDrop={(ev) => {
                            ev.preventDefault();
                            const data = JSON.parse(ev.dataTransfer?.getData("application/json") ?? "null") as TransferItem | null;
                            if (!data) throw new Error("Faild to get transfer data.");
                            if (data.id !== data.id) return;

                            mutation.mutate({
                                nodeId: nodeId,
                                from: {
                                    group: data.type,
                                    id: data.id,
                                    idx: data.idx
                                },
                                to: {
                                    group: type,
                                    idx: key
                                }
                            });
                        }}
                        onDragOver={(ev) => ev.preventDefault()}
                        onDragStart={(ev) => {
                            ev.dataTransfer?.setData("application/json", JSON.stringify({
                                id: unit.id,
                                type,
                                idx: key
                            } as TransferItem));
                        }}>
                        <img className="aspect-square h-full rounded-md select-none" src={unit.icon} alt="unit" />
                        {unit.count > 1 ? (
                            <div className="absolute inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-red-500 border-2 rounded-full top-0.5 right-0.5 border-gray-900">{unit.count}</div>
                        ) : null}
                    </button>
                );
            })}
        </section>
    );
}

const UnitManagment: React.FC = () => {
    const node = useGetNode();

    if (!node) throw new Error("Failed to get node");

    return (
        <div className="w-full grid grid-cols-3">
            <Grid nodeId={node?.objectId} type="left" />
            <Grid nodeId={node?.objectId} type="center" />
            <Grid nodeId={node?.objectId} type="right" />
        </div>
    )
}

export default UnitManagment;