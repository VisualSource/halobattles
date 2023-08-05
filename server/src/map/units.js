const units = new Map([
  [
    0,
    {
      icon: "https://halo.wiki.gallery/images/6/62/HW2_Blitz_Bloodfuel_Grunts.png",
      name: "Bloodfuel Grunts",
      cost: 10_000,
      time: 20,
      type: "unit",
      capSize: 1,
      requires: [],
      id: 0,
      globalMax: -1,
      description:
        "Bloodfuel Grunts are equipped with a form of backpack and with unidentified weaponry. These weapons are seemingly capable of 'siphoning' the health out of the target of the weapon and healing the user wielding them.",
      stats: {
        attack: 10,
        type: "infantry",
        damageType: "plasma",
        health: 200,
        shealds: 10,
        hitChange: 50,
        events: {},
      },
    },
  ],
]);

export default units;
