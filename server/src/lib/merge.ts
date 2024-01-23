/**
 * Merge GroupB into groupA
 * @param groupA 
 * @param groupB 
 * @returns 
 */
export default function merge<T extends { id: string; count: number }>(groupA: T[], groupB: T[]): Array<T> {

    for (const item of groupB) {
        const idx = groupA.findIndex(i => i.id === item.id);
        if (idx === -1) {
            groupA.push(item);
            continue;
        }

        if (!groupA[idx]) throw new Error("Failed to merge arrays");

        groupA[idx]!.count += item.count;
    }

    return groupA;
}