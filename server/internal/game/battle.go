package game

import (
	"cmp"
	"fmt"
	"math/rand/v2"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// Side is one of a Battle's two sides.
type Side int

const (
	Attacker Side = iota
	Defender
)

// Force is what one side brings: units, and for the defender its armed
// buildings. Unarmed buildings aren't combatants.
type Force struct {
	Units     []UnitSlot
	Buildings []string
}

// Combatant is one unit or armed building in a Battle, tracked on its own.
type Combatant struct {
	ID                string // unique in the Battle; ids sort byte-wise
	Side              Side
	Unit              string // a unit or building id
	Shield, Armor, HP float64
	combat            *cs.Combat
}

// Action is one combatant's turn: its hit on a target, layer by layer.
type Action struct {
	Actor, Target              string
	Weapon                     string // the actor's Weapon Type
	ShieldDmg, ArmorDmg, HPDmg float64
	Killed                     bool
}

// BattleResult is a whole Battle: the roster at the start, every Round's
// actions in Initiative order, the winner, and who survived.
type BattleResult struct {
	Roster    []Combatant
	Rounds    [][]Action
	Winner    Side
	Survivors []string // sorted ids
}

// ResolveBattle plays out a Battle Round by Round. It's a pure function of
// (forces, seed): the same inputs give the same result.
func ResolveBattle(c *cs.Content, attack, defend Force, seed uint64) BattleResult {
	rules := c.Rulesets[RulesetID]
	rng := rand.New(rand.NewPCG(seed, 0))
	all := append(combatants(c, Attacker, attack), combatants(c, Defender, defend)...)
	res := BattleResult{Roster: slices.Clone(all)}
	for i := range res.Roster {
		res.Roster[i].combat = nil // the roster is data only
	}

	tier := func(actor, target *Combatant) float64 {
		name, ok := actor.combat.Tiers[string(target.combat.UnitClass)]
		if !ok {
			name = "average"
		}
		return rules.Tiers[name]
	}
	targets := func(actor *Combatant) []*Combatant {
		var out []*Combatant
		for i := range all {
			t := &all[i]
			if t.Side != actor.Side && t.HP > 0 && tier(actor, t) > 0 {
				out = append(out, t)
			}
		}
		return out
	}
	alive := func(side Side) bool {
		return slices.ContainsFunc(all, func(c Combatant) bool { return c.Side == side && c.HP > 0 })
	}
	anyTarget := func() bool {
		for i := range all {
			if all[i].HP > 0 && len(targets(&all[i])) > 0 {
				return true
			}
		}
		return false
	}

	res.Winner = Defender // at the Round cap, with no targets, or on a mutual wipe-out
	for round := 0; ; round++ {
		if !alive(Defender) && alive(Attacker) {
			res.Winner = Attacker
			break
		}
		if !alive(Attacker) || !alive(Defender) || round == rules.RoundCap || !anyTarget() {
			break
		}

		type roll struct {
			c    *Combatant
			init int
		}
		var order []roll
		for i := range all {
			if all[i].HP > 0 {
				order = append(order, roll{&all[i], all[i].combat.Initiative + 1 + rng.IntN(rules.InitiativeDie)})
			}
		}
		slices.SortFunc(order, func(a, b roll) int {
			// Highest first; ties go to the defender, then the lowest id.
			return cmp.Or(cmp.Compare(b.init, a.init), cmp.Compare(b.c.Side, a.c.Side), cmp.Compare(a.c.ID, b.c.ID))
		})

		var actions []Action
		for _, r := range order {
			if r.c.HP <= 0 {
				continue // killed before its turn
			}
			ts := targets(r.c)
			if len(ts) == 0 {
				continue
			}
			t := ts[rng.IntN(len(ts))]
			actions = append(actions, hit(c, r.c, t, r.c.combat.Damage*tier(r.c, t)))
		}
		res.Rounds = append(res.Rounds, actions)
	}

	for _, cb := range all {
		if cb.HP > 0 {
			res.Survivors = append(res.Survivors, cb.ID)
		}
	}
	return res
}

// combatants expands a Force into one combatant per unit, then one per
// armed building, with full layers.
func combatants(c *cs.Content, side Side, f Force) []Combatant {
	prefix := map[Side]string{Attacker: "a", Defender: "d"}[side]
	var out []Combatant
	add := func(id string, cb *cs.Combat) {
		out = append(out, Combatant{
			// Zero-padded, so byte-wise order is the order they were added.
			ID: fmt.Sprintf("%s%04d", prefix, len(out)+1), Side: side, Unit: id,
			Shield: float64(cb.Shield), Armor: float64(cb.Armor), HP: float64(cb.Hp), combat: cb,
		})
	}
	for _, u := range f.Units {
		cb := c.Units[u.Unit].Combat
		for range u.Count {
			add(u.Unit, &cb)
		}
	}
	for _, b := range f.Buildings {
		if cb := c.Buildings[b].Combat; cb != nil {
			add(b, cb)
		}
	}
	return out
}

// hit applies base damage (damage × tier) to Shield, then Armor, then HP,
// each at the actor's Weapon Type multiplier for that layer. What's left
// after a layer breaks carries on; what's left after death is wasted.
func hit(c *cs.Content, actor, target *Combatant, base float64) Action {
	w := c.WeaponTypes[string(actor.combat.WeaponType)]
	a := Action{Actor: actor.ID, Target: target.ID, Weapon: string(actor.combat.WeaponType)}
	layers := []struct {
		value *float64
		mult  float64
		dealt *float64
	}{
		{&target.Shield, w.Shield, &a.ShieldDmg},
		{&target.Armor, w.Armor, &a.ArmorDmg},
		{&target.HP, w.Hp, &a.HPDmg},
	}
	left := base // in base-damage units, before a layer's multiplier
	for _, l := range layers {
		if *l.value <= 0 {
			continue
		}
		if l.mult <= 0 {
			break // this layer can't be hurt, so nothing gets past it
		}
		dmg := min(left*l.mult, *l.value)
		*l.value -= dmg
		*l.dealt = dmg
		left -= dmg / l.mult
		if *l.value > 0 || left <= 0 {
			break
		}
	}
	a.Killed = target.HP <= 0
	return a
}
