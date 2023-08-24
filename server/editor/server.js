import { resolve, extname, basename, sep } from "node:path";
import { createServer, STATUS_CODES } from "node:http";
import { StringDecoder } from "node:string_decoder";
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { __getDirname } from "./utils.js";

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
 * @param { undefined | { port?: number, root?: string; } } config
 * @export
 */
export async function initApp(config) {
  const port = config.port ?? 3000;
  const __dirname = __getDirname(config?.root);

  const buildingFile = resolve(__dirname, "../src/data/buildings.json");
  const planetsFile = resolve(__dirname, "../src/data/planets.json");
  const unitsFile = resolve(__dirname, "../src/data/units.json");
  const mapsFolder = resolve(__dirname, "../meta/maps");

  /** @type {Map<string,{ type: "page" | "api" | "file", path: string; isApi: boolean }>} */
  const routes = new Map();

  for await (const file of getFiles(resolve(__dirname, "./app"))) {
    const ext = extname(file);
    const name = basename(file, ext);

    const path = file.split("app")[1].split(sep);

    const isFile = path[1] === "public";
    const isApi = path[1] === "api";

    /**
     * @type {string}
     */
    let url = path.join("/").replace(ext, "");
    if (name === "index") {
      url = url.replace("index", "");
    }

    if (isFile) {
      routes.set(`${url}${ext}`, {
        type: "file",
        url: `${url}${ext}`,
        isApi,
        path: file,
      });
      continue;
    }

    if (url.endsWith("/") && url !== "/") {
      url = url.replace(/\/$/, "");
    }

    routes.set(url, {
      type: isApi ? "api" : isFile ? "file" : "page",
      url,
      isApi,
      path: file,
    });
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    req.parsedURL = url;

    req.app = {
      root: __dirname,
      mapsFolder,
      buildingFile,
      planetsFile,
      unitsFile,
    };

    req.body = async function () {
      return new Promise((ok, rej) => {
        try {
          let body = "";
          req.on("readable", () => {
            let chunk;
            while (null !== (chunk = req.read())) {
              body += chunk;
            }
          });

          req.on("end", () => {
            ok(body);
          });
        } catch (error) {
          rej(error);
        }
      });
    };

    req.form = async function () {
      const data = await req.body();

      if (req.headers["content-type"] === "application/x-www-form-urlencoded") {
        return new URLSearchParams(data);
      }

      throw new Error(`Unable to process: ${req.headers["content-type"]}`);
    };

    res.html = function (data, status = 200) {
      res.writeHead(status, { "Content-Type": "text/html" });
      res.end(data);
    };

    res.json = function (data, status = 200) {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    res.sendFile = function (file, status = 200) {
      const type = extname(file);
      res.writeHead(status, {
        "Content-Type": `text/${type.replace(".", "")}`,
      });
      const stream = createReadStream(file, {
        encoding: "utf-8",
      });
      stream.pipe(res);
    };

    res.redirect = function (path, status = 302) {
      res.writeHead(status, { Location: path });
      res.end();
    };

    console.time(`${req.method} ${url.pathname}`);

    if (!routes.has(url.pathname)) {
      res.json(
        {
          message: STATUS_CODES[400],
          details: [
            {
              message: "No page or api exists.",
              meta: Array.from(routes.keys()),
            },
          ],
        },
        400
      );
      console.timeEnd(`${req.method} ${url.pathname}`);
      return;
    }

    const route = routes.get(url.pathname);

    try {
      switch (route.type) {
        case "file": {
          res.sendFile(route.path);
          break;
        }
        case "api": {
          const api = await import(pathToFileURL(route.path));

          if (!api[req.method]) {
            res.json({ message: STATUS_CODES[405] }, 405);
          } else {
            await api[req.method](req, res);
          }
          break;
        }
        case "page": {
          res.sendFile(route.path);
          break;
        }
        default:
          res.json({ message: STATUS_CODES[404] }, 404);
          break;
      }
    } catch (error) {
      console.error(error);
      res.json(
        {
          message: STATUS_CODES[500],
          details: error?.message ?? "Unkown server error",
        },
        500
      );
    }
    console.timeEnd(`${req.method} ${url.pathname}`);
  });

  server.listen(port, () => {
    console.log("Ready at.");
    console.log(`http://localhost:${port}`);
  });
}
