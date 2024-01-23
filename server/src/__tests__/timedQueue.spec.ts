import { describe, it } from "mocha";
import assert from 'node:assert';
import TimedQueue from '#lib/queue/timed_queue.js';

describe("TimedQueue", () => {
    describe("#isEmpty()", () => {
        it("Return true when queue is empty", function () {
            const queue = new TimedQueue();
            assert(queue.isEmpty())
        })
    });

    describe("#isPaused()", () => {
        it("Returns turn when queue is paused.", function () {
            const queue = new TimedQueue();

            assert(queue.isPaused())
        });
    });

    describe("#addTask()", () => {
        it("Add task to queue and process it", function (done) {
            this.timeout(1000);
            this.slow(300);

            const queue = new TimedQueue();

            queue.addTask({ build_time: 100 }, () => done());
        });
        it("Does not process when queue is paused", function (done) {
            this.timeout(1000);
            this.slow(300);
            const queue = new TimedQueue();

            queue.puase();

            const handle = setTimeout(() => done(), 200);

            queue.addTask({ build_time: 100 }, () => {
                clearTimeout(handle);
                done(new Error("Should not have ran."))
            });
        })
    });

    describe("#removeTask()", () => {
        it("Removes a task from queue", function (done) {
            const queue = new TimedQueue();
            queue.puase(); // stop queue from executing

            const taskId = queue.addTask({ build_time: 100 }, () => done(new Error("Should not have ran.")));

            const item = queue.removeTask(taskId);

            assert(item.build_time === 100);
            done()
        });

        it("Removes first item in queue", function (done) {
            const queue = new TimedQueue<{ build_time: number; id: number }>();
            queue.puase(); // stop queue from executing

            const taskId = queue.addTask({ build_time: 100, id: 0 }, () => done(new Error("Should not have ran.")));
            queue.addTask({ build_time: 100, id: 1 }, () => done(new Error("Should not have ran.")));


            const item = queue.removeTask(taskId);

            assert(item.id === 0);

            done();
        });

        it("Remove current item from queue", function (done) {
            this.timeout(1000);
            this.slow(200);
            const queue = new TimedQueue<{ build_time: number; id: number }>();
            const taskId = queue.addTask({ build_time: 10_000, id: 0 }, () => done(new Error("Should have been removed.")));
            queue.addTask({ build_time: 100, id: 1 }, () => done());

            const item = queue.removeTask(taskId);
            assert(item.id === 0);
        });

    });

    describe("#puase()", () => {
        it("Stops queue for procssing", function (done) {
            const queue = new TimedQueue();

            queue.puase();

            queue.addTask({ build_time: 100 }, () => done(new Error("Should not have ran.")));

            setTimeout(() => done(), 150);
        });
    });

    describe("#resume()", () => {
        it("Resumes processing of queue after pausing", function (done) {
            this.timeout(150);

            const queue = new TimedQueue();
            queue.puase();

            queue.addTask({ build_time: 100 }, () => done());

            queue.resume();
        });

        it("Restarts current item after pausing", function (done) {
            this.timeout(2000);
            this.slow(500);

            const queue = new TimedQueue<{ id: number; build_time: number; }>();
            queue.addTask({ build_time: 300, id: 0 }, () => {
                queue.reset();
                done()
            });
            queue.addTask({ build_time: 200, id: 1 }, () => done(new Error("Should not have ran.")));

            queue.puase();

            queue.resume();
        });
    });

    describe("#reset()", () => {
        it("Resets queue to empty state", function (done) {
            const queue = new TimedQueue<{ id: number; build_time: number; }>();

            queue.addTask({ build_time: 10_000, id: 0 }, () => done(new Error("Should not have ran")));
            queue.addTask({ build_time: 10_000, id: 1 }, () => done(new Error("Should not have ran")));

            const items = queue.reset();

            if (items.length !== 2 || !items[1] || items[1].id !== 0) return done(new Error("Queue item was not returned."));

            assert(queue.isEmpty(), "Queue was not empty");
            assert(queue.isPaused(), "Queue was paused");

            done();
        });
    });
});