package battle

import (
	"fmt"
	"math"
	"math/rand/v2"
)

// Tiers: how an attacker rolls against a Unit Class.
const (
	Advantage    = "advantage"    // roll to hit and damage twice, keep the higher
	Normal       = "normal"       // roll once; a Unit Class missing from tiers is this
	Disadvantage = "disadvantage" // roll twice, keep the lower
	None         = "none"         // can't target it
)

// tierRank orders tiers for picking a target, best first.
var tierRank = map[string]int{Advantage: 0, Normal: 1, Disadvantage: 2}

// rollWith makes a roll, twice with advantage (keeping the higher) or
// disadvantage (keeping the lower).
func rollWith(tier string, roll func() int) int {
	x := roll()
	switch tier {
	case Advantage:
		return max(x, roll())
	case Disadvantage:
		return min(x, roll())
	}
	return x
}

// Dice is a damage roll, NdM+K.
type Dice struct{ N, M, K int }

// parseDice reads dice notation. The content schema has already checked
// it, so a part that isn't there is 0.
func parseDice(s string) Dice {
	var d Dice
	_, _ = fmt.Sscanf(s, "%dd%d+%d", &d.N, &d.M, &d.K) // "1d4" has no +K: that's fine
	return d
}

func (d Dice) roll(rng *rand.Rand) int {
	total := d.K
	for range d.N {
		total += 1 + rng.IntN(d.M)
	}
	return total
}

// Layers are one unit's Shield, Armor and HP.
type Layers struct{ Shield, Armor, HP float64 }

// Multipliers are a Weapon Type's, per layer.
type Multipliers struct{ Shield, Armor, HP float64 }

// hit applies a damage roll to Shield, then Armor, then HP, each at the
// Weapon Type's multiplier for that layer, rounded down. What's left after a
// layer breaks carries on; what's left after death is wasted. A hit always
// does at least 1, unless the layer it reaches is immune. It returns the
// damage dealt to each layer.
func hit(w Multipliers, target *Layers, roll int) (dealt Layers) {
	layers := []struct {
		value *float64
		mult  float64
		dealt *float64
	}{
		{&target.Shield, w.Shield, &dealt.Shield},
		{&target.Armor, w.Armor, &dealt.Armor},
		{&target.HP, w.HP, &dealt.HP},
	}
	left := float64(roll) // in base-damage units, before a layer's multiplier
	for _, l := range layers {
		if *l.value <= 0 {
			continue
		}
		if l.mult <= 0 {
			break // this layer can't be hurt, so nothing gets past it
		}
		dmg := min(math.Floor(left*l.mult), *l.value)
		*l.value -= dmg
		*l.dealt = dmg
		left -= dmg / l.mult
		if *l.value > 0 || left <= 0 {
			break
		}
	}
	if dealt.Shield+dealt.Armor+dealt.HP == 0 {
		// Rounding took it all: 1 to the first layer standing, unless it's immune.
		for _, l := range layers {
			if *l.value > 0 {
				if l.mult > 0 {
					*l.value--
					*l.dealt = 1
				}
				break
			}
		}
	}
	return dealt
}
