type PlanetInfo = {
    name: string;
    bouns: { color: string; text: string; }[],
    effects: unknown[],
    description: string;
    icon: string;
}

export const planetInfo: { [key: string]: PlanetInfo } = {
    "Reach": {
        icon: "https://halo.wiki.gallery/images/thumb/6/61/HR-PlanetReach-Bnet.jpg/300px-HR-PlanetReach-Bnet.jpg",
        name: "Reach",
        bouns: [{ color: "green", text: "+200 Unit Cap" }],
        effects: [],
        description: "Reach, also known as Epsilon Eridani II, is a human colony world in the Epsilon Eridani system, located within the Inner Colonies and is the sister planet of Earth itself. At 10.5 light years from the Sol system, it is located at Earth's metaphorical doorstep. Reach is the fourth largest planet in the Epsilon Eridani system, and second closest to the star Epsilon Eridani. Once home to a Forerunner presence, Reach held considerable importance to the United Nations Space Command as the nexus of its military and the site of many military-industrial facilities such as shipyards. It was also significant for being one of the largest producers of titanium, which is plentiful on the planet. Though most commonly recognized for its status as a military world, Reach was also humanity's most populous colony world, its civilian population living in its preplanned cities or defying the planet's harsh nature in sturdy pioneer settlements. It was considered a center for civilian enterprise and logistical hub."
    },
    "Unnamed Planet": {
        icon: "/Basic_Elements_(128).jpg",
        name: "Unnamed Planet",
        bouns: [],
        effects: [],
        description: "This planet has no description."
    }
}