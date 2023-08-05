import { parentPort, workerData } from "node:worker_threads";
import groupBy from "lodash.groupby";
import remove from "lodash.remove";
import Attackable from "./runtime/Attackable.js";

/** @type {{ node: import("./Location.js").default, transfer: import("./GameState.js").UnitTransfer }} */
const input = workerData;

console.log(input);

const attackers = input.transfer.units.map(
  (value) => new Attackable(value.id, value.count, "unit")
);

const defenders = [
  ...Object.values(
    groupBy(
      [
        ...input.node.units.left,
        ...input.node.units.center,
        ...input.node.units.right,
      ],
      "id"
    )
  )
    .map((value) =>
      value.reduce((pre, curr) => {
        pre.count += curr.count;
        return pre;
      })
    )
    .map((value) => new Attackable(value.id, value.count, "unit")),
  ...input.node.buildings.map(
    (value) => new Attackable(value.id, 1, "building", value.level)
  ),
];

function runtime() {
  const results = {
    winner: "defender",
    attacker: {
      dead: [],
    },
    defender: {
      dead: [],
    },
  };

  let i = 0;
  /** @type {"attacker" | "defender"} */
  let turn = "attacker";

  console.log(attackers, defenders);

  while (i <= 2000) {
    const attackingUnits = turn === "attacker" ? attackers : defenders;
    const defendingUnits = turn === "attacker" ? defenders : attackers;

    //console.log(`TURN START: ${turn} ${i}`);
    //console.log("START BATTLE");
    for (const unit of attackingUnits) {
      // ignore unit if the attack is nothing or the chance to hit is 0;
      if (unit.attack <= 0 || unit.hitChance <= 0) continue;

      const defenderIdx = Math.floor(Math.random() * defendingUnits.length);
      const didHit = Math.random() * (unit.hitChance / 100);
      if (!didHit) continue;
      defendingUnits[defenderIdx].battle(unit);
    }

    //console.log("APPLY EFFECTS");
    for (const unit of defendingUnits) unit.runEffects();
    //console.log("CLEANUP");

    //console.log(`TURN END: ${turn}`);
    const deadUnits = remove(defendingUnits, (unit) => unit.isDead);
    for (const unit of deadUnits) unit.runEvent("onDeath");
    results[turn === "attacker" ? "defender" : "attacker"].dead.push(
      ...deadUnits
    );

    if (defendingUnits.length === 0 || attackingUnits.length === 0) break;

    turn = turn === "attacker" ? "defender" : "attacker";
    i++;
  }

  if (attackers.length === 0 && defenders.length >= 1) {
    results.winner = "attacker";
  }

  parentPort?.postMessage({ results });
}

runtime();
