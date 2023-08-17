import { parentPort, workerData } from "node:worker_threads";
import groupBy from "lodash.groupby";
import remove from "lodash.remove";
import process from 'node:process';
import Attackable from "./runtime/Attackable.js";
import type { UnitTransfer } from "./GameState.js";
import type Location from "./Location.js";
import type { UUID } from "../lib.js";
import { log } from './runtime/logger.js';

type PlayerTurn = "attacker" | "defender";
type LostUnit = { cap: number; id: number; lost: number; type: "unit"; } | { instId: string | undefined; cap: number; id: number; lost: number; type: "building"; }
type ServivedUnit = {
  id: number;
  type: "unit";
  instId?: undefined;
} | {
  id: number;
  type: "building";
  instId: string | undefined;
};

export type BattleResult = {
  [team in PlayerTurn]: {
    id: UUID,
    survived: ServivedUnit[],
    lostCap: number;
    lostUnits: LostUnit[]
  }
} & { winner: PlayerTurn, node: UUID; attackerTransferId: UUID }

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
    (value) => new Attackable(value.id, 1, "building", value.objId)
  ),
];

function runtime() {
  const results: BattleResult = {
    attacker: { id: input.transfer.owner as UUID, lostCap: 0, lostUnits: [], survived: [] },
    defender: { id: input.node.owner as UUID, lostCap: 0, lostUnits: [], survived: [] },
    winner: "defender",
    node: input.node.objectId,
    attackerTransferId: input.transfer.id
  }

  const dead: { [team in PlayerTurn]: Attackable[] } = {
    attacker: [],
    defender: []
  }

  let i = 0;
  let turn: PlayerTurn = "attacker";

  while (i <= 1000) {
    log(`[${i}:${turn}] Round Start`);

    for (const unit of (turn === "attacker" ? attackers : defenders)) {
      // ignore unit if the attack is nothing or the chance to hit is 0;
      if (unit.attack <= 0 || unit.hitChance <= 0) {
        log(`[${i}:${turn}] Skip Unit: ${unit.contentId}`);
        continue;
      }

      const defenderIdx = Math.floor(Math.random() * (turn === "attacker" ? defenders : attackers).length);
      const didHit = Math.random() < unit.hitChance / 100;
      if (!didHit) {
        log(`[${i}:${turn}] MISS`);
        continue;
      }
      log(`[${i}:${turn}] HIT`);
      (turn === "attacker" ? defenders : attackers)[defenderIdx].battle(unit);
    }

    for (const unit of (turn === "attacker" ? defenders : attackers)) unit.runEffects();

    const deadUnits = remove((turn === "attacker" ? defenders : attackers), (unit) => unit.isDead);
    for (const unit of deadUnits) unit.runEvent("onDeath");
    dead[turn === "attacker" ? "defender" : "attacker"].push(
      ...deadUnits
    );

    if (defenders.length === 0 || attackers.length === 0) {
      log(`[${i}:${turn}] Gameover`);
      break;
    }

    turn = turn === "attacker" ? "defender" : "attacker";
    i++;
  }

  if (attackers.length > defenders.length) {
    results.winner = "attacker";
  }

  for (const unit of attackers) {
    const lost = unit.calcLostCap();

    results.attacker.lostCap += lost.cap;
    if (lost.lost > 0) results.attacker.lostUnits.push(lost);

    const servived = unit.calcServived();
    if (!servived) continue;
    results.attacker.survived.push(servived);
  }

  for (const unit of defenders) {
    const lost = unit.calcLostCap();

    results.defender.lostCap += lost.cap;
    if (lost.lost > 0) results.defender.lostUnits.push(lost);

    const servived = unit.calcServived();
    if (!servived) continue;
    results.defender.survived.push(servived);
  }
  // attackers

  for (const unit of dead.attacker) {
    const data = unit.calcLostCap();
    results.attacker.lostCap += data.cap;
    results.attacker.lostUnits.push(data);
  }
  for (const unit of dead.defender) {
    const data = unit.calcLostCap();
    results.defender.lostCap += data.cap;
    results.defender.lostUnits.push(data);
  }

  parentPort?.postMessage(results);

  process.exit(0);
}

runtime();
