import { Badge, } from 'flowbite-react';

const PlanetInfo: React.FC = () => {
    return (
        <div className="w-full flex p-2 justify-center gap-4">

            <section className="flex my-4 flex-col">
                <div className="mb-6 flex items-center justify-center">
                    <img className="aspect-square rounded-full h-32" alt="planet-reach" src="https://halo.wiki.gallery/images/thumb/6/61/HR-PlanetReach-Bnet.jpg/300px-HR-PlanetReach-Bnet.jpg" />

                    <div className="ml-4">
                        <h1>Reach</h1>
                        <hr />
                    </div>
                </div>
                <p className="mb-3 text-gray-400 max-w-lg">
                    Reach, also known as Epsilon Eridani II, is a human colony world in the Epsilon Eridani system, located within the Inner Colonies and is the sister planet of Earth itself. At 10.5 light years from the Sol system, it is located at Earth's metaphorical doorstep. Reach is the fourth largest planet in the Epsilon Eridani system, and second closest to the star Epsilon Eridani.
                    Once home to a Forerunner presence, Reach held considerable importance to the United Nations Space Command as the nexus of its military and the site of many military-industrial facilities such as shipyards. It was also significant for being one of the largest producers of titanium, which is plentiful on the planet. Though most commonly recognized for its status as a military world, Reach was also humanity's most populous colony world, its civilian population living in its preplanned cities or defying the planet's harsh nature in sturdy pioneer settlements. It was considered a center for civilian enterprise and logistical hub.
                </p>
            </section>
            <div>
                <section className="flex flex-col mb-4">
                    <h2 className="mb-2 text-lg font-semibold text-white">Bouns:</h2>
                    <div className='flex flex-wrap gap-4'>
                        <Badge color="green"> +200 Unit Cap</Badge>
                        <Badge color="red">-100 Planet Streagth</Badge>
                    </div>
                </section>
                <section className="flex flex-col">
                    <h2 className="mb-2 text-lg font-semibold text-white">Current Owner:</h2>
                    <h4>Username</h4>
                </section>
            </div>

        </div>
    );
}

export default PlanetInfo;