import { readFile, writeFile } from "node:fs/promises";
import groupBy from "lodash.groupby";
import { z } from "zod";
import { assign } from "../../../utils.js";
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

  const id = req.parsedURL.searchParams.get("id");

  if (id) {
    const idInt = parseInt(id);
    const value = units.find((value) => value[0] === idInt);
    return res.json(value[1]);
  }

  const html = units
    .map(
      ([idx, unit]) =>
        `
    <tr class="divide-x" id="${idx}" hx-vals='{ "id": ${idx} }'>
            <td class="text-xs text-center text-gray-500 h-full">${idx}</td>
            <td class="p-1 h-full">
              <div class="flex items-center justify-center">
                <img
                  class="h-12 w-12"
                  src="${unit.icon}"
                  alt="${unit.name}"
                />
              </div>
            </td>
            <td class="text-xs text-center p-1">${unit.name}</td>
            <td class="text-xs text-center p-1">${unit.cost.toLocaleString()}</td>
            <td
              class="text-ellipsis text-center whitespace-nowrap max-h-16 h-6 p-1 text-sm max-w-[120px] w-6 overflow-hidden"
            >
              ${unit.description}
            </td>
            <td class="text-xs text-center p-1">${unit.time.toLocaleString()}</td>
            <td class="text-xs text-center p-1">${unit.globalMax}</td>
            <td class="text-xs text-center p-1">${unit.capSize}</td>
            <td class="text-xs text-center p-1">
              <ul>
                ${unit.requires
                  .map(
                    (item) =>
                      `<li>Item: <a href="/building?sreach=${item.id}&searchby=id">${item.id}</a> Type: ${item.type}</li>`
                  )
                  .join("")}
              </ul>
            </td>
            <td class="text-xs text-center p-1 text-red-600">${
              unit.stats.isScout
            }</td>
            <td class="text-xs text-left p-1">
              <div>Air: <span class="text-yellow-300">${
                unit.stats.effective.air
              }</span></div>
              <div>Infantry: <span class="text-yellow-300">${
                unit.stats.effective.infantry
              }</span></div>
              <div>Vehicle: <span class="text-yellow-300">${
                unit.stats.effective.vehicle
              }</span></div>
              <div>Building: <span class="text-yellow-300">${
                unit.stats.effective.building
              }</span></div>
            </td>
            <td class="text-xs text-center p-1">${unit.stats.attack}</td>
            <td class="text-xs text-center p-1">${unit.stats.type}</td>
            <td class="text-xs text-center p-1">${unit.stats.damageType}</td>
            <td class="text-xs text-center p-1">${unit.stats.health}</td>
            <td class="text-xs text-center p-1">${unit.stats.shealds}</td>
            <td class="text-xs text-center p-1">${unit.stats.hitChange}</td>
            <td class="text-xs text-center p-1">
              <ul>
                ${
                  unit.stats.events?.onHit
                    ? unit.stats.events.onHit
                        .map(
                          (item) => `
                  <li>
                    <div>onHit: ${item.type}:</div>
                    <div>${JSON.stringify(item)}</div>
                  </li>
                `
                        )
                        .join("")
                    : ""
                }
                ${
                  unit.stats.events?.onDeath
                    ? unit.stats.events.onDeath
                        .map(
                          (item) => `
                <li>
                  <div>onDeath: ${item.type}:</div>
                  <div>${JSON.stringify(item)}</div>
                </li>
              `
                        )
                        .join("")
                    : ""
                }
              </ul>
            </td>
            <td class="text-center p-1">
              <a href="/unit/edit?id=${idx}"
                class="bg-blue-700 hover:bg-blue-600 px-2 py-0.5 rounded-md"
              >
                Edit
              </a>
            </td>
            <td class="text-center p-1">
              <button hx-delete="/api/unit"
                class="bg-red-700 hover:bg-red-600 px-2 py-0.5 rounded-md"
              >
                Delete
              </button>
            </td>
          </tr>
  `
    )
    .join("");

  return res.html(html);
}

const unitSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().transform((value) => value.trim()),
  icon: z
    .string()
    .url()
    .transform((value) => value.trim()),
  requires: z
    .string()
    .transform((value, ctx) => {
      try {
        return JSON.parse(value);
      } catch (error) {
        ctx.addIssue({ message: error.message });
        return z.NEVER;
      }
    })
    .pipe(
      z.array(z.object({ id: z.number(), type: z.enum(["local", "global"]) }))
    ),

  "stats.events": z
    .string()
    .transform((value) => {
      try {
        const values = JSON.parse(value);
        if (values.length === 0) return null;
        return groupBy(values, "trigger");
      } catch (error) {
        ctx.addIssue({ message: error.message });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .object({
          onHit: z.array(
            z.object({ name: z.string(), params: z.object().passthrough() })
          ),
          onDeath: z.array(
            z.object({ name: z.string(), params: z.object().passthrough() })
          ),
        })
        .or(z.null())
    ),
  description: z.string(),
  cost: z.coerce.number().min(0),
  time: z.coerce.number().min(0),
  capSize: z.coerce.number().min(0),
  globalMax: z.coerce.number().min(-1),
  "stats.isScout": z
    .enum(["on", "off"])
    .transform((value) => value === "on")
    .default("off"),
  "stats.attack": z.coerce.number().min(0),
  "stats.health": z.coerce.number().min(0),
  "stats.shealds": z.coerce.number().min(),
  "stats.hitChange": z.coerce.number().min(0).max(100),
  "stats.effective.air": z.enum(["normal", "strong", "weak", "ineffective"]),
  "stats.effective.infantry": z.enum([
    "normal",
    "strong",
    "weak",
    "ineffective",
  ]),
  "stats.effective.vehicle": z.enum([
    "normal",
    "strong",
    "weak",
    "ineffective",
  ]),
  "stats.effective.building": z.enum([
    "normal",
    "strong",
    "weak",
    "ineffective",
  ]),
  "stats.type": z.enum(["infantry", "air", "vehicle", "building"]),
  "stats.damageType": z.enum([
    "plasma",
    "kinetic",
    "hardlight",
    "burn",
    "freeze",
  ]),
});

/**
 * @export
 * @param {import("../../../utils.js").EditorRequest} req
 * @param {import("../../../utils.js").EditorResponse} res
 */
export async function POST(req, res) {
  /** @type {URLSearchParams} */
  const data = await req.form();

  console.log(data);

  /** @type {[number,import("../../../../src/map/units").Unit][]} */
  const units = JSON.parse(
    await readFile(req.app.unitsFile, { encoding: "utf-8" })
  );

  const params = unitSchema.safeParse(Object.fromEntries(data.entries()));

  if (params.error) {
    console.error(params.error);
    return res.redirect(
      `/unit/create?error=${params.error.errors.at(0).message}`
    );
  }

  const content = Object.entries(params.data).reduce(
    (pre, [key, value]) => {
      assign(pre, key, value);
      return pre;
    },
    { type: "unit" }
  );

  units.push([units.length, { ...content, id: units.length }]);

  await writeFile(req.app.unitsFile, JSON.stringify(units));

  res.redirect("/unit");
}

/**
 * @export
 * @param {import("../../../utils").EditorRequest} req
 * @param {import("../../../utils").EditorResponse} res
 */
export async function DELETE(req, res) {
  const data = await req.body();

  const url = new URLSearchParams(data);

  const id = url.get("id");

  if (!id) throw new Error("Invaild id");

  const idx = parseInt(id);

  /** @type {[number,import("../../../../src/map/units").Unit][]} */
  const units = JSON.parse(
    await readFile(req.app.unitsFile, { encoding: "utf-8" })
  );

  const items = units
    .filter((value) => value[0] !== idx)
    .map((value, i) => {
      value[1].id = i;
      return [i, value[1]];
    });

  await writeFile(req.app.unitsFile, JSON.stringify(items));
  res.end();
}

/**
 * @export
 * @param {import("../../../utils").EditorRequest} req
 * @param {import("../../../utils").EditorResponse} res
 */
export async function PUT(req, res) {
  const body = await req.form();

  console.log(body);

  /** @type {[number,import("../../../../src/map/units").Unit][]} */
  const units = JSON.parse(
    await readFile(req.app.unitsFile, { encoding: "utf-8" })
  );

  const params = unitSchema.safeParse(Object.fromEntries(body.entries()));

  if (params.error) {
    console.error(params.error);
    res.writeHead(400);
    return res.end(params.error.errors[0]?.message ?? "Unknown error");
  }

  const content = Object.entries(params.data).reduce(
    (pre, [key, value]) => {
      assign(pre, key, value);
      return pre;
    },
    { type: "unit" }
  );

  console.log(content, params.data);

  const idx = units.findIndex((value) => value[0] === content.id);

  if (idx === -1) {
    console.error("Failed to update content");
    res.writeHead(404);
    return res.end("Failed to find unit to update");
  }

  units[idx][1] = content;

  await writeFile(req.app.unitsFile, JSON.stringify(units));

  res.end();
}
