# Map editor planet list

`planets.json` is the list the dev-only map editor (`/editor.html` under `pnpm -C client dev`) places Planets from. It is editor input, not game content: a map only gets the Planets you place.

- **Source:** [Halopedia](https://www.halopedia.org/), fetched 2026-10-31.
  - The 159 named worlds in `Category:Planets`, without its 4 general articles (Agriculture world, Penal colony, Planet, Wolf-faced planet).
  - Plus the Halo rings Installation 01–09 from the `Halo_Array` page.
- **Tags:**
  - from each world's subcategories: `human-colony`, `independent-colony`, `covenant-world`, `forerunner-world`, `homeworld`, `jiralhanae-colony`;
  - `sol` for the Sol system's planets, which sit in no colony category;
  - `halo-ring` for the Installations.
  - 37 worlds have no tag.
- **Ids** are the name in lowercase ASCII with dashes, so they fit a map's `localId`. Disambiguated titles drop the bracket, so "Minister (planet)" becomes "Minister".
- Only names and page links are used. Halopedia's text is CC BY-SA, and none of it is copied here.
- To add a world, add an entry by hand: `{ "id", "name", "tags", "url" }`.
