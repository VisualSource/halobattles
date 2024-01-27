import { type ReadStream, createReadStream, stat } from "node:fs";
import type { HttpRequest, HttpResponse } from "uWebSockets.js";
import { normalize, join, parse } from 'node:path';

let openStreams = 0;

/** Helper function node.js buffer to array buffer */
function toArrayBuffer(buffer: Buffer) {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function onAbortedOrFinishedResponse(res: HttpResponse, readSteam: ReadStream) {
    if (res.id === -1) {
        console.error("ERROR! called twice for same res!");
    } else {
        console.log("Stream was closed openSteams:" + --openStreams);
        readSteam.destroy();
    }

    res.id = -1;
}

function pipeStreamOverResponse(res: HttpResponse, readStream: ReadStream, totalSize: number, header: string) {
    /* Careful! If Node.js would emit error before the first res.tryEnd, res will hang and never time out */
    /* For this demo, I skipped checking for Node.js errors, you are free to PR fixes to this example */
    //res.writeHeader("Content-Type", header);
    readStream.on('data', (chunk) => {
        /* We only take standard V8 units of data */
        const ab = toArrayBuffer(chunk as Buffer);

        /* Store where we are, globally, in our response */
        let lastOffset = res.getWriteOffset();
        res.writeHeader("Content-Type", header);
        /* Streaming a chunk returns whether that chunk was sent, and if that chunk was last */
        let [ok, done] = res.tryEnd(ab, totalSize);

        /* Did we successfully send last chunk? */
        if (done) {
            onAbortedOrFinishedResponse(res, readStream);
        } else if (!ok) {
            /* If we could not send this chunk, pause */
            readStream.pause();

            /* Save unsent chunk for when we can send it */
            res.ab = ab;
            res.abOffset = lastOffset;

            /* Register async handlers for drainage */
            res.onWritable((offset) => {
                /* Here the timeout is off, we can spend as much time before calling tryEnd we want to */

                /* On failure the timeout will start */
                let [ok, done] = res.tryEnd(res.ab.slice(offset - res.abOffset), totalSize);
                if (done) {
                    onAbortedOrFinishedResponse(res, readStream);
                } else if (ok) {
                    /* We sent a chunk and it was not the last one, so let's resume reading.
                     * Timeout is still disabled, so we can spend any amount of time waiting
                     * for more chunks to send. */
                    readStream.resume();
                }

                /* We always have to return true/false in onWritable.
                 * If you did not send anything, return true for success. */
                return ok;
            });
        }

    }).on('error', (error) => {
        onAbortedOrFinishedResponse(res, readStream);
        console.error(error);
        res.cork(() => {
            res.writeStatus("500 Internal Server Error");
            res.end();
        });
        /* Todo: handle errors of the stream, probably good to simply close the response */
        console.log('Unhandled read error from Node.js, you need to handle this!');
    });
}

const exts = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".jpg": "image/jpeg",
    ".ico": "image/vnd.microsoft.icon"
}

/**
 * Based of uWebsocket exmaple VideoSteamer
 * @file VideoStreamer.js
 * @link https://github.com/uNetworking/uWebSockets.js/blob/master/examples/VideoStreamer.js
 */
const staticFile = (res: HttpResponse, req: HttpRequest) => {
    let readStream: ReadStream;

    res.onAborted(() => {
        res.aborted = true;
        if (readStream) onAbortedOrFinishedResponse(res, readStream);
    });

    const url = new URL(req.getUrl(), "http://localhost");
    const path = join("./public/", normalize(url.pathname));

    const ext = parse(path).ext;

    stat(path, (err, stats) => {
        if (err) {
            res.cork(() => {
                res.writeStatus(err.code === "ENOENT" ? "404 Not Found" : "500 Internal Server Error");
                res.writeHeader("Content-Type", "text/plain");

                if (process.env.NODE_ENV === "development") {
                    res.end(err.message);
                } else {
                    res.end(err.code === "ENOENT" ? "File Not Found" : "Unknown server error.");
                }
            });
            return;
        }

        console.log('Stream was opened, openStreams: ' + ++openStreams);
        readStream = createReadStream(path);
        pipeStreamOverResponse(res, readStream, stats.size, exts[ext as keyof typeof exts] ?? "text/plain");
    });
}

export default staticFile;