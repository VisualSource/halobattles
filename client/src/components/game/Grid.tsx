import { useEffect } from "react";
import { useRef } from "react";
import Sortable from "sortablejs";

const Grid: React.FC = () => {
    const data = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let group: Sortable | undefined;

        if (data.current) {
            group = new Sortable(data.current, {
                group: "unit-grid",
                animation: 150,
                selectedClass: "bg-zinc-800",
                multiDrag: true,
                onFilter(event) {
                    console.log(event);
                },
                onEnd(event) {
                    //console.log(event);
                },
                onMove(evt, originalEvent) {
                    //console.log(evt, originalEvent);
                },
            });
        }

        return () => {
            group?.destroy();
        }
    }, []);
    return (
        <section className="grid grid-cols-4 grid-rows-6 gap-1" ref={data}>
            <div className="bg-zinc-900 col-span-1"></div>
            <div className="bg-zinc-900 col-span-1"></div>
            <div className="bg-zinc-900 col-span-1"></div>
            <div className="bg-zinc-900 col-span-1"></div>
            <div className="bg-zinc-900 col-span-1"></div>
            <div className="bg-zinc-900 col-span-1"></div>
            <div className="bg-zinc-900 col-span-1"></div>
            <div className="bg-zinc-900 col-span-1"></div>
            <div className="bg-zinc-900 col-span-1"></div>
            <div className="bg-zinc-900 col-span-1"></div>
            <div className="bg-zinc-900 col-span-1"></div>
            <div className="bg-zinc-900 col-span-1"></div>
            <div className="bg-zinc-900 col-span-1"></div>
            <div className="bg-zinc-900 col-span-1"></div>
            <div className="bg-zinc-900 col-span-1"></div>
            <div className="bg-zinc-900 col-span-1"></div>
            <div className="bg-zinc-900 col-span-1"></div>
            <div className="bg-zinc-900 col-span-1"></div>
            <div className="bg-zinc-900 col-span-1"></div>
            <div className="bg-zinc-900 col-span-1"></div>
        </section>
    );
}

export default Grid;