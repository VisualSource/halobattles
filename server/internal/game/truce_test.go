package game

import (
	"testing"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// truceContent is the line map with the Ruleset's Truce times set.
func truceContent() *cs.Content {
	c := lineContent()
	r := c.Rulesets[RulesetID]
	r.TruceOfferSeconds, r.TruceRetrySeconds = 60, 60
	c.Rulesets[RulesetID] = r
	return c
}

// truced is Seats 0 and 1 with a Truce.
func truced(t *testing.T, s *State, c *cs.Content) {
	t.Helper()
	if err := s.OfferTruce(c, 0, 1); err != nil {
		t.Fatal(err)
	}
	if err := s.AnswerTruce(c, 1, 0, true); err != nil {
		t.Fatal(err)
	}
}

func TestATruceIsOfferedThenAcceptedDeclinedOrLapses(t *testing.T) {
	s, c := fixedMatch(t), truceContent()
	if err := s.OfferTruce(c, 0, 1); err != nil || len(s.truceNews) != 1 || s.truceNews[0].Kind != TruceOffered {
		t.Fatalf("offer: %v, events %+v", err, s.truceNews)
	}
	if err := s.OfferTruce(c, 0, 1); err == nil {
		t.Error("a second offer while the first is open was taken")
	}
	if v := s.View(c, 1); v.Players[0].OfferFrom == 0 {
		t.Error("Seat 1 isn't shown Seat 0's offer")
	}
	if err := s.AnswerTruce(c, 1, 0, false); err != nil || s.truce(0, 1) {
		t.Fatalf("decline: %v, truce %v", err, s.truce(0, 1))
	}
	if err := s.OfferTruce(c, 0, 1); err == nil {
		t.Error("offered again straight after a decline; want the wait first")
	}
	s.Time += 60_000
	if err := s.OfferTruce(c, 0, 1); err != nil {
		t.Fatalf("after the wait: %v", err)
	}
	s.Time += 60_000
	s.truceNews = nil
	s.lapseOffers(c)
	if len(s.truceNews) != 1 || s.truceNews[0].Kind != TruceLapsed || s.TruceOffers[[2]int{0, 1}] != 0 {
		t.Errorf("after the offer's time: events %+v; want it lapsed", s.truceNews)
	}
	s.Time += 60_000
	truced(t, s, c)
	if !s.truce(0, 1) || len(s.View(c, 0).Players[1].Truces) != 1 {
		t.Errorf("accepted: truce %v; want it held and shown", s.truce(0, 1))
	}
	if err := s.EndTruce(1, 0); err != nil || s.truce(0, 1) {
		t.Errorf("end: %v; want it gone", err)
	}
}

func TestABotDeclinesEveryOffer(t *testing.T) {
	s, c := fixedMatch(t), truceContent()
	s.Players[1].Bot = "base:normal"
	if err := s.OfferTruce(c, 0, 1); err != nil || s.TruceOffers[[2]int{0, 1}] != 0 || s.truceNews[0].Kind != TruceDeclined {
		t.Errorf("offer to a Bot: %v, events %+v; want it declined at once", err, s.truceNews)
	}
}

// An Army goes straight through a Truce partner's Planet; ending its move
// on one attacks it, and ends the Truce.
func TestATruceLetsArmiesPassAndAttackingEndsIt(t *testing.T) {
	s, c := fixedMatch(t), truceContent()
	s.Planets["b"].Owner = 1 // Seat 1's, between Seat 0's a and c
	s.Planets["c"].Owner, s.Planets["c"].Stacks = 0, [StacksPerPlanet]Stack{}
	truced(t, s, c)
	if err := s.OrderArmy(0, "a", marines(2), "c", 0); err != nil {
		t.Fatal(err)
	}
	for range 120 {
		s.Advance(c, s.Time+1000)
	}
	if len(s.Battles) != 0 || !s.truce(0, 1) || unitsIn(s.Planets["c"].Stacks[0], "base:marine") != 2 {
		t.Fatalf("%d Battles, truce %v, Marines at c %d; want them through b to c, the Truce kept", len(s.Battles), s.truce(0, 1), unitsIn(s.Planets["c"].Stacks[0], "base:marine"))
	}
	if err := s.OrderArmy(0, "a", marines(2), "b", 0); err != nil {
		t.Fatal(err)
	}
	var ended, started bool
	for range 120 {
		ev := s.Advance(c, s.Time+1000)
		for _, e := range ev.Truces {
			ended = ended || e.Kind == TruceEnded && e.Attacked && e.From == 0
		}
		started = started || len(ev.Started) > 0
	}
	if s.truce(0, 1) || !ended || !started {
		t.Errorf("truce %v, ended by attacking %v, Battle started %v; want arriving at b to end it and start a Battle", s.truce(0, 1), ended, started)
	}
}

func TestNoTruceDuringABattleBetweenThem(t *testing.T) {
	s, c := fixedMatch(t), truceContent()
	if err := s.OfferTruce(c, 1, 0); err != nil {
		t.Fatal(err)
	}
	s.Planets["b"].Owner = 1
	_ = s.OrderArmy(0, "a", marines(10), "b", 0)
	s.Advance(c, 30_000)
	onlyBattle(t, s)
	if s.TruceOffers[[2]int{1, 0}] != 0 {
		t.Error("the Battle starting left the offer open")
	}
	if err := s.OfferTruce(c, 0, 1); err == nil {
		t.Error("offered during a Battle between them")
	}
}

func TestEliminationEndsTruces(t *testing.T) {
	s, c := fixedMatch(t), truceContent()
	truced(t, s, c)
	s.eliminate(1, &Events{})
	if s.truce(0, 1) {
		t.Error("an eliminated player's Truce held")
	}
	if s.OfferTruce(c, 1, 0) == nil {
		t.Error("an eliminated player offered a Truce")
	}
}

// unitsIn counts a unit in a Stack, over all its slots.
func unitsIn(st Stack, unit string) (n int) {
	for _, u := range st {
		if u.Unit == unit {
			n += u.Count
		}
	}
	return n
}
