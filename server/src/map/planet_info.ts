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
        bouns: [],
        effects: [],
        description: "Reach, also known as Epsilon Eridani II, is a human colony world in the Epsilon Eridani system, located within the Inner Colonies and is the sister planet of Earth itself. At 10.5 light years from the Sol system, it is located at Earth's metaphorical doorstep. Reach is the fourth largest planet in the Epsilon Eridani system, and second closest to the star Epsilon Eridani. Once home to a Forerunner presence, Reach held considerable importance to the United Nations Space Command as the nexus of its military and the site of many military-industrial facilities such as shipyards. It was also significant for being one of the largest producers of titanium, which is plentiful on the planet. Though most commonly recognized for its status as a military world, Reach was also humanity's most populous colony world, its civilian population living in its preplanned cities or defying the planet's harsh nature in sturdy pioneer settlements. It was considered a center for civilian enterprise and logistical hub."
    },
    "Doisac": {
        icon: "https://halo.wiki.gallery/images/6/60/WFDoisac.jpg",
        name: "Doisac",
        bouns: [],
        effects: [],
        description: "Doisac, designated CE-75-2113c by the Forerunners, was the third planet of the Oth Sonin system and the homeworld of the Jiralhanae. The planet possessed three natural satellites, Warial, Soirapt, and Teash."
    },
    "Janjur Qom": {
        icon: "https://halo.wiki.gallery/images/4/44/Waypoint_-_Janjur_Qom.png",
        name: "Janjur Qom",
        bouns: [],
        effects: [],
        description: "Janjur Qom was a predominantly jungle world of the three inner planets in the Qom Yaekesh system and the homeworld of the San'Shyuum. The planet was orbited by one natural satellite, Plaon."
    },
    "Earth": {
        icon: "https://halo.wiki.gallery/images/b/ba/HTV-HalseyComputer-Earth.png",
        name: "Earth",
        bouns: [],
        effects: [],
        description: "Earth, also known as Sol III, known in the Forerunner era as \"Erde-Tyrene\" (pronounced \"Er-da-ty-reen\") or \"Erda\", is the third planet and one of four terrestrial worlds of the Sol system. It is the presumptive homeworld of the human species, though this was disputed by some ancient humans, due to the loss of records to technological dark ages and the presence of human ruins on other worlds. It is the current capital world of the Unified Earth Government, and home to the headquarters of the United Nations Space Command."
    },
    "Unnamed Planet": {
        icon: "/Basic_Elements_(128).jpg",
        name: "Unnamed Planet",
        bouns: [],
        effects: [],
        description: "This planet has no description."
    }
}