/**
 * @export
 * @param {import("../../../utils").EditorRequest} req
 * @param {import("../../../utils").EditorResponse} res
 */
export async function GET(req, res) {
  const param = req.parsedURL.searchParams.get("type");

  switch (param) {
    case "building":
      return res.html(`
      <select
      form="building"
      class="hidden"
      id="battle.type"
      required
      name="battle.type"
      value="Building"
    >
      <option value="building" selected>Building</option>
    </select>

    <div class="mb-2 flex flex-col">
      <label
        class="mb-2 font-bold tracking-tighter"
        for="battle.damageType"
        >Damage Type</label
      >
      <select
        form="building"
        class="text-black p-1"
        id="battle.damageType"
        required
        name="battle.damageType"
        value="kinetic"
      >
        <option value="kinetic" selected>Kinetic</option>
        <option value="plasma">Plasma</option>
        <option value="hardlight">Hardlight</option>
        <option value="burn">Burn</option>
        <option value="freeze">Freeze</option>
      </select>
    </div>
    <h6 class="font-semibold text-xl mb-4 border-b-2">Effective</h6>
    <div class="ml-4 flex flex-col mb-2">
      <label
        class="mb-2 font-bold tracking-tighter"
        for="battle.effective.air"
        >Air</label
      >
      <select
        form="building"
        class="text-black p-1"
        id="battle.effective.air"
        name="battle.effective.air"
        required
      >
        <option value="weak">Weak</option>
        <option value="normal" selected>Normal</option>
        <option value="strong">Strong</option>
      </select>
    </div>
    <div class="ml-4 flex flex-col mb-2">
      <label
        class="mb-2 font-bold tracking-tighter"
        for="battle.effective.infantry"
        >Infantry</label
      >
      <select
        form="building"
        class="text-black p-1"
        id="battle.effective.infantry"
        name="battle.effective.infantry"
        required
      >
        <option value="weak">Weak</option>
        <option value="normal" selected>Normal</option>
        <option value="strong">Strong</option>
      </select>
    </div>
    <div class="ml-4 flex flex-col mb-2">
      <label
        class="mb-2 font-bold tracking-tighter"
        for="battle.effective.vehicle"
        >Vehicle</label
      >
      <select
        form="building"
        class="text-black p-1"
        id="battle.effective.vehicle"
        required
        name="battle.effective.vehicle"
      >
        <option value="weak">Weak</option>
        <option selected value="normal">Normal</option>
        <option value="strong">Strong</option>
      </select>
    </div>
    <div class="ml-4 flex flex-col mb-2">
      <label
        class="mb-2 font-bold tracking-tighter"
        for="battle.effective.building"
        >Building</label
      >
      <select
        form="building"
        class="text-black p-1"
        id="battle.effective.building"
        required
        name="battle.effective.building"
      >
        <option value="weak">Weak</option>
        <option selected value="normal">Normal</option>
        <option value="strong">Strong</option>
      </select>
    </div>
    <div class="mb-2 flex flex-col">
      <label class="mb-2 font-bold tracking-tighter" for="battle.attack"
        >Building Attack</label
      >
      <input
        form="building"
        class="text-black"
        required
        type="number"
        name="battle.attack"
        id="attack"
        value="0"
        min="0"
      />
    </div>
    <div class="mb-2 flex flex-col">
      <label class="mb-2 font-bold tracking-tighter" for="battle.health"
        >Building Health</label
      >
      <input
        form="building"
        class="text-black"
        required
        type="number"
        name="battle.health"
        id="battle.health"
        value="100"
        min="0"
      />
    </div>
    <div class="mb-2 flex flex-col">
      <label
        class="mb-2 font-bold tracking-tighter"
        for="battle.shealds"
        >Building Shealds</label
      >
      <input
        form="building"
        class="text-black"
        required
        type="number"
        name="battle.shealds"
        id="battle.shealds"
        value="0"
        min="0"
      />
    </div>
    <div class="mb-2 flex flex-col">
      <label
        class="mb-2 font-bold tracking-tighter"
        for="battle.hitChange"
        >Building Hit Chance</label
      >
      <input
        form="building"
        class="text-black"
        required
        type="number"
        name="battle.hitChange"
        id="battle.hitChange"
        min="0"
        value="50"
        max="100"
      />
    </div>
      `);
    default:
      return res.html(`<div class="mb-2"></div>`);
  }
}
