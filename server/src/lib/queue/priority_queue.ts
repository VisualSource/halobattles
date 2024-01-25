export default class PriorityQueue<T> {
    private queue: { value: T, cost: number }[] = [];
    public push(value: T, cost: number) {
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