package game

import (
	"errors"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// Truces (#81; docs/specs/game-design-spec.md#truces): two Hostile players'
// Armies pass through each other's Planets with no Battle. Otherwise they
// stay Hostile.

// TruceKind is what happened to a Truce or an offer of one.
type TruceKind int

const (
	TruceOffered TruceKind = iota
	TruceMade
	TruceDeclined // the offerer is told
	TruceLapsed   // the offerer is told
	TruceEnded    // by choice, or by attacking: see Attacked
)

// TruceEvent tells the two players, and Spectators, of a Truce or an offer.
type TruceEvent struct {
	Kind     TruceKind
	From, To int  // the offerer and the one offered; for an end, who ended it and the other
	Attacked bool // an end by attacking, not by choice
}

// pair is a Truce's key: the two Seats, lower first.
func pair(a, b int) [2]int { return [2]int{min(a, b), max(a, b)} }

// truce reports whether a and b have a Truce.
func (s *State) truce(a, b int) bool { return s.Truces[pair(a, b)] }

// fighting reports whether a Battle has a and b as its two sides.
func (s *State) fighting(a, b int) bool {
	for _, bt := range s.Battles {
		if pair(bt.Attacker, bt.Defender) == pair(a, b) {
			return true
		}
	}
	return false
}

// OfferTruce offers to another player a Truce, which lapses after the
// Ruleset's truceOfferSeconds. A Bot declines at once.
func (s *State) OfferTruce(c *cs.Content, seat, to int) error {
	switch {
	case s.Players[seat].Eliminated:
		return errors.New("you're out of the Match")
	case to < 0 || to >= len(s.Players) || to == seat || s.Players[to].Eliminated:
		return errors.New("no such player")
	case s.Allied(seat, to):
		return errors.New("you're on the same Team")
	case s.truce(seat, to):
		return errors.New("you already have a Truce")
	case s.TruceOffers[[2]int{seat, to}] > 0:
		return errors.New("your offer is still open")
	case s.TruceRetry[[2]int{seat, to}] > s.Time:
		return errors.New("wait a while before offering again")
	case s.fighting(seat, to):
		return errors.New("not while you're fighting a Battle with them")
	}
	if s.Players[to].Bot != "" { // Bots decline every offer, for now
		s.declined(c, seat, to, TruceDeclined)
		return nil
	}
	if s.TruceOffers == nil {
		s.TruceOffers = map[[2]int]int64{}
	}
	s.TruceOffers[[2]int{seat, to}] = s.Time + int64(c.Rulesets[RulesetID].TruceOfferSeconds)*1000
	s.truceNews = append(s.truceNews, TruceEvent{Kind: TruceOffered, From: seat, To: to})
	return nil
}

// AnswerTruce accepts or declines an open offer from another player.
func (s *State) AnswerTruce(c *cs.Content, seat, from int, accept bool) error {
	switch {
	case s.TruceOffers[[2]int{from, seat}] == 0:
		return errors.New("no offer from them")
	case accept && s.fighting(seat, from):
		return errors.New("not while you're fighting a Battle with them")
	}
	if !accept {
		s.declined(c, from, seat, TruceDeclined)
		return nil
	}
	s.clearOffers(from, seat)
	if s.Truces == nil {
		s.Truces = map[[2]int]bool{}
	}
	s.Truces[pair(from, seat)] = true
	s.truceNews = append(s.truceNews, TruceEvent{Kind: TruceMade, From: from, To: seat})
	return nil
}

// EndTruce ends a Truce with another player, at once.
func (s *State) EndTruce(seat, with int) error {
	if !s.truce(seat, with) {
		return errors.New("you have no Truce with them")
	}
	s.endTruce(seat, with, false)
	return nil
}

// endTruce ends a and b's Truce, by and the other, if they have one.
func (s *State) endTruce(by, other int, attacked bool) {
	if !s.truce(by, other) {
		return
	}
	delete(s.Truces, pair(by, other))
	s.truceNews = append(s.truceNews, TruceEvent{Kind: TruceEnded, From: by, To: other, Attacked: attacked})
}

// attacked ends any Truce between the attacker and the Planet's owner:
// an Army ending its move there, a Raid reaching it, or troops landing.
func (s *State) attacked(attacker, owner int) {
	s.endTruce(attacker, owner, true)
}

// declined closes from's offer to to, and from can't offer to again for
// the Ruleset's truceRetrySeconds.
func (s *State) declined(c *cs.Content, from, to int, kind TruceKind) {
	delete(s.TruceOffers, [2]int{from, to})
	if s.TruceRetry == nil {
		s.TruceRetry = map[[2]int]int64{}
	}
	s.TruceRetry[[2]int{from, to}] = s.Time + int64(c.Rulesets[RulesetID].TruceRetrySeconds)*1000
	s.truceNews = append(s.truceNews, TruceEvent{Kind: kind, From: from, To: to})
}

// clearOffers drops any open offer either way between a and b.
func (s *State) clearOffers(a, b int) {
	delete(s.TruceOffers, [2]int{a, b})
	delete(s.TruceOffers, [2]int{b, a})
}

// lapseOffers closes every offer whose time is up.
func (s *State) lapseOffers(c *cs.Content) {
	for _, k := range sortedPairs(s.TruceOffers) {
		if s.TruceOffers[k] <= s.Time {
			s.declined(c, k[0], k[1], TruceLapsed)
		}
	}
}

// dropTruces ends a leaving player's Truces and open offers, with no events:
// their elimination says it.
func (s *State) dropTruces(seat int) {
	for k := range s.Truces {
		if k[0] == seat || k[1] == seat {
			delete(s.Truces, k)
		}
	}
	for k := range s.TruceOffers {
		if k[0] == seat || k[1] == seat {
			delete(s.TruceOffers, k)
		}
	}
}

func sortedPairs[V any](m map[[2]int]V) [][2]int {
	keys := make([][2]int, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	slices.SortFunc(keys, func(a, b [2]int) int {
		if a[0] != b[0] {
			return a[0] - b[0]
		}
		return a[1] - b[1]
	})
	return keys
}
