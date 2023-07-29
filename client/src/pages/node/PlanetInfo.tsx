import { Suspense } from 'react';
import { Badge } from 'flowbite-react';
import Fallback from '../../components/OptionsFallback';
import { trpc } from '../../lib/network';
import useGetNode, { useNodeOwnerId } from '../../hooks/useGetNode';


const Planet: React.FC = () => {
    const node = useGetNode();
    const ownerId = useNodeOwnerId();
    if (!node) throw new Error("Failed to load node");
    const [data] = trpc.getPlanetInfo.useSuspenseQuery({ owner: ownerId, name: node.name });

    return (
        <div className="w-full flex p-2 justify-center gap-4">
            <section className="flex my-4 flex-col">
                <div className="mb-6 flex items-center justify-center">
                    <img className="aspect-square rounded-full h-32" alt="planet-reach" src={data.planet.icon} />

                    <div className="ml-4">
                        <h1 className="text-4xl font-bold">{data.planet.name}</h1>
                        <hr />
                    </div>
                </div>
                <p className="mb-3 text-gray-400 max-w-lg">
                    {data.planet.description}
                </p>
            </section>
            <div>
                <section className="flex flex-col mb-4">
                    <h2 className="mb-2 text-lg font-semibold text-white">Bouns:</h2>
                    <div className='flex flex-wrap gap-4'>
                        {data.planet.bouns.map((item, i) => (
                            <Badge color={item.color} key={i}>{item.text}</Badge>
                        ))}
                    </div>
                </section>
                <section className="flex flex-col">
                    <h2 className="mb-2 text-lg font-semibold text-white">Current Owner:</h2>
                    <h4>{data.owner ? data.owner.name : "No owner"}</h4>
                </section>
            </div>

        </div>
    );
}


const PlanetInfo: React.FC = () => {
    return (
        <Suspense fallback={<Fallback />}>
            <Planet />
        </Suspense>

    );
}

export default PlanetInfo;