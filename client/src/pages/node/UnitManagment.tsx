import type { GroupType } from "server/src/object/Location";
import useGetNode, { useNodeUnitGroup, useIsNodeOwner, useIsNodeSpy } from "../../hooks/useGetNode";
import { trpc } from "../../lib/network";

type TransferItem = { id: number; type: GroupType; idx: number; };

const Grid: React.FC<{ type: GroupType, nodeId: string; owner: boolean, spy: boolean }> = ({ owner, spy, nodeId, type }) => {
    const units = useNodeUnitGroup(type, nodeId);
    const mutation = trpc.internalTransfer.useMutation();

    return (
        <section className="grid grid-rows-6 grid-cols-4 overflow-y-scroll">
            {Array.from({ length: 6 * 4 }).map((_, key) => {
                const idx = units?.findIndex(value => value.idx === key);

                if (!units || idx === undefined || idx === -1) {
                    return (
                        <div className="w-full col-span-1 row-span-1 border-2 border-gray-600 hover:bg-gray-800" key={key} onDrop={owner ? (ev) => {
                            ev.preventDefault();
                            const data = JSON.parse(ev.dataTransfer?.getData("application/json") ?? "null") as TransferItem | null;
                            if (!data) throw new Error("Failed to get transfer data.");
                            if (data.id !== data.id) return;

                            mutation.mutateAsync({
                                moveGroup: ev.ctrlKey,
                                nodeId,
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


                        } : undefined} onDragOver={(ev) => ev.preventDefault()}></div>
                    );
                }

                const unit = units[idx];

                return (
                    <button key={key} className="w-full p-2 relative col-span-1 row-span-1 border-2 border-gray-600 hover:bg-gray-800"
                        onDrop={owner ? (ev) => {
                            ev.preventDefault();
                            const data = JSON.parse(ev.dataTransfer?.getData("application/json") ?? "null") as TransferItem | null;
                            if (!data) throw new Error("Faild to get transfer data.");
                            if (data.id !== data.id) return;

                            mutation.mutateAsync({
                                nodeId: nodeId,
                                moveGroup: ev.ctrlKey,
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
                        } : undefined}
                        onDragOver={(ev) => ev.preventDefault()}
                        onDragStart={owner ? (ev) => {
                            ev.dataTransfer?.setData("application/json", JSON.stringify({
                                id: unit.id,
                                type,
                                idx: key
                            } as TransferItem));
                        } : undefined}>
                        <img className="aspect-square h-full rounded-md select-none" src={(owner || spy) ? unit.icon : "/Basic_Elements_(128).jpg"} alt={unit.id.toString()} />
                        {unit.count > 1 ? (
                            <div className="absolute inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-red-500 border-2 rounded-full top-0.5 right-0.5 border-gray-900">{(owner || spy) ? unit.count : "?"}</div>
                        ) : null}
                    </button>
                );
            })}
        </section>
    );
}

const UnitManagment: React.FC = () => {
    const node = useGetNode();
    const isOwner = useIsNodeOwner();
    const isSpy = useIsNodeSpy();

    if (!node) throw new Error("Failed to get node");

    return (
        <div className="w-full grid grid-cols-3">
            <Grid owner={isOwner} spy={isSpy} nodeId={node?.objectId} type="left" />
            <Grid owner={isOwner} spy={isSpy} nodeId={node?.objectId} type="center" />
            <Grid owner={isOwner} spy={isSpy} nodeId={node?.objectId} type="right" />
        </div>
    )
}

export default UnitManagment;