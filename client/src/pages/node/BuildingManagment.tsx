import { Badge, Button } from 'flowbite-react'
import useGetNode from "../../hooks/useGetNode";

const BuildingManagment: React.FC = () => {
    const node = useGetNode();

    return (
        <div className="grid grid-cols-3 divide-x-2 divide-gray-600 w-full">
            <div className="grid col-span-2 grid-rows-6 grid-cols-6">
                {Array.from({ length: (6 * 3) - (node?.buildings.length ?? 0) }).map((_, i) => (
                    <button className="w-full col-span-1 row-span-1 border-2 border-gray-600 hover:bg-gray-800 cursor-cell rounded-none" key={i}></button>
                ))}
                {Array.from({ length: 6 * 3 }).map((_, i) => (
                    <div className="w-full col-span-1 row-span-1 border-2 border-gray-600 bg-gray-800 cursor-not-allowed" key={i}></div>
                ))}
                {node?.buildings.map((value, key) => (
                    <div key={key} className="bg-gray-900 h-24 w-24">{key}</div>
                ))}
            </div>
            <div className="col-span-1 p-2">
                <div className="flex my-2">
                    <img className="aspect-square h-20 rounded-full" src="/Basic_Elements_(128).jpg" />
                    <div className="ml-4">
                        <h2 className="text-3xl font-bold">Building Name</h2>
                        <h4>Level: 3</h4>
                    </div>
                </div>
                <p className="text-sm mb-2">Lorem ipsum dolor sit amet consectetur adipisicing elit. Magnam est dolores exercitationem, soluta asperiores deleniti. Enim corporis pariatur quo! Itaque commodi ea laboriosam eius repudiandae assumenda! Necessitatibus ratione inventore iusto?</p>
                <hr className="mb-2" />
                <section className="mb-4">
                    <h2 className="mb-2 text-lg font-semibold text-white">Production:</h2>
                    <span>None</span>
                </section>
                <section className="mb-4">
                    <h2 className="mb-2 text-lg font-semibold text-white">Bouns:</h2>
                    <div className='flex flex-wrap gap-4'>
                        <Badge color="green"> +200 Unit Cap</Badge>
                        <Badge color="red">-100 Planet Streagth</Badge>
                    </div>
                </section>
                <Button>Upgrade</Button>
            </div>
        </div>
    );
}

export default BuildingManagment;