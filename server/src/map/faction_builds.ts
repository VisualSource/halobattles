import type { Factions } from "../object/GameState.js";

export const factionStart: { [key in Factions]: string } = {
    Banished: "Doisac",
    Covenant: "Janjur Qom",
    Forerunner: "Ghibalb",
    UNSC: "Earth"
}
export
    const factionColors: { [key in Factions]: number } = {
        "Banished": 0xe82a00,
        Covenant: 0x8208d8,
        Forerunner: 0x00b9f7,
        UNSC: 0x1db207
    }

const factionsBuildable: { [faction in Factions]: { units: number[]; buildings: number[] } } = {
    "Banished": {
        units: [9, 10, 11, 12, 13, 15, 16, 17, 18, 19],
        buildings: [0]
    },
    Covenant: {
        units: [13, 14, 20, 21, 22, 23, 24, 25, 26],
        buildings: []
    },
    Forerunner: {
        units: [27, 28, 29, 30, 31, 32, 33, 34],
        buildings: []
    },
    UNSC: {
        units: [0, 1, 2, 3, 4, 5, 6, 7, 8],
        buildings: []
    }
}

export default factionsBuildable;