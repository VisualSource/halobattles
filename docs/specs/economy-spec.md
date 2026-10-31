# Halo Battles: economy spec (Economy v2)

How players earn and spend, leaning on Stellaris's economy rather than Empire at War's: three Resources with a refining chain, deposits that make placement matter, unit Upkeep, stockpile caps, empire sprawl, and an exchange. This is the single source for the economy's rules and numbers; the [game-design spec](game-design-spec.md) summarises it. Terms follow [GLOSSARY.md](../../GLOSSARY.md). Tracked in issue #22, built in its sub-issues; the game-design spec's roster tables change as each one lands.

There are still no Pops (see the game-design spec's [Out of scope](game-design-spec.md#out-of-scope)). Research and Techs are in the [tech spec](tech-spec.md); Research is a rate, not a Resource.

## Payday

- **Payday** comes every 90 s, as before. At each Payday every player's Resources change, in this order:
  1. **Income:** each owned Planet's base income, plus each extractor building's yield on it (see [Deposits](#deposits)).
  2. **Upkeep:** each building's and each living unit's Upkeep is taken off.
  3. **Refining:** each Foundry / Forge converts Materials into Alloys (see [Alloys](#alloys)).
  4. **Caps:** anything over a Resource's cap is lost (see [Stockpile caps](#stockpile-caps)).
- `PaydayPaid` carries the net change per Resource, as now.

## Resources

- Three stockpiled **Resources**:
  - **Credits**, like Stellaris's Energy: the main currency.
  - **Materials**, like Minerals: mined from deposits.
  - **Alloys**: refined from Materials. Only heavy units and Turrets need them.
- **Command Points** are unchanged: a cap from Planets, not a Resource.
- **Debt:** while a Resource is below zero, the player can't queue anything that costs it. Everything else keeps running: queues already paid for, research, and queuing what costs only other Resources. Unit Upkeep can push a player into debt. Harsher deficit penalties (supply failure, desertion) are a possible follow-up, not part of v2.
- **Starting resources** stay a lobby setting, now one amount per each of the three Resources. They must fit under the caps.

## Deposits

- Each Planet has a base income, and a **Richness** per Resource that extractor buildings work: `none` ×0, `poor` ×0.5, `normal` ×1, `rich` ×1.5.
- Base income and Richness come from the Planet Type; a map may override either per Planet, as it overrides income today.
- An **extractor building** yields its normal amount × its Planet's Richness for that Resource, rounded down. Several on one Planet each yield; Building Slots are the only limit.
- Alloys have no Richness: they come only from refining.

## Alloys

- A **Foundry** (UNSC) / **Forge** (Covenant) converts **40 Materials into 20 Alloys** at each Payday, after Upkeep. Short of Materials, it converts what there is, at the same 2:1.
- Vehicles, aircraft and Turrets cost Alloys on top of their other costs. Infantry and non-combat buildings don't.

## Unit Upkeep

- Every unit has an **Upkeep**, taken at each Payday from when it's trained until it dies: about 10% of its Credits cost, plus Alloys for vehicles and aircraft.
- Units in queues, and neutral garrisons, pay none. Buildings keep their Upkeep.

## Stockpile caps

- Each Resource has a **Stockpile cap**: 3000 Credits, 1500 Materials, 500 Alloys.
- Each **Depot** (UNSC) / **Reliquary** (Covenant) raises every cap: +1500 Credits, +750 Materials, +250 Alloys.
- At Payday, anything over a cap is lost. Between Paydays a stockpile may sit over its cap (after a refund or a trade); the next Payday trims it.

## Sprawl

- A player's first **4 Planets** are free. Each owned Planet beyond that adds **+5%** to the cost of every unit and building queued from then on, rounded to the nearest whole amount.
- Sprawl doesn't change Upkeep, refunds or the exchange. A refund repays what was actually charged.

## Exchange

- A new command, `Exchange {give, get, amount}`, trades Resources at fixed rates set in the Ruleset. It works any time in `play`, including in debt.
  - **Sell:** 2 Materials → 1 Credit; 1 Alloy → 2 Credits.
  - **Buy:** 3 Credits → 1 Material; 6 Credits → 1 Alloy.
- Only trades with Credits on one side exist; amounts are whole multiples of the rate. It's rejected if the player can't pay the `give` side.

## HUD

- **Header:** each Resource as `amount / cap`, with its projected net change at the next Payday (Upkeep included). A Resource at its cap is highlighted.
- **Exchange:** a popover from the header, to pick what to give, what to get and how much.
- **Planet panel:** the Planet's Richness per Resource, and each extractor's yield as it will actually pay there.

## Numbers

Approved in the Economy v2 grilling; tuned with a Payday-by-Payday opening simulation (a UNSC Starting Kit nets about +190 Credits, +120 Materials, +14 Alloys a Payday once it has a Foundry and a Mine on a Fortress, never goes into debt and never hits a cap in the first 8 Paydays).

### Ruleset

| Field | Value |
|---|---|
| Payday interval | 90 s |
| `startingResources` | 1000 Credits, 300 Materials, 50 Alloys |
| Stockpile caps | 3000 Credits, 1500 Materials, 500 Alloys |
| Depot / Reliquary cap bonus | +1500 Credits, +750 Materials, +250 Alloys |
| Sprawl | 4 free Planets, +5% per extra Planet |
| Exchange | sell 2M → 1C, 1A → 2C; buy 3C → 1M, 6C → 1A |

### Planet Types

| Planet Type | Base income | Credits Richness | Materials Richness | Building Slots | CP bonus |
|---|---|---|---|---|---|
| Capital | 150C 40M | normal | normal | 4 | +20 |
| Standard | 80C 20M | normal | poor | 3 | +10 |
| Fortress | 40C 10M | poor | rich | 4 | +15 |
| Rich | 150C 40M | rich | rich | 2 | +5 |

The first map has no per-Planet overrides.

### Buildings

Eight mirrored buildings per Faction. Build times are unchanged; the two new ones take 45 s (Foundry / Forge) and 30 s (Depot / Reliquary).

| UNSC / Covenant | Cost | Upkeep | Effect |
|---|---|---|---|
| Barracks / Hall | 150C | 10C | trains the two infantry units |
| Vehicle Depot / Summoning Foundry | 300C 100M | 25C | trains the light vehicle and the tank |
| Air Pad / Summit | 300C 150M | 30C | trains the aircraft |
| Supply Pad / Warehouse | 200C | — | extracts 100C × Credits Richness |
| Mine / Excavator (were Reactor / Generator) | 200C | — | extracts 60M × Materials Richness |
| Foundry / Forge | 250C 100M | 10C | refines 40M → 20A |
| Depot / Reliquary | 150C | — | raises every Stockpile cap |
| Turret / Plasma Turret | 200C 50M 20A | 10C | armed Structure |

### Units

Covenant mirrors UNSC: Grunt = Marine, Elite = ODST, Ghost = Warthog, Wraith = Scorpion, Banshee = Hornet.

| UNSC / Covenant | Cost | Upkeep |
|---|---|---|
| Marine / Grunt | 50C | 5C |
| ODST / Elite | 100C 25M | 10C |
| Warthog / Ghost | 150C 50M 15A | 15C 1A |
| Scorpion / Wraith | 250C 100M 30A | 25C 2A |
| Hornet / Banshee | 300C 150M 40A | 30C 2A |
