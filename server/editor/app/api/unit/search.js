import { readFile, writeFile } from "node:fs/promises";
/**
 * @export
 * @param {import("../../../utils").EditorRequest} req
 * @param {import("../../../utils").EditorResponse} res
 */
export async function POST(req, res) {
  const body = await req.form();

  /** @type {string} */
  const term = body.get("search");
  const by = body.get("search-by");

  /** @type {[number,import("../../../../src/map/units").Unit][]} */
  const units = JSON.parse(
    await readFile(req.app.unitsFile, { encoding: "utf-8" })
  );

  const html = units
    .filter((value) => {
      switch (by) {
        case "name":
          return value[1].name.toLowerCase().includes(term.toLowerCase());
        case "faction":
          return false;
        default:
          return false;
      }
    })
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
