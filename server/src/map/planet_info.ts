type PlanetInfo = {
    name: string;
    bouns: { color: string; text: string; }[],
    effects: unknown[],
    description: string;
    icon: string;
}

type Planets = { [key: string]: PlanetInfo };

const ForerunnerPlanets: Planets = {
    "Onyx": {
        name: "Onyx",
        bouns: [],
        effects: [],
        description: "Onyx, officially known to the UNSC as \"XF-063\" or Zeta Doradus IV, was a planet-sized Forerunner megastructure located in the Zeta Doradus system, and formerly the external component of the shield installation designated Shield World 006. While it had a human-habitable surface and a seemingly terrestrial crust, Onyx was internally composed of trillions of Onyx Sentinels. The artificial planet's ultimate purpose was to guard the entrance to the shield world proper, a Dyson sphere held in a miniature slipspace bubble.",
        icon: "https://halo.wiki.gallery/images/6/63/Onyxbetter.jpg"
    },
    "Requiem": {
        name: "Requiem",
        bouns: [],
        effects: [],
        description: "Requiem, formally designated by its Forerunner creators as Shield World 0001, was a Forerunner shield world located in the Epoloch system. It once served as the central base of operations for the Prometheans, an elite class of Warrior-Servants, for thousands of years until the end of the Forerunner-Flood war. It remained sealed off for a hundred millennia since the end of the war, and became the site of major events as UNSC and Jul 'Mdama's Covenant forces stumbled upon it in 2557. The UNSC Infinity returned to Requiem in early 2558, resulting in a protracted battle between the UNSC and the occupying Promethean-Jul's Covenant alliance. Requiem itself was destroyed at the conclusion of this campaign by Jul 'Mdama.",
        icon: "https://halo.wiki.gallery/images/4/41/H4-Concept-Requiem-Entrance.jpg"
    },
    "Aktis IV": {
        name: "Aktis IV",
        bouns: [],
        effects: [],
        description: "Aktis IV was once part of the Forerunner ecumene. The Forerunners had left behind some structures and a shrine on the surface of the planet. Jul 'Mdama's Covenant established a base of operations in the shrine with only a skeleton force to guard the outside.",
        icon: "https://halo.wiki.gallery/images/d/d6/HE13_Aktis_IV.jpeg"
    },
    "Alluvion": {
        name: "Alluvion",
        bouns: [],
        effects: [],
        description: "Alluvion, also known as Bhaakto III, is the third planet in the Bhaakto system and a human Outer Colony of the Unified Earth Government. Alluvion is orbited by the natural satellites Fallow and Falgo. Once home to millions, Alluvion was glassed by the Covenant in 2543 during the Human-Covenant War. By 2554, Alluvion has been recolonized.",
        icon: "https://halo.wiki.gallery/images/9/95/Enc22_Alluvion.jpg"
    },
    "Draetheus V": {
        name: "Draetheus V",
        bouns: [],
        effects: [],
        description: "Draetheus V was a human colony world in the Draetheus system. It had one moon, designated X50; unbeknownst to the colonists, the moon was actually a Forerunner orbital reformer. The planet had a unique magnetic signature.",
        icon: "https://halo.wiki.gallery/images/3/33/HSA_Draetheus_V.jpg"
    },
    "Hesduros": {
        name: "Hesduros",
        bouns: [],
        effects: [],
        description: "Hesduros, known as Kelekos to the Forerunners, is a remote planet in former Covenant space colonized by Sangheili.",
        icon: "https://halo.wiki.gallery/images/f/fc/Hesduros.png"
    },
    "Kamchatka": {
        name: "Kamchatka",
        bouns: [],
        effects: [],
        description: "Kamchatka (Caspar V) is the fifth planet in the Caspar system. A remote world, Kamchatka was created by the Forerunners and served as a rehabilitation complex for the Lifeworkers, and as a node of the Domain for the ecumene. Following the firing of the Halo Array, Kamchatka remained an obscure world at the fringes of civilization until the planet's discovery in 2558.",
        icon: "https://halo.wiki.gallery/images/0/08/Enc22-Kamchatka.png"
    },
    "Maethrillian": {
        name: "Maethrillian",
        bouns: [],
        effects: [],
        description: "Maethrillian, commonly known as the Capital, was the political center of the Forerunner ecumene. It housed the Ecumene Council, the main governing body of the ecumene, as well as the Capital Court. It was a massive structure, greatly exceeding the scale of even the Halo installations.",
        icon: "https://halo.wiki.gallery/images/c/c5/FoM.jpg"
    },
    "Meridian": {
        name: "Meridian",
        bouns: [],
        effects: [],
        description: "Meridian, known to the Forerunners as Pridarea Libatoa, is a human Outer Colony and the seventh natural satellite of the gas giant Hestia V in the Hestia system. Despite being located on the edges of human space, Meridian was a vibrant and thriving colony with a robust economy and an impressive population; mining and military production for the United Nations Space Command were known industries on the colony. Once a green world, the moon held a temperate climate and fertile land.",
        icon: "https://halo.wiki.gallery/images/c/cb/HWF-Meridian.png"
    },
    "Zhoist": {
        name: "Zhoist",
        bouns: [],
        effects: [],
        description: "Zhoist, or Light to the Path, is a planet in the Buta system. It was formerly controlled by the Forerunners, but was later settled by the Covenant. In 2526, it became the site of an attack by the United Nations Space Command's Task Force Yama. During the battle at Zhoist, the UNSC forces gave the planet a designation of Naraka.",
        icon: "https://halo.wiki.gallery/images/1/1b/Enc22_Zhoist.jpg"
    },
};

const UNSCPlanets: Planets = {
    "Reach": {
        icon: "https://halo.wiki.gallery/images/thumb/6/61/HR-PlanetReach-Bnet.jpg/300px-HR-PlanetReach-Bnet.jpg",
        name: "Reach",
        bouns: [],
        effects: [],
        description: "Reach, also known as Epsilon Eridani II, is a human colony world in the Epsilon Eridani system, located within the Inner Colonies and is the sister planet of Earth itself. At 10.5 light years from the Sol system, it is located at Earth's metaphorical doorstep. Reach is the fourth largest planet in the Epsilon Eridani system, and second closest to the star Epsilon Eridani. Once home to a Forerunner presence, Reach held considerable importance to the United Nations Space Command as the nexus of its military and the site of many military-industrial facilities such as shipyards. It was also significant for being one of the largest producers of titanium, which is plentiful on the planet. Though most commonly recognized for its status as a military world, Reach was also humanity's most populous colony world, its civilian population living in its preplanned cities or defying the planet's harsh nature in sturdy pioneer settlements. It was considered a center for civilian enterprise and logistical hub."
    },
    "Earth": {
        icon: "https://halo.wiki.gallery/images/b/ba/HTV-HalseyComputer-Earth.png",
        name: "Earth",
        bouns: [],
        effects: [],
        description: "Earth, also known as Sol III, known in the Forerunner era as \"Erde-Tyrene\" (pronounced \"Er-da-ty-reen\") or \"Erda\", is the third planet and one of four terrestrial worlds of the Sol system. It is the presumptive homeworld of the human species, though this was disputed by some ancient humans, due to the loss of records to technological dark ages and the presence of human ruins on other worlds. It is the current capital world of the Unified Earth Government, and home to the headquarters of the United Nations Space Command."
    },
    "Arcadia": {
        "name": "Arcadia",
        bouns: [],
        effects: [],
        description: "Arcadia is the fourth planet in the Procyon system, orbited by two natural satellites—Gihon and Pishon. Colonized in 2429, Arcadia was a human Outer Colony of the Unified Earth Government, home to a population of nearly three million. A thriving colony, Arcadia was a popular tourist destination, famed for its lush jungles and forests.",
        icon: "https://halo.wiki.gallery/images/5/52/Arcadia%28blur%29.png"
    },
    "Harvest": {
        name: "Harvest",
        bouns: [],
        effects: [],
        description: "Harvest, also known as Epsilon Indi IV, designated CE-309-8 d by the Forerunners, was a human Outer Colony world founded as a \"breadbasket\" world. Founded in 2468 by the UNSC Skidbladnir, the colony was the most remote at the time of its founding. Located in the Epsilon Indi system, the planet had the unfortunate distinction of being the first human planet discovered and destroyed by the Covenant. After a disastrous first contact, the planet was subsequently glassed by the Covenant, but most of its population managed to escape in freighters.",
        icon: "https://halo.wiki.gallery/images/8/82/Harvest_pre-glassing.png"
    },
    "Callisto": {
        name: "Callisto",
        bouns: [],
        effects: [],
        description: "Callisto is a moon of Jupiter in the Sol system and a human colony. With little population to speak of, Callisto's purpose to the Unified Earth Government is primarily militaristic in nature; the moon's several UNSC bases are capable of launching their units and ships within an hour's notice.",
        icon: "https://halo.wiki.gallery/images/2/28/Enc22_Callisto.jpg"
    },
    "Concord": {
        name: "Concord",
        bouns: [],
        effects: [],
        description: "Concord is a planet in the Alabaster system and a human Outer Colony, under the authority of the Unified Earth Government.",
        icon: "https://halo.wiki.gallery/images/0/00/Enc22_Concord_flipped.png"
    },
    "Draco III": {
        name: "Draco III",
        bouns: [],
        effects: [],
        description: "Draco III, also known simply as Draco, is a human colony world governed by the Unified Earth Government, known to be very peaceful and idyllic. The world of Newsaka is located relatively close to Draco III. The capital city of Draco III is New Albany.",
        icon: "https://halo.wiki.gallery/images/4/48/Enc22_DracoIII.jpg"
    },
    "Eridanus II": {
        name: "Eridanus II",
        bouns: [],
        effects: [],
        description: "Eridanus II is a human Outer Colony planet in the Eridanus system. The planet was mostly rural, devoid of pollution or crowding, and had climate-controlled weather. It was famous for its beautiful landscapes and higher learning centers. It was the location of the cities of Luxor and Elysium City, where John-117 grew up until he was abducted and sent into the SPARTAN-II program in 2517. Emile-A239 was from Luxor, born there in 2523.",
        icon: "https://halo.wiki.gallery/images/5/5e/WFEridanusII.png"
    },
    "Ganymede": {
        name: "Ganymede",
        bouns: [],
        effects: [],
        description: "Ganymede is a natural satellite governed by the Unified Earth Government and is the largest moon of Jupiter in the Sol system. ",
        icon: "https://halo.wiki.gallery/images/f/f9/Enc22_Ganymede.jpg"
    },
    "Mars": {
        name: "Mars",
        bouns: [],
        effects: [],
        description: "Mars, also known as Sol IV, known as Edom in the Forerunner era, is the fourth planet of the Sol system, and one of four terrestrial worlds. One of the first human interplanetary colonies, Mars is a major industrial center and one of the largest in the Sol system. Mars is home to the UNSC Navy's primary shipyards and the Orbital Drop Shock Troopers' headquarters in the city of Kenosha, Tanais.",
        icon: "https://halo.wiki.gallery/images/8/8b/Enc22_Mars.jpg"
    },
}

const CovenantPlanets: Planets = {
    "Janjur Qom": {
        icon: "https://halo.wiki.gallery/images/4/44/Waypoint_-_Janjur_Qom.png",
        name: "Janjur Qom",
        bouns: [],
        effects: [],
        description: "Janjur Qom was a predominantly jungle world of the three inner planets in the Qom Yaekesh system and the homeworld of the San'Shyuum. The planet was orbited by one natural satellite, Plaon."
    },
    "Ansket IV": {
        name: "Ansket IV",
        bouns: [],
        effects: [],
        description: "Ansket IV is a terrestrial planet orbiting the star, Ansket. It was the site of a Covenant Hydro-processing facility prior to being abandoned by the empire. The United Nations Space Command established a forward operating base at the site of the Covenant facility. In 2553, this UNSC base came under attack by the Banished.",
        icon: "https://halo.wiki.gallery/images/d/d3/AnsketIV.png"
    },
    "Balaho": {
        name: "Balaho",
        bouns: [],
        effects: [],
        description: "alaho, also known as Tala IV, is the homeworld of the Unggoy and the fourth planet orbiting the blue star Tala. Hosting an atmosphere featuring large quantities of methane, Balaho is orbited by two natural satellites; Buwan and Padpad. Balaho is a hostile and frigid world, home to brackish tidal flats and numerous swamps, growing less hospitable due to environmental degradation.",
        icon: "https://halo.wiki.gallery/images/1/1e/Balaho.png"
    },
    "Carrow": {
        name: "Carrow",
        bouns: [],
        effects: [],
        description: "Carrow, referred to by the Sangheili as Rakoi, is a planet and former human Outer Colony in a Joint-Occupation Zone. Following the Human-Covenant War, the planet was settled as a Sangheili colony, eventually acting as a home for both humans and Sangheili.",
        icon: "https://halo.wiki.gallery/images/9/96/Enc22_Carrow.jpg"
    },
    "Sanghelios": {
        name: "Sanghelios",
        bouns: [],
        effects: [],
        description: "Sanghelios, also known as Urs IV and designated CE-80-9012 d by the Forerunners, is the homeworld of the Sangheili species. Sanghelios is the fourth planet in the Urs system, a triple star system containing Urs, Fied, and Joori. The planet is orbited by two natural satellites, Qikost and Suban. Sanghelios is a world with a very militaristic and feudal society, a result of the planet's harsh environment.",
        icon: "https://halo.wiki.gallery/images/d/d5/Enc22_Sanghelios.png"
    },
    "Feldokra": {
        name: "Feldokra",
        bouns: [],
        effects: [],
        description: "Feldokra, also called Faithful Perserverance by the San'Shyuum, is an ocean-moon colony inhabited by Sangheili.",
        icon: "https://halo.wiki.gallery/images/b/be/Enc22_Feldokra.jpg"
    },
    "Glyke": {
        name: "Glyke",
        bouns: [],
        effects: [],
        description: "Glyke, called Sphere of Praise by the Prophets, was a Sangheili colony world that was destroyed by the Spartan-IIs of Gray Team only days after the formalizing of the treaty between the Unified Earth Government and the Fleet of Retribution.",
        icon: "https://halo.wiki.gallery/images/7/7f/Enc22-Glyke.png"
    },
    "Palamok": {
        name: "Palamok",
        bouns: [],
        effects: [],
        description: "Palamok is the third planet of the Napret system, and the homeworld of the Yanme'e. The planet is orbited by four moons: Naxook, Oquiu, Ka'amoti, and Kami.",
        icon: "https://halo.wiki.gallery/images/3/39/Enc22_Palamok.png"
    },
    "Kostroda": {
        name: "Kostroda",
        bouns: [],
        effects: [],
        description: "Kostroda, known as Enduring Service in English, is a Covenant swamp-moon of the Mis'Fah system.",
        icon: "https://halo.wiki.gallery/images/0/0a/Enc22_Kostroda.jpg"
    },
    "Malurok": {
        name: "Malurok",
        bouns: [],
        effects: [],
        description: "Malurok (Decided Heart in English) is a former Covenant planet, jointly-held between the Sangheili and Yanme'e populations that have resided there for centuries.",
        icon: "https://www.halopedia.org/File:Malurok.png"
    }
}

const BanishedPlanets: Planets = {
    "Doisac": {
        icon: "https://halo.wiki.gallery/images/6/60/WFDoisac.jpg",
        name: "Doisac",
        bouns: [],
        effects: [],
        description: "Doisac, designated CE-75-2113c by the Forerunners, was the third planet of the Oth Sonin system and the homeworld of the Jiralhanae. The planet possessed three natural satellites, Warial, Soirapt, and Teash."
    },
    "Teash": {
        name: "Teash",
        bouns: [],
        effects: [],
        description: "Teash, along with Warial and Soirapt, was one of the three natural satellites orbiting Doisac, the former-Jiralhanae homeworld and the third planet in the Oth Sonin system.",
        icon: "https://halo.wiki.gallery/images/6/64/HINF_BrutePatrolConcept.jpg"
    },
    "Warial": {
        name: "Warial",
        bouns: [],
        effects: [],
        description: "Warial, along with Soirapt and Teash, was one of the three natural satellites orbiting Doisac, the Jiralhanae homeworld and the third planet in the Oth Sonin system.",
        icon: "https://halo.wiki.gallery/images/3/37/HINF_Concept_BruteArchitecture2.jpg"
    },
    "Sephune III": {
        name: "Sephune III",
        bouns: [],
        effects: [],
        description: "Sephune III is the terrestrial planet orbiting the star Sephune. The planet was the final resting place of the now destroyed UNSC Promise of Dawn, after its escape from the events of the Fall of Reach in 2552.",
        icon: "https://halo.wiki.gallery/images/4/41/HLW_Sephune_III.png"
    },
    "Te": {
        name: "Te",
        bouns: [],
        effects: [],
        description: "Te is a gas giant and the fifth planet orbiting the star Svir. It is the homeworld of the Lekgolo species.",
        icon: "https://halo.wiki.gallery/images/d/d2/Enc22_Te.png"
    },
    "Ven III": {
        name: "Ven III",
        bouns: [],
        effects: [],
        description: "Ven III is a volcanic planet located on the outskirts of the Joint Occupation Zone and the third planet in the Ven system.",
        icon: "https://halo.wiki.gallery/images/3/35/HE12_Infinity_Ven-III.jpg"
    },
    "Ulgethon": {
        name: "Ulgethon",
        bouns: [],
        effects: [],
        description: "Ulgethon was a rocky world colonized by the Sangheili in the pre-Covenant era.",
        icon: "https://halo.wiki.gallery/images/2/28/HM_WarOfBeginnings.jpg"
    },
    "Tuluk'katho": {
        name: "Tuluk'katho",
        bouns: [],
        effects: [],
        description: "Tuluk'katho is a planet within the Covenant domain. ",
        icon: "https://halo.wiki.gallery/images/2/29/HM-HighCharityBC.png"
    },
    "Eayn": {
        name: "Eayn",
        bouns: [],
        effects: [],
        description: "Eayn is the primary natural satellite orbiting Chu'ot, the third planet in the Y'Deio system, as well as the homeworld of the Kig-Yar. The moon lies on the inner region of the Y'Deio system's expansive asteroid belt, with many Kig-Yar choosing to live on the planetoids, moons, and asteroids within the asteroid belt.",
        icon: "https://halo.wiki.gallery/images/7/7e/Enc22_Eayn.png"
    },
    "Karava": {
        name: "Karava",
        bouns: [],
        effects: [],
        description: "Karava is a Sangheili-held colony world that lies in the middle of contested space.",
        icon: "https://halo.wiki.gallery/images/d/d7/RoA_-_Karava.png"
    }
}

export const planetInfo: Planets = {
    ...ForerunnerPlanets,
    ...UNSCPlanets,
    ...CovenantPlanets,
    ...BanishedPlanets,
    "Unnamed Planet": {
        icon: "/Basic_Elements_(128).jpg",
        name: "Unnamed Planet",
        bouns: [],
        effects: [],
        description: "This planet has no description."
    },
}