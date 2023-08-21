import { readFile } from "node:fs/promises";

/**
 * @export
 * @param {import("../../../utils").EditorRequest} req
 * @param {import("../../../utils").EditorResponse} res
 */
export async function GET(req, res) {
  /** @type {[number,import("../../../../src/map/units").Unit][]} */
  const units = JSON.parse(
    await readFile(req.app.unitsFile, { encoding: "utf-8" })
  );

  const html = units
    .map((value) => `<option value="${value[0]}">${value[1].name}</option>`)
    .join("");

  return res.html(html);
}
