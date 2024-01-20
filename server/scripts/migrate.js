import sqlite3 from "sqlite3";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const db = new sqlite3.Database(resolve(__dirname, "../db/units.db"));

function run(sql) {
  return new Promise((rsol, rej) => {
    db.exec(sql, (err) => {
      if (err) return rej(err);
      rsol();
    });
  });
}

async function read(file) {
  return readFile(resolve(__dirname, "sql", file), {
    encoding: "utf-8",
  });
}

const files = ["premigration.sql", "tables.sql", "units.sql", "buildings.sql"];

for (const file of files) {
  console.log("Running sql from file '%s'", file);
  const data = await read(file);
  await run(data);
}
