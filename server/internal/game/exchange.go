package game

import (
	"errors"
	"fmt"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// Exchange trades amount of give for get at the Ruleset's rate for that
// pair; amount must be a whole multiple of the rate's giveAmount. It touches
// only the stockpile, so it works in debt and while Planets are Locked.
func (s *State) Exchange(c *cs.Content, seat int, give, get string, amount int) error {
	if seat < 0 || seat >= len(s.Players) || s.Players[seat].Eliminated {
		return errors.New("you're not in this Match")
	}
	pl := &s.Players[seat]
	for _, r := range c.Rulesets[RulesetID].Exchange {
		if string(r.Give) != give || string(r.Get) != get {
			continue
		}
		switch {
		case amount < r.GiveAmount || amount%r.GiveAmount != 0:
			return fmt.Errorf("trade %s in multiples of %d", c.Resources[give].Name, r.GiveAmount)
		case pl.Resources[give] < amount:
			return fmt.Errorf("not enough %s", c.Resources[give].Name)
		}
		pl.Resources[give] -= amount
		pl.Resources[get] += amount / r.GiveAmount * r.GetAmount
		return nil
	}
	return fmt.Errorf("%s can't be traded for %s", c.Resources[give].Name, c.Resources[get].Name)
}
