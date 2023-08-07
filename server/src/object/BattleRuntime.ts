import { parentPort, workerData } from "node:worker_threads";
import groupBy from "lodash.groupby";
import remove from "lodash.remove";
import Attackable from "./runtime/Attackable.js";
import type { UnitTransfer } from "./GameState.js";
import type Location from "./Location.js";

type PlayerTurn = "attacker" | "defender";

const input = workerData as { node: Location, transfer: UnitTransfer };

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
    (value) => new Attackable(value.id, 1, "building")
  ),
];

function runtime() {
  const results: { [team in PlayerTurn]: { lostCap: number; } } & { winner: PlayerTurn } = {
    attacker: { lostCap: 0 },
    defender: { lostCap: 0 },
    winner: "defender"
  }

  const dead: { [team in PlayerTurn]: Attackable[] } = {
    attacker: [],
    defender: []
  }

  let i = 0;
  let turn: PlayerTurn = "attacker";

  while (i <= 2000) {
    const attackingUnits = turn === "attacker" ? attackers : defenders;
    const defendingUnits = turn === "attacker" ? defenders : attackers;

    //console.log(`TURN START: ${turn} ${i}`);
    //console.log("START BATTLE");
    for (const unit of attackingUnits) {
      // ignore unit if the attack is nothing or the chance to hit is 0;
      if (unit.attack <= 0 || unit.hitChance <= 0) continue;

      const defenderIdx = Math.floor(Math.random() * defendingUnits.length);
      const didHit = Math.random() < unit.hitChance / 100;
      if (!didHit) continue;
      defendingUnits[defenderIdx].battle(unit);
    }

    //console.log("APPLY EFFECTS");
    for (const unit of defendingUnits) unit.runEffects();
    //console.log("CLEANUP");

    //console.log(`TURN END: ${turn}`);
    const deadUnits = remove(defendingUnits, (unit) => unit.isDead);
    for (const unit of deadUnits) unit.runEvent("onDeath");
    dead[turn === "attacker" ? "defender" : "attacker"].push(
      ...deadUnits
    );

    if (defendingUnits.length === 0 || attackingUnits.length === 0) break;

    turn = turn === "attacker" ? "defender" : "attacker";
    i++;
  }

  if (attackers.length > defenders.length) {
    results.winner = "attacker";
  }


  // calc lost units

  // attackers

  for (const unit of dead.attacker) {
    const data = unit.calcLostCap();



  }





  parentPort?.postMessage({ results });
}

runtime();
