import Location from "../object/Location";

const a = "325fbc0e-c71f-452b-92a4-53a3205d267a";
const b = "98484084-81d9-4d7d-b384-ebd2dff7671f";
const c = "dea893a0-45af-4493-b459-d286daf16518";
const d = "184ed098-eb9b-4910-99fe-3facdd17a0a9";
const e = "52c05845-8d19-4a4e-9058-92648e50177e";
const f = "6a92bf56-251a-48f0-b192-ce1840ef2a31"

const map = [
    new Location({
        name: "Unnamed Planet",
        connectsTo: [b, c],
        objectId: a,
        owner: "dd-dd-dd-dd",
        position: {
            x: 0,
            y: 0
        }
    }),
    new Location({
        name: "Unnamed Planet",
        connectsTo: [b, c],
        objectId: f,
        owner: null,
        position: {
            x: 0,
            y: 50
        }
    }),
    new Location({
        name: "Unnamed Planet",
        connectsTo: [a, f, d],
        objectId: b,
        owner: null,
        position: {
            x: 100,
            y: 100
        }
    }),
    new Location({
        name: "Unnamed Planet",
        connectsTo: [b, e],
        objectId: d,
        owner: null,
        position: {
            x: 150,
            y: 100
        },
    }),
    new Location({
        name: "Unnamed Planet",
        connectsTo: [d],
        objectId: e,
        owner: null,
        position: {
            x: 150,
            y: 50
        }
    }),

    new Location({
        name: "Reach",
        connectsTo: [a, f],
        objectId: c,
        owner: "1724ea86-18a1-465c-b91a-fce23e916aae",
        position: {
            x: -100,
            y: 0
        }
    }),
];

export default map;