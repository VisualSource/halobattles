import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

export const __getFilename = (importMeta) =>
  fileURLToPath(importMeta ?? import.meta.url);
export const __getDirname = (importMeta) => dirname(__getFilename(importMeta));

/**
 * @param {unknown} data
 * @param {import("node:http").ServerResponse<import("node:http").IncomingMessage>} res
 */
export const json = (data, res, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

/**
 * @param {string} data
 * @param {import("node:http").ServerResponse<import("node:http").IncomingMessage>} res
 */
export const html = (data, res, status = 200) => {
  res.writeHead(status, { "Content-Type": "text/html" });
  res.end(data);
};

/**
 * @param {string} data
 * @param {import("node:http").ServerResponse<import("node:http").IncomingMessage>} res
 */
export const streamHtml = (file, res, status = 200) => {
  res.writeHead(status, { "Content-Type": "text/html" });
  const stream = createReadStream(file, {
    autoClose: true,
    encoding: "utf-8",
  });
  stream.pipe(res);
};
