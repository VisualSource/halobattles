import { Factions } from "../object/GameState.js";

const factionsBuildable: { [faction in Factions]: { units: number[]; buildings: number[] } } = {
    "Banished": {
        units: [0, 1],
        buildings: [0]
    },
    Covenant: {
        units: [1],
        buildings: []
    },
    Forerunner: {
        units: [],
        buildings: []
    },
    UNSC: {
        units: [],
        buildings: []
    }
}

export default factionsBuildable;