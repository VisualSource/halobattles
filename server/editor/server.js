import { resolve, extname, basename, sep } from "node:path";
import { createServer, STATUS_CODES } from "node:http";
import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { json, streamHtml, __getDirname } from "./utils.js";

async function* getFiles(dir) {
  const dirents = await readdir(dir, {
    encoding: "utf-8",
    withFileTypes: true,
  });
  for (const dirent of dirents) {
    const res = resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      yield* getFiles(res);
    } else {
      yield res;
    }
  }
}

/**
 *
 * @param { undefined | { port?: number, origin?: string; } } config
 * @export
 */
export async function initApp(config) {
  const port = config.port ?? 3000;
  const __dirname = __getDirname(config?.origin);

  /** @type {Map<string,{ type: "page" | "api", path: string; isApi: boolean }>} */
  const routes = new Map();

  for await (const file of getFiles(resolve(__dirname, "./app"))) {
    const ext = extname(file);
    const name = basename(file, ext);

    const path = file.split("app")[1].split(sep);

    const isApi = path[1] === "api";

    /**
     * @type {string}
     */
    let url = path.join("/").replace(ext, "");
    if (name === "index") {
      url = url.replace("index", "");
    }

    if (url.endsWith("/")) {
      url = url.replace(/\/$/, "");
    }

    routes.set(url, { type: isApi ? "api" : "page", url, isApi, path: file });
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    if (!routes.has(url.pathname)) {
      json({ message: STATUS_CODES[400] }, res, 400);
      return;
    }

    req.systemUrl = url;

    const route = routes.get(url.pathname);

    console.log(req.method, url.pathname);

    switch (route.type) {
      case "api": {
        const api = await import(pathToFileURL(route.path));

        if (!api[req.method]) {
          json({ message: STATUS_CODES[405] }, res, 405);
        } else {
          await api[req.method](req, res);
        }
        break;
      }
      case "page": {
        streamHtml(route.path, res);
        break;
      }
      default:
        json({ message: STATUS_CODES[404] }, res, 404);
        break;
    }
  });

  server.listen(port, () => {
    console.log("Ready at.");
    console.log(`http://localhost:${port}`);
  });
}
