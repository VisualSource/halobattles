
export type QueueItem = { time: number, queueId: string, nodeId: string; objData: { inst?: string; duration: number, name: string; icon: string; id: number; }; type: "unit" | "building" | "tech" };

class Queue {
    public list: QueueItem[] = [];
    public add(item: QueueItem) {
        if (this.list.length >= 10) throw new Error("Max Queue length");
        this.list = [...this.list, item];
    }
    public getFirst(): QueueItem | undefined {
        const item = this.list.shift();
        this.list = [...this.list];
        return item;
    }
    public remove(idx: number) {
        const item = this.list.splice(idx, 1);
        this.list = [...this.list];
        return item;
    }
    public empty(): boolean {
        return this.list.length === 0;
    }
    public swap(a: number, b: number): void {
        const temp = this.list[a];
        this.list[a] = this.list[b];
        this.list[b] = temp;
        this.list = [...this.list];
    }
}

class QueueEngine extends EventTarget {
    static INSTANCE: QueueEngine | null = null;
    static init() {
        if (!QueueEngine.INSTANCE) {
            QueueEngine.INSTANCE = new QueueEngine();
        }
    }
    static get() {
        if (!QueueEngine.INSTANCE) throw new Error("Queue Engine has not been created.");
        return QueueEngine.INSTANCE;
    }
    static enqueue(item: QueueItem) {
        QueueEngine.get().addItem(item);
    }
    static removeCurrent(nodeId: string, queueId: string): void {
        QueueEngine.get().removeCurrent(nodeId, queueId);
    }
    static deqeueue(nodeId: string, queueId: string, idx: number): void {
        QueueEngine.get().removeItem(nodeId, queueId, idx);
    }
    static swap(nodeId: string, queueId: string, idxA: number, idxB: number): void {
        QueueEngine.get().swap(nodeId, queueId, idxA, idxB);
    }
    private event = new CustomEvent("queue-update");
    private queue: Map<string, Queue> = new Map();
    private current: QueueItem[] = [];
    private intervalId: NodeJS.Timer;
    constructor() {
        super();
        this.intervalId = setInterval(this.tick, 1000);
    }
    public destory() {
        clearInterval(this.intervalId);
    }
    private tick = () => {
        const oldItems = this.current.filter(value => value.time <= 0);
        this.current = this.current.filter(value => value.time > 0);

        this.current = this.current.map((value => ({
            ...value,
            time: value.time - 1
        })));

        for (const item of oldItems) {
            this.dispatchEvent(new CustomEvent("item-done", { detail: item }));
            // network thing maybe.

            if (this.queue.has(`${item.nodeId}-${item.queueId}`)) {
                const next = this.queue.get(`${item.nodeId}-${item.queueId}`)?.getFirst();
                if (next) {
                    this.current = [...this.current, next];
                }
            }
        }

        this.dispatchEvent(this.event);
    }
    public getActiveItem(nodeId: string, queueId: string): QueueItem | undefined {
        return this.current.find(value => value.nodeId === nodeId && value.queueId === queueId);

    }
    public getQueue(nodeId: string, queueId: string) {
        const queue = this.queue.get(`${nodeId}-${queueId}`);
        if (!queue) return;
        return queue.list;
    }
    public addItem(item: QueueItem): void {
        const id = `${item.nodeId}-${item.queueId}`;

        if (!this.queue.has(id)) {
            this.queue.set(id, new Queue());
        }
        const queue = this.queue.get(id);
        if (!queue) throw new Error("Failed to add item to queue");

        const idx = this.current.findIndex(value => value.nodeId === item.nodeId && value.queueId === item.queueId);

        idx === -1 ? this.current = [...this.current, item] : queue.add(item);

        this.dispatchEvent(this.event);
    }
    public removeItem(nodeId: string, queueId: string, idx: number): void {
        const id = `${nodeId}-${queueId}`;
        const queue = this.queue.get(id);
        if (!queue) throw new Error("Failed to add item to queue");
        const item = queue.remove(idx);
        this.dispatchEvent(this.event);
        this.dispatchEvent(new CustomEvent("drop-item", { detail: item[0] }));
    }
    public removeCurrent(nodeId: string, queueId: string): void {
        const idx = this.current.findIndex(value => value.nodeId === nodeId && value.queueId === queueId);
        if (idx === -1) return;
        const item = this.current.splice(idx, 1);
        this.current = [...this.current];
        this.dispatchEvent(this.event);
        this.dispatchEvent(new CustomEvent("drop-item", { detail: item[0] }));
    }
    public swap(nodeId: string, queueId: string, idxA: number, idxB: number): void {
        const id = `${nodeId}-${queueId}`;
        const queue = this.queue.get(id);
        if (!queue) throw new Error("Failed to add item to queue");
        queue.swap(idxA, idxB);
        this.dispatchEvent(this.event);
    }
}

export default QueueEngine;