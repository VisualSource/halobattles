package nakama

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/VisualSource/halobattles/server/internal/content"
	"github.com/VisualSource/halobattles/server/internal/gen/contentschema"
	"github.com/VisualSource/halobattles/server/internal/gen/wire"
	"github.com/heroiclabs/nakama-common/api"
	"github.com/heroiclabs/nakama-common/runtime"
)

type fakeDispatcher struct {
	runtime.MatchDispatcher
	lobby    *wire.LobbyStateT // last LobbyState broadcast
	label    map[string]any
	kicked   []string
	rejected map[string][]*wire.CommandRejectedT // by session
	views    map[string]*wire.ViewFullT          // last ViewFull, by session
	deltas   map[string][]*wire.ViewDeltaT       // by session
	paydays  map[string][]*wire.PaydayPaidT      // by session
	captured map[string][]*wire.PlanetCapturedT  // by session
	ops      map[string][]wire.Op                // every message, by session
	toAll    []wire.Op                           // messages broadcast to everyone
}

func (d *fakeDispatcher) BroadcastMessage(op int64, data []byte, to []runtime.Presence, _ runtime.Presence, _ bool) error {
	if d.ops == nil {
		d.ops = map[string][]wire.Op{}
	}
	for _, p := range to {
		d.ops[p.GetSessionId()] = append(d.ops[p.GetSessionId()], wire.Op(op))
	}
	if to == nil {
		d.toAll = append(d.toAll, wire.Op(op))
	}
	switch {
	case op == int64(wire.OpLobbyState) && to == nil:
		d.lobby = wire.GetRootAsLobbyState(data, 0).UnPack()
	case op == int64(wire.OpViewFull) && len(to) == 1:
		if d.views == nil {
			d.views = map[string]*wire.ViewFullT{}
		}
		d.views[to[0].GetSessionId()] = wire.GetRootAsViewFull(data, 0).UnPack()
	case op == int64(wire.OpViewDelta) && len(to) == 1:
		if d.deltas == nil {
			d.deltas = map[string][]*wire.ViewDeltaT{}
		}
		sid := to[0].GetSessionId()
		d.deltas[sid] = append(d.deltas[sid], wire.GetRootAsViewDelta(data, 0).UnPack())
	case op == int64(wire.OpPaydayPaid) && len(to) == 1:
		if d.paydays == nil {
			d.paydays = map[string][]*wire.PaydayPaidT{}
		}
		sid := to[0].GetSessionId()
		d.paydays[sid] = append(d.paydays[sid], wire.GetRootAsPaydayPaid(data, 0).UnPack())
	case op == int64(wire.OpPlanetCaptured):
		if d.captured == nil {
			d.captured = map[string][]*wire.PlanetCapturedT{}
		}
		for _, p := range to {
			d.captured[p.GetSessionId()] = append(d.captured[p.GetSessionId()], wire.GetRootAsPlanetCaptured(data, 0).UnPack())
		}
	case op == int64(wire.OpCommandRejected) && len(to) == 1:
		if d.rejected == nil {
			d.rejected = map[string][]*wire.CommandRejectedT{}
		}
		sid := to[0].GetSessionId()
		d.rejected[sid] = append(d.rejected[sid], wire.GetRootAsCommandRejected(data, 0).UnPack())
	}
	return nil
}

func (d *fakeDispatcher) MatchLabelUpdate(label string) error {
	return json.Unmarshal([]byte(label), &d.label)
}

func (d *fakeDispatcher) MatchKick(ps []runtime.Presence) error {
	for _, p := range ps {
		d.kicked = append(d.kicked, p.GetSessionId())
	}
	return nil
}

type fakeNK struct{ runtime.NakamaModule }

func (fakeNK) UsersGetId(_ context.Context, ids, _ []string) ([]*api.User, error) {
	var users []*api.User
	for _, id := range ids {
		users = append(users, &api.User{Id: id, DisplayName: "name-" + id})
	}
	return users, nil
}

type presence struct {
	runtime.Presence
	user, session string
	reason        runtime.PresenceReason // why it left; the zero value is a dropped connection
}

func (p presence) GetUserId() string                 { return p.user }
func (p presence) GetSessionId() string              { return p.session }
func (p presence) GetReason() runtime.PresenceReason { return p.reason }

func testContent() *content.Content {
	planets := func(ids ...string) []contentschema.MapPlanet {
		var ps []contentschema.MapPlanet
		for _, id := range ids {
			ps = append(ps, contentschema.MapPlanet{ID: contentschema.LocalID(id), Type: "base:capital"})
		}
		return ps
	}
	win := contentschema.Win{PlanetShare: 0.6, HoldSeconds: 90}
	base, err := content.Load([]string{filepath.Join("..", "..", "..", "mods", "base")})
	if err != nil {
		panic(err)
	}
	rules := base.Doc.Rulesets["base:rules"]
	return &content.Content{Hash: "hash1", Doc: contentschema.Content{
		// The base Mod's, so Battles run on real Battlefields.
		Terrains: base.Doc.Terrains, TerrainPresets: base.Doc.TerrainPresets, UnitClasses: base.Doc.UnitClasses,
		Maps: map[string]contentschema.GalaxyMap{
			"base:b-map": {Planets: planets("x", "y", "z"), Starts: []contentschema.LocalID{"x", "y", "z"}, MinPlayers: 2, Win: win},
			"base:a-map": {
				Planets: planets("x", "y", "z"), Starts: []contentschema.LocalID{"x", "z"}, MinPlayers: 2, Win: win,
				Lanes: []contentschema.Lane{{From: "x", To: "y", Type: "fast"}, {From: "y", To: "z", Type: "fast"}},
			},
		},
		PlanetTypes: map[string]contentschema.PlanetType{"base:capital": {BuildingSlots: 2, Income: map[string]int{"base:credits": 300}}},
		Factions: map[string]contentschema.Faction{"base:unsc": {}, "base:covenant": {StartingKit: contentschema.StartingKit{
			Stacks: contentschema.Stacks{{{Unit: "base:grunt", Count: 5}}},
		}}},
		Buildings: map[string]contentschema.Building{"base:hall": {
			Faction: "base:covenant", BuildTime: 30, Cost: map[string]int{"base:credits": 150},
		}},
		Resources: map[string]contentschema.Resource{"base:credits": {}},
		Rulesets: map[string]contentschema.Ruleset{"base:rules": {
			PaydaySeconds: 90, UnitSlotsPerStack: 10, ResultsSeconds: 60, GracePeriodSeconds: 180,
			StartingResources: map[string]int{"base:credits": 1000}, Battlefield: rules.Battlefield, Battle: rules.Battle,
		}},
	}}
}

func seatNames(l *wire.LobbyStateT) []string {
	var names []string
	for _, s := range l.Seats {
		names = append(names, s.DisplayName)
	}
	return names
}

func TestLobbyJoinLeaveAndHostHandoff(t *testing.T) {
	ctx, log, nk := context.Background(), nopLogger{}, fakeNK{}
	d := &fakeDispatcher{}
	m := &match{content: testContent()}

	state, rate, label := m.MatchInit(ctx, log, nil, nk, nil)
	if rate != 5 || label != `{"phase":"lobby","map":"base:a-map","seats":0,"max":2}` {
		t.Fatalf("init: rate %d, label %s", rate, label)
	}
	join := func(p presence) {
		t.Helper()
		var ok bool
		var reason string
		if state, ok, reason = m.MatchJoinAttempt(ctx, log, nil, nk, d, 0, state, p, nil); !ok {
			t.Fatalf("join attempt %v rejected: %s", p, reason)
		}
		state = m.MatchJoin(ctx, log, nil, nk, d, 0, state, []runtime.Presence{p})
	}
	leave := func(p presence) {
		state = m.MatchLeave(ctx, log, nil, nk, d, 0, state, []runtime.Presence{p})
	}

	join(presence{user: "u1", session: "s1"})
	if d.lobby.Host != "u1" || d.lobby.Map != "base:a-map" || d.lobby.Seats[0].Faction != "base:covenant" ||
		d.lobby.StartingResources[0].Resource != "base:credits" {
		t.Errorf("first LobbyState = %+v, seats %v", d.lobby, seatNames(d.lobby))
	}
	join(presence{user: "u2", session: "s2"})

	// The lobby is full: u3 is turned away.
	if _, ok, _ := m.MatchJoinAttempt(ctx, log, nil, nk, d, 0, state, presence{user: "u3", session: "s3"}, nil); ok {
		t.Error("join attempt with every Seat taken was accepted")
	}

	// u1 reloads: the new session joins before the old one's leave arrives.
	join(presence{user: "u1", session: "s1b"})
	leave(presence{user: "u1", session: "s1"})
	if d.lobby.Host != "u1" || len(d.lobby.Seats) != 2 {
		t.Errorf("after reload: host %q, seats %v; u1 should keep their Seat", d.lobby.Host, seatNames(d.lobby))
	}

	leave(presence{user: "u1", session: "s1b"})
	if d.lobby.Host != "u2" || d.label["seats"] != 1.0 {
		t.Errorf("after Host leaves: host %q, label %v", d.lobby.Host, d.label)
	}

	leave(presence{user: "u2", session: "s2"})
	if m.MatchLoop(ctx, log, nil, nk, d, 1, state, nil) != nil {
		t.Error("an emptied lobby should close the Match")
	}
}

func TestLobbyKicksTheLoserOfARaceForTheLastSeat(t *testing.T) {
	ctx, log, nk := context.Background(), nopLogger{}, fakeNK{}
	d := &fakeDispatcher{}
	m := &match{content: testContent()}
	state, _, _ := m.MatchInit(ctx, log, nil, nk, nil)
	state = m.MatchJoin(ctx, log, nil, nk, d, 0, state, []runtime.Presence{presence{user: "u1", session: "s1"}})

	// Both were admitted while one Seat was free.
	state = m.MatchJoin(ctx, log, nil, nk, d, 0, state, []runtime.Presence{
		presence{user: "u2", session: "s2"}, presence{user: "u3", session: "s3"}})

	if len(d.kicked) != 1 || d.kicked[0] != "s3" || len(d.lobby.Seats) != 2 {
		t.Errorf("kicked %v, seats %v", d.kicked, seatNames(d.lobby))
	}
}

func TestNewMatchWaitsForItsCreator(t *testing.T) {
	ctx, log, nk := context.Background(), nopLogger{}, fakeNK{}
	m := &match{content: testContent()}
	state, _, _ := m.MatchInit(ctx, log, nil, nk, nil)

	if m.MatchLoop(ctx, log, nil, nk, &fakeDispatcher{}, 10, state, nil) == nil {
		t.Error("a new Match closed before its creator could join")
	}
	if m.MatchLoop(ctx, log, nil, nk, &fakeDispatcher{}, creatorGraceTicks+1, state, nil) != nil {
		t.Error("a Match nobody joined should close after the grace period")
	}
}
