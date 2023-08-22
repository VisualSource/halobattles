import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import { assign } from "../../../utils.js";

/**
 *
 *
 * @param {import("../../../../src/map/upgradeList").Item["levels"][0][]} levels
 * @return {string}
 */
const tableLevels = (levels) => {
  return /*html*/ `
    <table class="w-full">
      <thead>
        <tr class="divide-x">
          <th>Cost</th>
          <th>Time</th>
          <th>Stats</th>
        </tr>
    </thead>
    <tbody>
      ${levels
        .map(
          (value) => /*html*/ `
        <tr class="divide-x">
          <td class="text-center">${value.build?.cost ?? "Not Buildable"}</td>
          <td class="text-center">${value.build?.time ?? "Not Buildable"}</td>
          <td>
            ${tableLevelStats(value.values)}
          </td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>
  `;
};

/**
 * @param {import("../../../../src/map/upgradeList").BuildingStat[]} values
 * @return {*}
 */
const tableLevelStats = (values) => {
  return /*html*/ `
  <table class="w-full">
    <thead>
      <tr class="divide-x">
        <th>Stat</th>
        <th>value</th>
        <th>color</th>
        <th>text</th>
        <th>event</th>
        <th>Trigger</th>
      </tr>
    </thead>
    <tbody>
      ${values
        .map(
          (value) => /*html*/ `
          <tr>
            <td>${value.stat}</td>
            <td>${value.text}</td>
            <td>${value.value}</td>
            <td>${value.color}</td>
            <td>${value?.run ?? "No Run"}</td>
            <td>${value?.event ?? "No Event"}</td>
          </tr>
      `
        )
        .join("")}
    </tbody>
  </table>
  `;
};
/**
 * @param {import("../../../../src/map/upgradeList").BuildingData["battle"]} battle
 * @return {string}
 */
const tableBattle = (battle) => {
  return /* html */ `
    <table class="w-full">
      <thead>
        <tr class="divide-x">
          <th>Type</th>
          <th>Health</th>
          <th>Shealds</th>
          <th>Attack</th>
          <th>Hit Chance</th>
          <th>Damage Type</th>
          <th>Effective</th>
        </tr>
      </thead>
      <tbody>
       ${
         battle
           ? /*html*/ `
          <tr>
            <td class="text-center">${battle.type}</td>
            <td class="text-center">${battle.health}</td>
            <td class="text-center">${battle.shealds}</td>
            <td class="text-center">${battle.attack}</td>
            <td class="text-center">${battle.hitChange}</td>
            <td class="text-center">${battle.damageType}</td>
            <td class="text-center">
              <div>Air: ${battle.effective.air}</div>
              <div>Building: ${battle.effective.building}</div>
              <div>Infantry: ${battle.effective.infantry}</div>
              <div>Vehicle: ${battle.effective.vehicle}</div>
            </td>
        </tr>
       `
           : ""
       }
      </tbody>
    </table>
  `;
};

/**
 * @export
 * @param {import("../../../utils").EditorRequest} req
 * @param {import("../../../utils").EditorResponse} res
 */
export async function GET(req, res) {
  /** @type {[number,import("../../../../src/map/upgradeList").Item][]} */
  const items = JSON.parse(
    await readFile(req.app.buildingFile, { encoding: "utf-8" })
  );

  const html = items
    .map(
      ([idx, value]) => /*html*/ `
    <tr class="divide-x">
      <td class="text-center">${value.id}</td>
      <td class="text-center">${value.type}</td>
      <td class="text-center">${value.name}</td>
      <td class="text-center">
        <div class="flex items-center justify-center">
          <img class="h-10 w-10" src="${value.icon}" alt="${value.name}" />
        </div>
      </td>
      <td class="text-center">${value.description}</td>
      <td class="text-center">${value.max.global}</td>
      <td class="text-center">${value.max.node}</td>
      <td class="text-center">${value.maxLevel}</td>
      <td>
        <table class="w-full">
          <thead>
            <tr class="divide-x">
              <th>Type</th>
              <th>Id</th>
            </tr>
          </thead>
          <tbody>
            ${value.requires
              .map(
                (value) => /*html*/ `
              <tr class="divide-x">
                <td class="text-center">${value.type}</td>
                <td class="text-center">${value.id}</td>
              </tr>
            `
              )
              .join("")}    
          </tbody>
        </table>
      </td>
      <td>
        ${tableLevels(Object.values(value.levels))}
      </td>
      <td>
        ${tableBattle(value.battle)}
      </td>
      <td>
      <a href="/building/edit?id=${idx}"
      class="bg-blue-700 hover:bg-blue-600 px-2 py-0.5 rounded-md"
    >
      Edit
    </a>
      </td>
      <td>
        <button hx-on::after-request="window.location.reload()" hx-vals='{ "id": ${idx} }' hx-delete="/api/building"
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

const schema = z.object({
  name: z.string(),
  icon: z.string().url(),
  description: z.string(),
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
      z.array(z.object({ id: z.number(), type: z.enum(["global", "local"]) }))
    ),
  "max.global": z.coerce.number(),
  "max.node": z.coerce.number(),
  levels: z.string().transform((value, ctx) => {
    try {
      return JSON.parse(value);
    } catch (error) {
      ctx.addIssue({ message: error.message });
      return z.NEVER;
    }
  }),
  type: z.enum(["building", "tech", "building-no"]).transform((value) => {
    if (value === "building-no") {
      return "building";
    }
    return value;
  }),
  "battle.type": z.string().optional(),
  "battle.damageType": z.string().optional(),
  "battle.effective.air": z.string().optional(),
  "battle.effective.infantry": z.string().optional(),
  "battle.effective.vehicle": z.string().optional(),
  "battle.effective.building": z.string().optional(),
  "battle.attack": z.coerce.number().optional(),
  "battle.health": z.coerce.number().optional(),
  "battle.shealds": z.coerce.number().optional(),
  "battle.hitChange": z.coerce.number().optional(),
});

/**
 * @export
 * @param {import("../../../utils").EditorRequest} req
 * @param {import("../../../utils").EditorResponse} res
 */
export async function POST(req, res) {
  /** @type {URLSearchParams} */
  const body = await req.form();

  const result = schema.safeParse(Object.fromEntries(body.entries()));

  if (result.error) {
    console.log(result.error);
    return res.redirect(
      `/building/create?error=${result.error.errors[0].message}`
    );
  }

  /** @type {[number,import("../../../../src/map/upgradeList").Item][]} */
  const items = JSON.parse(
    await readFile(req.app.buildingFile, { encoding: "utf-8" })
  );

  const content = Object.entries(result.data).reduce((pre, [key, value]) => {
    assign(pre, key, value);
    return pre;
  }, {});

  content.id = items.length;
  content.maxLevel = Object.keys(content.levels).length;

  if (!content.battle) {
    content.battle = null;
  }

  items.push([content.id, content]);

  await writeFile(req.app.buildingFile, JSON.stringify(items));

  return res.redirect("/building");
}

/**
 * @export
 * @param {import("../../../utils").EditorRequest} req
 * @param {import("../../../utils").EditorResponse} res
 */
export async function DELETE(req, res) {
  const body = await req.body();

  const id = parseInt(new URLSearchParams(body).get("id"));

  if (!id) throw new Error("Failed to get id");

  /** @type {[number,import("../../../../src/map/upgradeList").Item][]} */
  const items = JSON.parse(
    await readFile(req.app.buildingFile, { encoding: "utf-8" })
  );

  items.splice(id, 1);

  const content = items.map((value, i) => {
    value[1].id = i;
    return [i, value[1]];
  });

  await writeFile(req.app.buildingFile, JSON.stringify(content));

  res.end();
}
