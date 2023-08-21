/**
 * @export
 * @param {import("../../../utils").EditorRequest} req
 * @param {import("../../../utils").EditorResponse} res
 */
export async function GET(req, res) {
  const type = req.parsedURL.searchParams.get("event-type");

  switch (type) {
    case "spawn": {
      return res.html(`
                <div class="mb-2 flex flex-col">
                    <label class="mb-2 font-bold tracking-tighter">Amount</label>
                    <input required class="text-black" name="amount" form="events" type="number" min="1" value="1" />
                </div>
                <div class="mb-2 flex flex-col">
                    <label class="mb-2 font-bold tracking-tighter">Unit</label>
                    <select hx-get="/api/unit/list" hx-trigger="load" required class="text-black p-1" form="events" name="unit" data-type="number">
                        <option disabled>Loading</option>
                    </select>
                </div>
            `);
    }
    case "exploded":
      return res.html(`
            <div class="mb-2 flex flex-col">
                <label class="mb-2 font-bold tracking-tighter">Damage</label>
                <input required class="text-black" name="damage" form="events" type="number" min="1" value="1"/>
            </div class="mb-2 flex flex-col">
            <div class="mb-2 flex flex-col">
                <label class="mb-2 font-bold tracking-tighter">Range</label>
                <input required class="text-black" name="range" form="events" type="number" min="1" value="1"/>
            </div>
        `);
    case "servive": {
      return res.html(`
        <div class="mb-2 flex flex-col">
            <label class="mb-2 font-bold tracking-tighter">Chance to servive</label>
            <input required class="text-black" name="chance" form="events" type="number" min="1" value="1" max="100"/>
        </div>
    `);
    }
    case "siphon":
      return res.html(`
        <div class="mb-2 flex flex-col">
            <label class="mb-2 font-bold tracking-tighter">Health Restored</label>
            <input required class="text-black" name="value" form="events" type="number" min="1" value="1" max="100"/>
        </div>
    `);
    case "burn":
    case "freeze":
      return res.html(`
        <div class="mb-2 flex flex-col">
            <label class="mb-2 font-bold tracking-tighter">Damage</label>
            <input required form="events" name="damage" class="text-black" type="number" min="1" value="1"/>
        </div>
        <div class="mb-2 flex flex-col">
            <label class="mb-2 font-bold tracking-tighter">How long this effect lasts</label>
            <input required class="text-black" name="exp" form="events" type="number" step="1" min="1" value="1"/>
        </div>
    `);
    default:
      return res.html("<span>Unknown Option</span>", 400);
  }
}
