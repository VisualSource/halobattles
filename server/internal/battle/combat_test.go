package battle

import "testing"

var (
	kinetic    = Multipliers{Shield: 0.75, Armor: 1, HP: 1.25}
	shieldOnly = Multipliers{Shield: 1, Armor: 0, HP: 1}
)

func TestDiceNotation(t *testing.T) {
	for in, want := range map[string]Dice{"1d4": {1, 4, 0}, "2d6": {2, 6, 0}, "4d6+1": {4, 6, 1}, "1d1+13": {1, 1, 13}} {
		if got := parseDice(in); got != want {
			t.Errorf("parseDice(%q) = %+v, want %+v", in, got, want)
		}
	}
}

func TestAdvantageKeepsTheHigherRollAndDisadvantageTheLower(t *testing.T) {
	seq := func(xs ...int) func() int {
		return func() int { x := xs[0]; xs = xs[1:]; return x }
	}
	if got := rollWith(Advantage, seq(3, 8)); got != 8 {
		t.Errorf("advantage of 3 and 8 = %d", got)
	}
	if got := rollWith(Disadvantage, seq(3, 8)); got != 3 {
		t.Errorf("disadvantage of 3 and 8 = %d", got)
	}
	if got := rollWith(Normal, seq(3)); got != 3 { // only one roll: a second would run out
		t.Errorf("normal = %d", got)
	}
}

func TestHitCarriesLeftoverDamageIntoTheNextLayerRoundedDown(t *testing.T) {
	grunt := Layers{Shield: 5, HP: 70}

	// A roll of 14: Shield takes 5 at ×0.75, using 6.67 of it; the other 7.33
	// hits HP at ×1.25, which is 9.17, rounded down to 9.
	d := hit(kinetic, &grunt, 14)

	if d != (Layers{Shield: 5, HP: 9}) || grunt != (Layers{HP: 61}) {
		t.Errorf("dealt %+v, left %+v", d, grunt)
	}
}

func TestAHitAlwaysDoesAtLeastOne(t *testing.T) {
	grunt := Layers{Shield: 20, HP: 70}
	if d := hit(kinetic, &grunt, 1); d.Shield != 1 || grunt.Shield != 19 { // 1 × 0.75 rounds down to 0
		t.Errorf("dealt %+v, want the minimum 1 on the Shield", d)
	}
}

func TestDamagePastDeathIsWasted(t *testing.T) {
	marine := Layers{HP: 3}
	if d := hit(kinetic, &marine, 14); d.HP != 3 || marine.HP != 0 {
		t.Errorf("dealt %+v, want 3 HP and a kill", d)
	}
}

func TestALayerWithNoMultiplierStopsTheHit(t *testing.T) {
	target := Layers{Armor: 50, HP: 100}
	if d := hit(shieldOnly, &target, 20); d != (Layers{}) || target != (Layers{Armor: 50, HP: 100}) {
		t.Errorf("dealt %+v: Armor at ×0 stops the hit, even the minimum 1", d)
	}
}
