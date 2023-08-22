/**
 * @export
 * @param {import("../../../utils").EditorRequest} req
 * @param {import("../../../utils").EditorResponse} res
 */
export async function GET(req, res) {
  const type = req.parsedURL.searchParams.get("levels.values.stat.type");
  const build = req.parsedURL.searchParams.get("levels.build");

  if (build) {
    switch (build) {
      case "yes":
        return res.html(`
        <div class="mb-2 flex flex-col">
        <label for="name" class="mb-2 font-bold tracking-tighter"
          >Cost</label
        >
        <input
          form="levels"
          class="text-black"
          required
          name="levels.build.cost"
          type="number"
          placeholder="0"
          min="0"
        />
      </div>
      <div class="mb-2 flex flex-col">
        <label for="name" class="mb-2 font-bold tracking-tighter"
          >Time</label
        >
        <input
          form="levels"
          class="text-black"
          required
          name="levels.build.time"
          type="number"
          min="1"
          placeholder="0"
        />
      </div>
        `);
      default:
        return res.html(`<div class="mb-2"></div>`);
    }
  }

  if (!type) return res.end();

  switch (type) {
    case "event":
      return res.html(`
      <label class="flex flex-col">
        <span class="mb-2">Color</span>
        <select
            name="levels.values.stat.color"
            form="levels.stat.values"
            class="text-black p-1"
            required
        >
            <option value="green" selected>Green</option>
            <option value="red" selected>Red</option>
        </select>
        </label>

        <div class="mb-2 flex flex-col">
        <label for="levels.values.stat.text" class="mb-2 font-bold tracking-tighter"
            >Label</label
        >
        <input
            form="levels.stat.values"
            class="text-black"
            required
            name="levels.values.stat.text"
            type="text"
            placeholder="Short description of item"
        />
        </div>
        <input
                form="levels.stat.values"
                class="hidden"
                value="0"
                defaultValue="0"
                name="levels.values.stat.value"
                type="number"
                placeholder="0"
        />
        <div class="mb-2 flex flex-col">
        <label for="levels.values.stat.event" class="mb-2 font-bold tracking-tighter"
            >Event</label
        >
        <input
            form="levels.stat.values"
            class="text-black"
            required
            name="levels.values.stat.event"
            type="text"
            placeholder="event name"
        />
        </div>
        <label class="flex flex-col">
        <span class="mb-2">Trigger</span>
        <select
            name="levels.values.stat.run"
            form="levels.stat.values"
            class="text-black p-1"
            required
        >
            <option value="create" selected>Create</option>
            <option value="destory">Destory</option>
        </select>
        </label>
      `);
    default:
      return res.html(`
            <label class="flex flex-col">
                <span class="mb-2">Color</span>
                <select
                  name="levels.values.stat.color"
                  form="levels.stat.values"
                  class="text-black p-1"
                  required
                >
                  <option value="green" selected>Green</option>
                  <option value="red" selected>Red</option>
                </select>
              </label>

              <div class="mb-2 flex flex-col">
                <label for="name" class="mb-2 font-bold tracking-tighter"
                  >Label</label
                >
                <input
                  form="levels.stat.values"
                  class="text-black"
                  required
                  name="levels.values.stat.text"
                  type="text"
                  placeholder="Short description of item"
                />
              </div>

              <div class="mb-2 flex flex-col">
                <label for="name" class="mb-2 font-bold tracking-tighter"
                  >Stat Value</label
                >
                <input
                  form="levels.stat.values"
                  class="text-black"
                  required
                  name="levels.values.stat.value"
                  type="number"
                  placeholder="0"
                />
              </div>
            `);
  }
}
