import Location from '../object/Location.js';

class PriorityQueue {
    private queue: { value: string, cost: number }[] = [];
    public push(value: string, cost: number) {
        const item = { value, cost };
        this.queue.push(item);
        this.queue.sort((a, b) => a.cost - b.cost);
    }
    public extractMin() {
        const item = this.queue.shift();
        if (!item) throw new Error("No items in queue");
        return item;
    }
    public empty() {
        return this.queue.length === 0;
    }
}
export default function Dijkstra(graph: Location[], start: string, end: string, user: string) {

    const dist: { [key: string]: number } = {
        [start]: 0
    };
    const prev: { [key: string]: string | undefined } = {};

    const queue = new PriorityQueue();
    queue.push(start, 0);

    while (!queue.empty()) {
        const n = queue.extractMin();
        if (n.value === end) break;

        const node = graph.find(value => value.objectId === n.value);
        if (!node) throw new Error("Failed to find node");

        for (const v of node.connectsTo) {
            const nodev = graph.find(value => value.objectId === v);
            if (!nodev) throw new Error("Failed to find node");

            const alt = dist[node.objectId] + nodev.getWeight(user);

            if (alt < (dist[v] ?? Number.MAX_SAFE_INTEGER)) {
                dist[v] = alt;
                prev[v] = n.value;
                queue.push(v, alt);
            }
        }
    }

    const path = [];
    if (!(prev[end] || end === start)) throw new Error("Path is not reachable");

    let u: string | undefined = end;
    while (u) {

        const node = graph.find(value => value.objectId === u);
        if (!node) throw new Error("Failed to find node");
        path.push({
            id: node.objectId,
            position: node.position
        });

        u = prev[u];
    }

    path.reverse();

    return path;
}