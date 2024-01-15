import groupby from 'lodash.groupby';
import PriorityQueue from './priority_queue.js';
import type { MapData } from './game/Core.js';

export default function Dijkstra(graph: MapData, { start, end, user }: { start: string; end: string; user: string }, getWeight: (user: string, node: string, linkType: string) => number) {

    const dist: Record<string, number> = {
        [start]: 0
    };
    const prev: Record<string, string | undefined> = {};

    const queue = new PriorityQueue();
    queue.push(start, 0);

    while (!queue.empty()) {
        const n = queue.extractMin();
        if (n.value === end) break;

        const nodes = groupby(graph.linkes, e => e.nodes.includes(n.value))["true"] ?? [];

        for (const node of nodes) {
            const next_node_uuid = node.nodes.find(value => value !== n.value);
            if (!next_node_uuid) throw new Error("Failed to get next node uuid");

            const alt = (dist[next_node_uuid] ?? 0) + getWeight(user, next_node_uuid, node.type);

            if (alt < (dist[next_node_uuid] ?? Number.MAX_SAFE_INTEGER)) {
                dist[next_node_uuid] = alt;
                prev[next_node_uuid] = n.value;
                queue.push(next_node_uuid, alt);
            }
        }
    }

    const path = [];
    if (!(prev[end] || end === start)) throw new Error("Path is not reachable");

    let exec_time = 0;
    let u: string | undefined = end;
    while (u) {
        const node = graph.nodes.get(u);
        if (!node) throw new Error("Failed to get node data");

        path.push({
            uuid: node.uuid,
            position: node.position,
            duration: dist[node.uuid] ?? 0
        });

        exec_time += dist[node.uuid] ?? 0;

        u = prev[u];
    }

    path.reverse();

    return {
        path,
        exec_time
    };
}