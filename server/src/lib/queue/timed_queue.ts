import { randomBytes } from "node:crypto";

type Job<TMeta extends { build_time: number; }> = {
    id: string;
    callback: (meta: TMeta) => void,
    meta: TMeta
}

export default class TimedQueue<T extends { build_time: number } = { build_time: number }>{
    private current: null | Job<T> = null;
    private handle: NodeJS.Timeout | undefined;
    private paused: boolean = false;
    private queue: Array<Job<T>> = [];

    public getItems() {
        return {
            current: this.current ? { meta: this.current?.meta, id: this.current.id } : null,
            items: this.queue.map(e => ({ meta: e.meta, id: e.id }))
        }
    }

    public isPaused(): boolean {
        return !this.paused;
    }

    public isEmpty(): boolean {
        return !this.queue.length;
    }

    public addTask(meta: T, callback: (meta: T) => void): string {
        const id = randomBytes(5).toString("hex");

        this.queue.push({
            id,
            callback,
            meta
        });

        if (!this.current && !this.paused) {
            this.next();
        }

        return id;
    }
    public removeTask(jobId: string): T {
        if (this.current && this.current.id === jobId) {
            clearTimeout(this.handle);

            const job = this.current;
            this.current = null;

            if (!this.paused) {
                this.next();
            }

            return job.meta;
        }

        const idx = this.queue.findIndex(e => e.id === jobId);
        if (idx === -1) throw new Error("Failed to find job");

        const item = this.queue.splice(idx, 1).at(0);
        if (!item) throw new Error("Failed to delete job in queue");

        return item.meta;
    }

    public puase(): void {
        this.paused = true;
        clearTimeout(this.handle);
    }
    public resume(): void {
        if (this.current) {
            this.handle = setTimeout(() => {
                this.current?.callback(this.current.meta);
                this.current = null;
                this.next();
            }, this.current.meta.build_time);
        } else {
            this.next();
        }
        this.paused = false;
    }

    public reset(): T[] {
        this.paused = true;
        clearTimeout(this.handle);

        this.handle = undefined;

        const jobs = this.queue.map(e => e.meta);
        if (this.current) {
            jobs.push(this.current.meta);
        }

        this.current = null;
        this.queue = [];
        this.paused = false;

        return jobs;
    }

    private next(): void {
        if (!this.queue.length) return;

        this.current = this.queue.shift() ?? null;

        if (!this.current) return;

        this.handle = setTimeout(() => {
            if (!this.current) throw new Error("Missing current queue item");

            this.current.callback(this.current.meta);
            this.current = null;
            this.next();
        }, this.current.meta.build_time);
    }
}