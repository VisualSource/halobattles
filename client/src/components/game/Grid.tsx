import { useEffect } from "react";
import { useRef } from "react";
import Sortable from "sortablejs";
import { client } from '@/lib/trpc';

const Grid: React.FC<{ canEdit: boolean; units: { icon: string; count: number; id: string; }[], nodeId: string; groupId: number }> = ({ canEdit, units, nodeId, groupId }) => {
    const data = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let group: Sortable | undefined;

        if (data.current && canEdit) {
            group = new Sortable(data.current, {
                group: "unit-grid",
                animation: 150,
                selectedClass: "bg-zinc-600",
                filter: ".nonsortable",
                multiDrag: true,
                onMove(event) {
                    if (event.to.children.length > 20) {
                        const el = event.to.children.item(event.to.children.length - 1);
                        if (el?.getAttribute("data-content") === "empty") el.remove();
                    }
                },
                onAdd(event) {
                    const value = parseInt(event.item.firstElementChild?.getAttribute("data-amount") ?? "0");
                    const move_amount = (event as never as CustomEvent & { originalEvent: KeyboardEvent }).originalEvent.shiftKey ? value < 5 ? value : 5 : 1;

                    const item_id = event.item.dataset.content;
                    if (!item_id || item_id === "empty") return;
                    const query = event.to.querySelectorAll(`[data-content=${item_id}]`);

                    if (query.length === 1) {
                        const el = parseInt(event.item.firstElementChild?.getAttribute("data-amount") ?? move_amount.toString());
                        event.item.firstElementChild?.setAttribute("data-amount", move_amount.toString());

                        if (el <= move_amount) return;
                        const clone = event.item.cloneNode(true) as HTMLDivElement;
                        clone.firstElementChild?.setAttribute("data-amount", (el - move_amount).toString());
                        event.from.insertBefore(clone, event.from.children.item(event.oldIndex ?? 0));
                        return;
                    }

                    for (const el of query) {
                        if (el === event.item) {
                            const amount = parseInt((el.firstElementChild as HTMLElement)?.dataset?.amount ?? "0");
                            if (amount <= 1) {
                                event.item.remove();
                                continue;
                            }
                            event.item.firstElementChild?.setAttribute("data-amount", (amount - 1).toString())
                            event.from.insertAdjacentElement("afterbegin", event.item);
                            continue;
                        }

                        const amount = parseInt(el.firstElementChild?.getAttribute("data-amount") ?? "0") + 1;
                        el.firstElementChild?.setAttribute("data-amount", amount.toString());
                    }
                },
                onEnd(event) {
                    if (event.from.children.length < 20) {
                        for (let i = event.from.children.length; i < 20; i++) {
                            const el = document.createElement("div");
                            el.classList.add("bg-zinc-900", "col-span-1", "nonsortable");
                            el.setAttribute("data-content", "empty");
                            event.from.appendChild(el);
                        }
                    }

                    if (event.to.children.length < 20) {
                        for (let i = event.to.children.length; i < 20; i++) {
                            const el = document.createElement("div");
                            el.classList.add("bg-zinc-900", "col-span-1", "nonsortable");
                            el.setAttribute("data-content", "empty");
                            event.to.appendChild(el);
                        }
                    }

                    const order: { id: string; count: string }[] = [];
                    event.to.querySelectorAll("div:not([data-content='empty'])").forEach(e => {
                        const content = e.getAttribute("data-content");
                        const count = e.firstElementChild?.getAttribute("data-amount");
                        if (!content || !count) return;
                        order.push({ id: content, count });
                    });

                    const orderb: { id: string; count: string }[] = [];
                    event.from.querySelectorAll("div:not([data-content='empty'])").forEach(e => {
                        const content = e.getAttribute("data-content");
                        const count = e.firstElementChild?.getAttribute("data-amount");
                        if (!content || !count) return;
                        orderb.push({ id: content, count });
                    });

                    client.updateGroup.mutate({
                        node: nodeId,
                        [`group_${event.to.getAttribute("data-id")}`]: order,
                        [`group_${event.from.getAttribute("data-id")}`]: orderb,
                    });
                },
            });
        }

        return () => {
            group?.destroy();
        }
    }, [nodeId, canEdit]);
    return (
        <section className="grid grid-cols-4 grid-rows-6 gap-1" ref={data} data-id={groupId}>
            {units.map(value => (
                <div key={value.id} className="col-span-1 p-4 relative bg-gray-800" data-content={value.id}>
                    <div data-amount={value.count.toString()} className="absolute before:content-[attr(data-amount)] bg-white rounded-full px-2 flex items-center justify-center font-bold top-2 left-2 text-sm"></div>
                    <img className="object-contain" src={value.icon} />
                </div>
            ))}
            {Array.from({ length: 20 - units.length }).map((_, i) => (
                <div key={i} className="bg-zinc-900 col-span-1 nonsortable" data-content="empty"></div>
            ))}
        </section>
    );
}

export default Grid;