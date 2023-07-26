import useGetNode from "../../hooks/useGetNode";

const UnitManagment: React.FC = () => {
    const node = useGetNode();

    return (
        <div className="w-full grid grid-cols-3">
            <section className="grid grid-rows-6 grid-cols-4 overflow-y-scroll">
                {Array.from({ length: 6 * 4 }).map((_, i) => (
                    <div className="w-full col-span-1 row-span-1 border-2 border-gray-600 hover:bg-gray-800" key={i}></div>
                ))}
                {node?.units.left.map((value, key) => (
                    <div key={key} className="bg-gray-900 h-24 w-24">{key}</div>
                ))}
            </section>
            <section className="grid grid-rows-6 grid-cols-4 overflow-y-scroll">
                {Array.from({ length: 6 * 4 }).map((_, i) => (
                    <div className="w-full col-span-1 row-span-1 border-2 border-gray-600 hover:bg-gray-800" key={i}></div>
                ))}
                {node?.units.center.map((value, key) => (
                    <div key={key} className="bg-gray-900 h-24 w-24">{key}</div>
                ))}
            </section>
            <section className="grid grid-rows-6 grid-cols-4 overflow-y-scroll">
                {Array.from({ length: 6 * 4 }).map((_, i) => (
                    <div className="w-full col-span-1 row-span-1 border-2 border-gray-600 hover:bg-gray-800" key={i}></div>
                ))}
                {node?.units.right.map((value, key) => (
                    <div key={key} className="bg-gray-900 h-24 w-24">{key}</div>
                ))}
            </section>
        </div>
    )
}

export default UnitManagment;