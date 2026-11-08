package battle

import (
	"cmp"
	"maps"
	"math"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// Weights tune a side's AI. Each scales one kind of choice; 1 is neutral.
type Weights struct {
	Aggression float64 // going after enemy squads in view
	Caution    float64 // shying from goals with enemies near, regrouping when hurt
	Cover      float64 // preferring cover and high ground to stop on
	Raid       float64 // going after enemy buildings
	Scout      float64 // searching when no enemy is in view
	Mass       float64 // strength a Task Force gathers over the threat at its goal
}

// WeightsOf reads a Faction's AI block; anything it leaves out is 1.
func WeightsOf(w *cs.AIWeights) Weights {
	or := func(p *float64) float64 {
		if p == nil {
			return 1
		}
		return *p
	}
	if w == nil {
		return Weights{1, 1, 1, 1, 1, 1}
	}
	return Weights{or(w.Aggression), or(w.Caution), or(w.Cover), or(w.Raid), or(w.Scout), or(w.Mass)}
}

type goalKind int

const (
	capture  goalKind = iota // take a Control Point the side doesn't hold
	defend                   // hold one it does
	kill                     // destroy an enemy squad in view
	raid                     // destroy an enemy building seen
	scout                    // look for the enemy
	patrol                   // a skirmisher's next stop on its round
	fallback                 // get clear of the enemy: back to a held point or a friend
	takePad                  // take a build pad the side doesn't hold
	assault                  // destroy the defender's Command Post
)

// role is a job the Commander gives a squad on top of the usual goals.
type role int

const (
	noRole      role = iota
	scouting         // roams to look, falls back from the enemy
	skirmish         // patrols between points, hunts what it's good against
	fallingBack      // was scouting or skirmishing, and met more than it could take
)

// matchup scales a kill or raid goal by the squad's tier against the
// target, so squads go after what they're good against. Kept mild: at 1.5 and
// 0.6 the attacker, free to pick its fights, won 75% of Starting Kit Battles.
var matchup = map[string]float64{Counter: 1.15, Advantage: 1.15, Normal: 1, Disadvantage: 0.9} // step 5 of v4 (#120) tunes these

// goal is what the Commander gives a squad: a place, and for kill and raid
// the target's id.
type goal struct {
	kind   goalKind
	cell   Cell
	target int
}

// same is whether two goals are the same job, wherever a target has moved.
func (g goal) same(o goal) bool {
	return g.kind == o.kind && g.target == o.target && (g.target != 0 || g.cell == o.cell)
}

// Facts a squad's plan reasons over, as bits.
type facts uint8

const (
	atGoal facts = 1 << iota
	inRange
	inCover
	nearFriendly
	atStandoff // in range of its target, out of the target's reach
)

// action is one step of a squad's plan.
type action int

const (
	goTo         action = iota // to the goal
	approach                   // to a firing position on the target, preferring high ground and cover
	takeCover                  // to a covered cell near where it is
	regroup                    // to the nearest friendly squad
	keepDistance               // to a firing position out of a target's reach, against one it kites
)

type plan struct {
	goal      goal
	steps     []action
	members   int  // its count when planned: a loss replans
	moveTo    Cell // where the current step sent it
	sent      bool
	engaged   int  // guarding a point: the enemy it has left the point to fight, or 0
	beat      int  // a guard's place on its beat round its point
	beatAt    int  // the tick it last set out on its beat
	beatUntil int  // the tick it's back from its beat
	waiting   bool // a Task Force follower holding back behind its leaders
}

// AI drives a side: a Commander that hands each squad a goal, and a
// Goal-Oriented Action Planner per squad that works out how to reach it.
// See ADR 0005.
type AI struct {
	weights Weights
	plans   map[int]*plan
	seen    map[int]Cell     // enemy buildings seen, by id, where they stand
	sighted map[int]sighting // enemy squads seen lately, by id
	owners  []Side           // Control Point holders last tick, to notice a flip
	own     []*Squad         // the side's squads on the field this tick
	looked  []int            // per block of the map, the tick the side last saw its middle
	roles   map[int]role     // squads with a job, by id
	forces  map[forceKey]*taskForce
	forceOf map[int]*taskForce // squads in a Task Force, by id
	rested  map[int]int        // the tick a squad got back from falling back
	round   map[int]int        // a skirmisher's place on its patrol
	// Trace, if set, hears each change in what a squad has been told to do,
	// for a Match log.
	Trace    func(Decision)
	traced   map[int]Decision
	thinking *Thinking // kept for the Battle Lab once Think is called
}

// Decision is what the Commander has a squad do: its goal, and any role.
type Decision struct {
	Tick   int    `json:"tick"`
	Squad  int    `json:"squad"`
	Unit   string `json:"unit"`
	Goal   string `json:"goal"`
	Target int    `json:"target,omitempty"` // a squad id, for kill and raid
	Cell   Cell   `json:"cell"`
	Role   string `json:"role,omitempty"`
}

var (
	goalNames = [...]string{"capture", "defend", "kill", "raid", "scout", "patrol", "fallback", "takePad", "assault"}
	roleNames = [...]string{"", "scouting", "skirmish", "fallingBack"}
)

// trace tells Trace of each squad whose goal or role changed since the last
// call; a moving target's new cell isn't a change.
func (ai *AI) trace(v View) {
	if ai.traced == nil {
		ai.traced = map[int]Decision{}
	}
	for _, sq := range ai.own {
		p := ai.plans[sq.ID]
		if p == nil {
			continue
		}
		d := Decision{Tick: v.Tick(), Squad: sq.ID, Unit: sq.Unit, Goal: goalNames[p.goal.kind], Target: p.goal.target, Cell: p.goal.cell, Role: roleNames[ai.roles[sq.ID]]}
		old, ok := ai.traced[sq.ID]
		if ok && old.Goal == d.Goal && old.Target == d.Target && old.Role == d.Role && (d.Target != 0 || old.Cell == d.Cell) {
			continue
		}
		ai.traced[sq.ID] = d
		ai.Trace(d)
	}
}

func NewAI(w Weights) *AI {
	return &AI{
		weights: w, plans: map[int]*plan{}, seen: map[int]Cell{}, sighted: map[int]sighting{},
		roles: map[int]role{}, rested: map[int]int{}, round: map[int]int{},
	}
}

// sighting is where an enemy squad was last seen, how many it had, and when.
type sighting struct {
	cell    Cell
	members int
	tick    int
}

// weightsOf is looked up per squad, so unit types can tune their own later.
func (ai *AI) weightsOf(*Squad) Weights { return ai.weights }

const (
	// recallSeconds is how long the AI keeps counting an enemy it can no longer
	// see. Without it, a squad that sights an enemy, turns away from the
	// threat, and loses sight of it would turn straight back, over and over.
	recallSeconds = 10
	// stickiness is how much better another goal must score before a squad
	// drops the one it has.
	stickiness = 1.25
	// padValue is how much the Commander wants a build pad it doesn't hold,
	// against 3 for a Control Point; setupPadValue, the defender's in setup,
	// against 2 for holding one of its own.
	padValue      = 1.2
	setupPadValue = 5
	// assaultValue is what the attacker wants the Command Post; the
	// defender holding it, holdCommandPost, before its threat; taking a
	// Landing Zone, landingZone. First pass, untuned (#95).
	assaultValue        = 4
	holdCommandPost     = 3
	landingZone         = 1.2
	attackerLandingZone = 0.3
	// block is the side, in cells, of the squares the AI tracks looking at.
	block = 8
	// scoutShare is the part of a defender's mobile squads sent scouting,
	// times its scout weight; at least one once it has minForScouts, and at
	// most maxScouts. A two-squad defender whose scout kept going out lost
	// its points: 63% attacker wins; scouting once, 55%.
	scoutShare   = 0.2
	minForScouts = 2
	// minForRepeat is how many mobile squads a defender needs before a scout
	// that fell back goes out again; with fewer it scouts once.
	minForRepeat = 3
	maxScouts    = 3
	// skirmishShare is the part of a side's mobile squads it sends
	// skirmishing, times its aggression weight, out of those it can spare
	// (beyond one per point for the defender, two per point for the
	// attacker): at least 1 and at most maxSkirmishers. With scoutShare, a
	// 3-squad side gets 1 scout and no skirmisher; a 10-squad one, 2 scouts
	// and 1 skirmisher.
	skirmishShare  = 0.1
	maxSkirmishers = 5
	// restSeconds is how long a squad that fell back is left to the usual
	// goals before it can take a role again.
	restSeconds = 20
	// outnumbered is how many times its own members an enemy needs before a
	// skirmisher falls back rather than fights.
	outnumbered = 1.5
	// staleCap is the most seconds since a block was looked at that count.
	staleCap = 60
	// A guard's beat: every beatEvery seconds it walks to a stop up to
	// beatReach cells from its point, inside the capture radius so the point
	// is never left open, and pauses there beatPause seconds. Out to 4 cells
	// and the pads near it, guards were caught away: 59% attacker wins
	// instead of 54%; this costs about 2.
	beatEvery = 8
	beatReach = 2
	beatPause = 3
	// leash is how far from its point, in cells, a guarding squad chases an
	// enemy, times its aggression weight.
	leash = 6
	// underFireSeconds is how long after an enemy fires on a squad that the squad
	// still answers it: going after it, or getting clear of it.
	underFireSeconds = 3
	// buildingThreat is what an armed building adds to the threat near a
	// goal, counted like an enemy squad's members.
	buildingThreat = 5
	nearRadius     = 3 // cells: a friendly this close is near
	threatRadius   = 6 // cells: enemies this close to a goal threaten it
	distScale      = 12.0
)

func (ai *AI) Orders(v View) []Order {
	s := v.sim
	enemies := v.Enemies()
	own := v.Own()
	ai.own = own
	ai.remember(v, own, enemies)

	flipped := false
	for i, p := range s.Points {
		flipped = flipped || i < len(ai.owners) && ai.owners[i] != p.Owner
	}
	ai.owners = ai.owners[:0]
	for _, p := range s.Points {
		ai.owners = append(ai.owners, p.Owner)
	}
	var out []Order
	if flipped || v.Tick()%v.sim.TPS() == 0 {
		ai.look(v, own)
		ai.command(v, own, enemies)
		if ai.Trace != nil {
			ai.trace(v)
		}
		out = append(out, ai.build(v)...)
	}

	for _, sq := range own {
		p := ai.plans[sq.ID]
		if p == nil || sq.speed == 0 || sq.retreating {
			continue
		}
		if p.goal.target != 0 {
			t := s.squad(p.goal.target)
			if t == nil || !t.alive() {
				continue // gone: the Commander picks a new goal next second
			}
			if s.visible[v.Side][t.ID] {
				p.goal.cell = t.Cell
			}
		}
		tf := ai.forceOf[sq.ID]
		out = append(out, ai.aim(v, sq, tf)...)
		if e := ai.foe(v, sq, p, enemies); e != nil {
			if s.tier(sq, e) == None {
				out = append(out, ai.evade(v, sq, p, e)...)
			} else {
				out = append(out, ai.engage(v, sq, p, e)...)
			}
			continue
		}
		if p.engaged != 0 { // it's dead or gone: back to the plan
			p.engaged, p.steps, p.sent, p.moveTo = 0, nil, false, Cell{}
		}
		if tf != nil && !tf.going {
			out = append(out, ai.gather(v, sq, p, tf)...)
			continue
		}
		if tf != nil {
			if o, ok := ai.follow(v, sq, p, tf); ok {
				out = append(out, o...)
				continue
			}
		}
		if p.goal.kind == defend && !s.setup() { // no beats in setup either
			if v.Tick() < p.beatUntil {
				continue // walking its beat, or pausing at a stop
			}
			if o, ok := ai.walkBeat(v, sq, p); ok {
				out = append(out, o)
				continue
			}
			if o, ok := ai.takePost(v, sq, p); ok {
				out = append(out, o)
				continue
			}
		}
		if p.steps == nil || flipped || len(sq.Members) < p.members || (v.Tick()+sq.ID)%v.sim.TPS() == 0 {
			ai.replan(v, sq, p)
		}
		for _, o := range ai.execute(v, sq, p) {
			if tf != nil && o.Kind == Move {
				o.Pace = tf.pace // in together
			}
			out = append(out, o)
		}
	}
	return out
}

// remember keeps where enemy buildings were seen, and forgets one whose
// cell is in Sight but which isn't there any more.
func (ai *AI) remember(v View, own, enemies []*Squad) {
	for _, e := range enemies {
		if e.Building {
			ai.seen[e.ID] = e.Cell
		} else {
			ai.sighted[e.ID] = sighting{e.Cell, len(e.Members), v.Tick()}
		}
	}
	inSight := func(at Cell) bool {
		return slices.ContainsFunc(own, func(o *Squad) bool {
			r := v.sim.sightOf(o)
			return float64(dist2(o.Cell, at)) <= r*r
		})
	}
	for _, id := range slices.Sorted(maps.Keys(ai.sighted)) {
		// Forgotten after a while, or once the spot is in Sight and it's gone.
		if sg := ai.sighted[id]; v.Tick()-sg.tick > recallSeconds*v.sim.TPS() || sg.tick != v.Tick() && inSight(sg.cell) {
			delete(ai.sighted, id)
		}
	}
	for _, id := range slices.Sorted(maps.Keys(ai.seen)) {
		if t := v.sim.squad(id); t == nil || !t.alive() {
			at := ai.seen[id]
			if slices.ContainsFunc(own, func(o *Squad) bool {
				r := v.sim.sightOf(o)
				return float64(dist2(o.Cell, at)) <= r*r
			}) {
				delete(ai.seen, id)
			}
		}
	}
}

// command is the Commander: it lists goals and hands each mobile squad the
// one it scores highest. A goal's score is its value, less for distance, for
// squads already on it, and, except for holding a point, for enemies the
// side has seen near it lately. A squad's current goal scores a quarter more,
// so near-ties don't flip it back and forth. A Task Force's goal (see
// taskforce.go) loses nothing for squads on it until it has the strength
// the threat there calls for, so squads mass on it rather than spread out.
func (ai *AI) command(v View, own, enemies []*Squad) {
	s := v.sim
	var goals []goal
	var values []float64
	add := func(g goal, value float64) {
		goals = append(goals, g)
		values = append(values, value)
	}
	w := ai.weights
	// The Command Post decides the Battle; Landing Zones count for little
	// until reinforcements land on them (#57).
	cp := s.commandPost()
	raider := s.Raid && v.Side == Attacker // after the buildings, not the Command Post or the Landing Zones
	if cp != nil && cp.alive() && !raider {
		if v.Side == Attacker {
			add(goal{kind: assault, cell: cp.Cell, target: cp.ID}, assaultValue)
		} else if s.setup() {
			add(goal{kind: defend, cell: cp.Cell}, 1) // the attacker can't move yet: pads first
		} else {
			add(goal{kind: defend, cell: cp.Cell}, holdCommandPost)
		}
	}
	// The attacker never stops to hold one, and takes one only in passing:
	// its squads are for the assault.
	for _, p := range s.Points {
		switch {
		case raider:
		case p.Owner != v.Side && v.Side == Attacker:
			add(goal{kind: capture, cell: p.Cell}, attackerLandingZone)
		case p.Owner != v.Side:
			add(goal{kind: capture, cell: p.Cell}, landingZone)
		case v.Side == Defender:
			add(goal{kind: defend, cell: p.Cell}, 1)
		}
	}
	pad := padValue
	if s.setup() && v.Side == Defender {
		pad = setupPadValue // the attacker can't move yet: take them now
	}
	for _, p := range s.PadsFor(v.Side) { // as the side last saw them
		if p.Owner != v.Side && p.Turret == 0 {
			add(goal{kind: takePad, cell: p.Cell}, pad)
		}
	}
	if s.Raid && v.Side == Defender {
		for _, sq := range own {
			if sq.planetBuilding() {
				add(goal{kind: defend, cell: sq.Cell}, 1) // worth more under threat, as a Landing Zone is
			}
		}
	}
	// A raider's buildings are worth what an assault is; others, in sight,
	// 1.2 × the Raid weight, and as last seen 1 ×.
	raidValue := func(e *Squad, inSight bool) float64 {
		switch {
		case raider && e.planetBuilding():
			return assaultValue * w.Raid
		case inSight:
			return 1.2 * w.Raid
		}
		return w.Raid
	}
	for _, e := range enemies {
		if e.CommandPost {
			continue // its own goal, above
		}
		if e.Building {
			add(goal{kind: raid, cell: e.Cell, target: e.ID}, raidValue(e, true))
		} else {
			add(goal{kind: kill, cell: e.Cell, target: e.ID}, 1.5*w.Aggression)
		}
	}
	known := false // a raider knows where a building is
	for _, id := range slices.Sorted(maps.Keys(ai.seen)) {
		b := s.squad(id)
		known = known || b.planetBuilding()
		if !s.visible[v.Side][id] && (cp == nil || id != cp.ID) {
			add(goal{kind: raid, cell: ai.seen[id], target: id}, raidValue(b, false))
		}
	}
	if raider && !known && cp != nil {
		// The buildings stand in the base: look for them round the Command Post.
		add(goal{kind: scout, cell: cp.Cell}, assaultValue*w.Raid)
	}
	if len(enemies) == 0 {
		// Toward where the enemy comes from, or else the middle of the map.
		at := Cell{s.Field.W / 2, s.Field.H / 2}
		if v.Side == Defender {
			in := inward[s.Edge]
			at = at.add(Cell{-in.X * s.Field.W / 4, -in.Y * s.Field.H / 4})
		}
		add(goal{kind: scout, cell: at}, 0.6*w.Scout)
	}
	if len(goals) == 0 {
		return
	}

	// Threat counts enemies seen lately, not only those in view now, and
	// armed buildings seen, out to their reach: a turret outranges infantry.
	threat := make([]float64, len(goals))
	for i, g := range goals {
		for _, id := range slices.Sorted(maps.Keys(ai.sighted)) {
			if sg := ai.sighted[id]; id != g.target && dist(sg.cell, g.cell) <= threatRadius {
				threat[i] += float64(sg.members)
			}
		}
		for _, id := range slices.Sorted(maps.Keys(ai.seen)) {
			if b := s.squad(id); id != g.target && b != nil && b.alive() && b.Armed && dist(ai.seen[id], g.cell) <= max(threatRadius, b.reach) {
				threat[i] += buildingThreat
			}
		}
	}
	strength := 0.0
	for _, sq := range own {
		strength += float64(len(sq.Members))
	}
	assigned := make([]float64, len(goals))
	on := make([][]*Squad, len(goals))
	need, members := make([]float64, len(goals)), make([]float64, len(goals))
	for i, g := range goals {
		need[i] = margin * w.Mass * threat[i]
		if g.kind == defend && v.Side == Defender { // an attacker holding a Landing Zone under fire isn't worth more for it
			// Worth leaving a quiet point for. Against Task Forces, at 2 the
			// attacker won 59% of Starting Kit Battles; at 3, 51%.
			values[i] *= 1 + 3*threat[i]/max(1, strength)
		}
	}
	// Urgency: the attacker's caution fades as the time cap nears, so a
	// stalled attack pushes rather than sitting out the clock on the points
	// it holds.
	caution := w.Caution
	if v.Side == Attacker {
		limit := float64(s.rules.TimeCap * s.TPS())
		caution *= max(0, 1-float64(s.Tick-s.Setup)/limit)
	}
	chose := map[int]Choice{}
	busy := map[int]bool{} // setup is for taking pads: jobs wait for the fighting
	if !s.setup() {
		busy = ai.assignRoles(v, own, enemies)
	}
	for _, sq := range own {
		if sq.speed == 0 || sq.retreating || busy[sq.ID] {
			continue
		}
		best, bestScore := -1, math.Inf(-1)
		var bestWhy factors
		current := ai.plans[sq.ID]
		for i, g := range goals {
			if g.target != 0 && s.tier(sq, s.squad(g.target)) == None {
				continue // it can't hurt that
			}
			if g.kind == takePad && s.setup() && (!s.Builders[v.Side] || !ai.backInTime(v, sq, g.cell)) {
				continue // no use to it yet, or it would still be out when the fighting starts
			}
			f := factors{value: values[i], dist: 1 + dist(sq.Cell, g.cell)/distScale, crowd: 1, matchup: 1, fear: 1, stick: 1}
			if !g.kind.forms() || len(on[i]) >= minForce && members[i] >= need[i] {
				f.crowd = 1 + assigned[i] // spread out, once a Task Force has what it needs
			}
			if g.target != 0 {
				f.matchup = matchup[s.tier(sq, s.squad(g.target))] // go after what it's good against
			}
			if g.kind != defend { // a threatened point is the one to hold, not to shy from
				f.fear = 1 + caution*threat[i]/max(1, strength)
			}
			if current != nil && current.goal.same(g) {
				f.stick = stickiness
			}
			score := f.value / f.dist / f.crowd * f.matchup / f.fear * f.stick
			if score > bestScore { // ties keep the earlier goal
				best, bestScore, bestWhy = i, score, f
			}
		}
		if best < 0 {
			continue
		}
		assigned[best]++
		if ai.thinking != nil {
			chose[sq.ID] = Choice{Squad: sq.ID, Goal: best, Score: bestScore, Why: bestWhy.why()}
		}
		if goals[best].kind.forms() {
			on[best] = append(on[best], sq)
			members[best] += float64(len(sq.Members))
		}
		if p := ai.plans[sq.ID]; p != nil && p.goal.same(goals[best]) {
			p.goal = goals[best]
			continue
		}
		ai.plans[sq.ID] = &plan{goal: goals[best]}
	}
	ai.form(v, goals, on)
	for _, tf := range ai.forces {
		ai.pickTarget(v, tf, enemies)
	}
	ai.think(v, goals, values, threat, need, assigned, chose)
}

// home is where a side falls back to: the Landing Zones it holds, and for
// the defender its Command Post.
func home(v View) []Cell {
	var at []Cell
	for _, p := range v.sim.Points {
		if p.Owner == v.Side {
			at = append(at, p.Cell)
		}
	}
	if cp := v.sim.commandPost(); v.Side == Defender && cp != nil && cp.alive() {
		at = append(at, cp.Cell)
	}
	return at
}

// backInTime is whether sq can walk into a pad's range, finish taking it,
// and walk on to the nearest point its side holds before the setup phase
// ends. Progress the side has made on the pad counts, so a squad partway
// through doesn't give up on it.
func (ai *AI) backInTime(v View, sq *Squad, pad Cell) bool {
	s := v.sim
	back := math.Inf(1)
	for _, c := range home(v) {
		back = min(back, dist(pad, c))
	}
	take := s.rules.CaptureSeconds
	for _, p := range s.Pads {
		if p.Cell == pad && p.Taker == v.Side {
			take -= float64(p.Progress) / float64(s.TPS())
		}
	}
	walk := (max(0, dist(sq.Cell, pad)-s.rules.CaptureRadius) + back) / max(sq.speed, 0.1)
	return walk+take <= float64(s.Setup-s.Tick)/float64(s.TPS())
}

// walkBeat sends an idle guard to the next stop on its beat round its point,
// so a garrison doesn't stand still: covered cells by the point, or else a
// spot each way. It goes only when it's settled on the point and the side
// knows of no enemy, and the usual plan brings it back once it has paused
// there. Walking beats with the enemy about got guards caught out.
func (ai *AI) walkBeat(v View, sq *Squad, p *plan) (Order, bool) {
	s := v.sim
	if len(p.steps) > 0 || len(sq.path) > 0 || dist(sq.Cell, p.goal.cell) > s.rules.CaptureRadius ||
		v.Tick()-max(p.beatAt, s.Setup) < beatEvery*v.sim.TPS() || (v.Tick()+sq.ID)%v.sim.TPS() != 0 { // the first one 8 s into the fighting
		return Order{}, false
	}
	if len(ai.sighted) > 0 {
		return Order{}, false // the enemy's been seen: stay put
	}
	var stops []Cell
	// Covered cells by the point if there are any, so it keeps its cover;
	// else a spot each way.
	for y := -beatReach; y <= beatReach; y++ {
		for x := -beatReach; x <= beatReach; x++ {
			c := p.goal.cell.add(Cell{x, y})
			if c != sq.Cell && dist(c, p.goal.cell) <= beatReach && !sq.air && s.standable(sq, c) && s.coverAt(c) < 0 {
				stops = append(stops, c)
			}
		}
	}
	if len(stops) == 0 {
		for _, d := range steps[:4] {
			for r := beatReach; r > 1; r-- {
				if c := p.goal.cell.add(d.scale(r)); s.standable(sq, c) {
					stops = append(stops, c)
					break
				}
			}
		}
	}
	if len(stops) == 0 {
		return Order{}, false
	}
	to := stops[p.beat%len(stops)]
	p.beat++
	p.beatAt = v.Tick()
	p.beatUntil = v.Tick() + int(dist(sq.Cell, to)/max(sq.speed, 0.1)*float64(v.sim.TPS())) + beatPause*v.sim.TPS()
	p.steps, p.sent = nil, false // back to the point afterwards
	return Order{Kind: Move, Squad: sq.ID, Cell: to}, true
}

// takePost moves a guard settled on its point to the best ground there, if
// that's clearly better than where it stands: see guardPost.
func (ai *AI) takePost(v View, sq *Squad, p *plan) (Order, bool) {
	s := v.sim
	if len(p.steps) > 0 || len(sq.path) > 0 || dist(sq.Cell, p.goal.cell) > s.rules.CaptureRadius ||
		(v.Tick()+sq.ID)%v.sim.TPS() != 0 {
		return Order{}, false
	}
	w := ai.weightsOf(sq).Cover
	best, ok := s.guardPost(sq, p.goal.cell, w)
	if !ok || s.postScore(sq, p.goal.cell, sq.Cell, w)+0.5 >= s.postScore(sq, p.goal.cell, best, w) {
		return Order{}, false
	}
	return Order{Kind: Move, Squad: sq.ID, Cell: best}, true
}

// guardPost is the best cell a guard can stand on within capture radius of
// its point, so it still holds it: see postScore. Where there's cover there
// and the guard cares for it, only covered cells will do, so a post never
// takes it out of cover: without cover, Covenant attacks on UNSC won 62%
// instead of 53%.
func (s *Sim) guardPost(sq *Squad, point Cell, cover float64) (Cell, bool) {
	r := s.rules.CaptureRadius
	_, covered := s.coverNear(sq, point, r)
	covered = covered && cover > 0 && !sq.air
	best, bestScore, found := Cell{}, math.Inf(-1), false
	for y := point.Y - int(r); y <= point.Y+int(r); y++ {
		for x := point.X - int(r); x <= point.X+int(r); x++ {
			c := Cell{x, y}
			if dist(c, point) > r || !s.standable(sq, c) || covered && s.coverAt(c) >= 0 {
				continue
			}
			if score := s.postScore(sq, point, c, cover); score > bestScore { // ties keep the first found
				best, bestScore, found = c, score, true
			}
		}
	}
	return best, found
}

// postScore rates a guard's cell: high ground most (a to-hit bonus and more
// Sight), then cover by the cover weight, then a little for the side of the
// point facing the attacker's edge. A flyer gets neither high ground nor
// cover, so only the facing counts.
func (s *Sim) postScore(sq *Squad, point, c Cell, cover float64) float64 {
	facing := float64(s.depth(s.Edge, point)-s.depth(s.Edge, c)) / max(s.rules.CaptureRadius, 1)
	if sq.air {
		return 0.5 * facing
	}
	return 2*float64(s.height(c)) - cover*float64(s.coverAt(c)) + 0.5*facing
}

// shooter is the enemy that fired on sq lately, if the side can see it:
// its muzzle flash shows it for a while.
func (ai *AI) shooter(v View, sq *Squad) *Squad {
	if sq.hitBy == 0 || v.Tick()-sq.hitAt > underFireSeconds*v.sim.TPS() {
		return nil
	}
	if e := v.sim.squad(sq.hitBy); e != nil && e.alive() && v.sim.visible[v.Side][e.ID] {
		return e
	}
	return nil
}

// foe is the enemy a squad should break off its plan for. A guard takes on
// an intruder on its leash, or a shooter it can hurt there, so it never
// leaves its point far behind. Any other squad takes on an armed building
// firing on it, such as a turret that outranges it, and keeps at it till
// it's dead or gone; enemy squads that fire on it are the Commander's call:
// chasing every shooter won Starting Kit attackers 70% of Battles, not 50%.
// A squad falling back runs rather than fights.
func (ai *AI) foe(v View, sq *Squad, p *plan, enemies []*Squad) *Squad {
	s := v.sim
	e := ai.shooter(v, sq)
	switch p.goal.kind {
	case fallback:
		return nil
	case defend:
		// A shooter it can reach a firing position on from its leash: one
		// that outranges it from just off the leash isn't left unanswered.
		if e != nil && s.tier(sq, e) != None && dist(e.Cell, p.goal.cell) <= leash*ai.weightsOf(sq).Aggression+sq.reach {
			return e
		}
		return ai.intruder(v, sq, p, enemies)
	}
	if e != nil && e.Building {
		return e
	}
	if e := s.squad(p.engaged); e != nil && e.Building && e.alive() && s.visible[v.Side][e.ID] && s.tier(sq, e) != None {
		return e // keep at it till it's dead or gone
	}
	return nil
}

// evade moves a squad clear of a shooter it can't hurt: to the nearest
// cell it can stand on past the shooter's reach.
func (ai *AI) evade(v View, sq *Squad, p *plan, e *Squad) []Order {
	s := v.sim
	if p.engaged == e.ID && len(sq.path) > 0 {
		return nil // on its way
	}
	p.engaged = e.ID
	best, found := Cell{}, false
	r := int(e.reach) + 3
	for y := sq.Cell.Y - r; y <= sq.Cell.Y+r; y++ {
		for x := sq.Cell.X - r; x <= sq.Cell.X+r; x++ {
			c := Cell{x, y}
			if dist(c, e.Cell) <= e.reach || !s.standable(sq, c) {
				continue
			}
			if !found || dist2(sq.Cell, c) < dist2(sq.Cell, best) {
				best, found = c, true
			}
		}
	}
	if !found {
		return nil
	}
	p.moveTo, p.sent = best, false
	return []Order{{Kind: Move, Squad: sq.ID, Cell: best}}
}

// intruder is the enemy a guarding squad should leave its point to fight:
// the one it's already fighting while that's still on the leash, or else,
// among those it can see and hurt within the leash of the point, the best
// matchup, then the nearest.
func (ai *AI) intruder(v View, sq *Squad, p *plan, enemies []*Squad) *Squad {
	s := v.sim
	reach := leash * ai.weightsOf(sq).Aggression
	onLeash := func(e *Squad) bool {
		return e.alive() && e.Armed && s.visible[v.Side][e.ID] && s.tier(sq, e) != None &&
			dist(e.Cell, p.goal.cell) <= reach
	}
	if e := s.squad(p.engaged); e != nil && onLeash(e) {
		return e
	}
	var best *Squad
	for _, e := range enemies {
		if onLeash(e) && (best == nil || cmp.Or(
			cmp.Compare(tierRank[s.tier(sq, e)], tierRank[s.tier(sq, best)]),
			cmp.Compare(dist2(sq.Cell, e.Cell), dist2(sq.Cell, best.Cell)),
		) < 0) {
			best = e
		}
	}
	return best
}

// engage has a guarding squad fight e: stop and fire if it's in range, or
// else move to a firing position on it, refreshed once a second.
func (ai *AI) engage(v View, sq *Squad, p *plan, e *Squad) []Order {
	s := v.sim
	fresh := p.engaged != e.ID
	p.engaged = e.ID
	standoff := s.standoff(sq, e)
	if s.canHit(sq, e) && dist(sq.Cell, e.Cell) > standoff {
		if len(sq.path) > 0 {
			return []Order{{Kind: Hold, Squad: sq.ID}}
		}
		return nil
	}
	if !fresh && len(sq.path) > 0 && (v.Tick()+sq.ID)%v.sim.TPS() != 0 {
		return nil
	}
	to, ok := s.firingPosition(sq, e.Cell, ai.weightsOf(sq).Cover, standoff)
	if s.canHit(sq, e) && (!ok || to == sq.Cell || dist(to, e.Cell) <= standoff) {
		if len(sq.path) > 0 {
			return []Order{{Kind: Hold, Squad: sq.ID}} // no room to back off: it holds and fires where it is
		}
		return nil
	}
	if !ok || to == sq.Cell || (!fresh && len(sq.path) > 0 && dist(p.moveTo, to) <= 2) {
		return nil
	}
	p.moveTo, p.sent = to, false // sent is for its plan's steps; this isn't one
	return []Order{{Kind: Move, Squad: sq.ID, Cell: to}}
}

// PadTurrets lists the Buildings that can go on a build pad, cheapest first
// (by their costs added up, ties by id): the order a garrison's AI buys
// them in.
func PadTurrets(c *cs.Content) []string {
	var turrets []string
	for _, id := range slices.Sorted(maps.Keys(c.Buildings)) {
		if b := c.Buildings[id]; b.PadTurret != nil && *b.PadTurret && b.Combat != nil {
			turrets = append(turrets, id)
		}
	}
	total := func(id string) int {
		n := 0
		for _, v := range c.Buildings[id].Cost {
			n += v
		}
		return n
	}
	slices.SortStableFunc(turrets, func(a, b string) int { return cmp.Compare(total(a), total(b)) })
	return turrets
}

// Affords is whether funds cover cost.
func Affords(funds, cost map[string]int) bool {
	for r, n := range cost {
		if funds[r] < n {
			return false
		}
	}
	return true
}

// build spends a side's own funds, which only a neutral garrison has, on
// a turret for each empty pad it holds: the cheapest it can afford. A
// player's money is theirs to spend, so their side never builds on its own.
func (ai *AI) build(v View) []Order {
	s := v.sim
	if s.Funds[v.Side] == nil {
		return nil
	}
	turrets := PadTurrets(s.content)
	left := maps.Clone(s.Funds[v.Side]) // spent pad by pad this tick
	affords := func(id string) bool { return Affords(left, s.content.Buildings[id].Cost) }
	var out []Order
	for i := range s.Pads {
		for _, id := range turrets {
			if s.CanBuild(v.Side, i, id) == nil && affords(id) {
				out = append(out, Order{Kind: Build, Target: i, Building: id})
				for r, n := range s.content.Buildings[id].Cost {
					left[r] -= n
				}
				break
			}
		}
	}
	return out
}

// look marks the blocks whose middles the side can see now.
func (ai *AI) look(v View, own []*Squad) {
	f := v.sim.Field
	bw, bh := (f.W+block-1)/block, (f.H+block-1)/block
	if ai.looked == nil {
		ai.looked = make([]int, bw*bh)
		for b := range ai.looked {
			ai.looked[b] = -staleCap * v.sim.TPS() // not seen yet: as stale as it gets
		}
	}
	for b := range ai.looked {
		mid := Cell{min(b%bw*block+block/2, f.W-1), min(b/bw*block+block/2, f.H-1)}
		for _, o := range own {
			if r := v.sim.sightOf(o); float64(dist2(o.Cell, mid)) <= r*r {
				ai.looked[b] = v.Tick()
				break
			}
		}
	}
}

// assignRoles gives out the Commander's jobs on top of the usual goals, and
// reports the squads it has a job for:
//   - scouts: the defender's few, preferring units tagged for it, then
//     small squads, then fast ones, roam to the parts of the map it has
//     looked at least lately;
//   - skirmishers: squads a side can spare from its points, preferring
//     units tagged for it, then fast ones, patrol between the points and
//     hunt enemies they meet that they're good against;
//   - a scout, or a skirmisher meeting more than it can take, falls back to
//     a point its side holds or a friend, then rests as an ordinary squad.
func (ai *AI) assignRoles(v View, own, enemies []*Squad) map[int]bool {
	s := v.sim
	w := ai.weights
	busy := map[int]bool{}
	var mobile []*Squad
	for _, sq := range own {
		if sq.speed > 0 && !sq.retreating {
			mobile = append(mobile, sq)
		}
	}

	// Squads already on a job: carry on, hunt, or fall back.
	for _, sq := range mobile {
		r := ai.roles[sq.ID]
		switch {
		case r == noRole:
			continue
		case r == fallingBack:
			p := ai.plans[sq.ID]
			if p == nil || p.goal.kind != fallback || dist(sq.Cell, p.goal.cell) <= closeEnough {
				delete(ai.roles, sq.ID) // safe: back to the usual goals, for a while
				ai.rested[sq.ID] = v.Tick()
				continue
			}
		case r == scouting && len(ai.sighted) > 0 && !ai.inContact(v, sq):
			// The enemy's found: back to the usual goals. Scouting on, a
			// Warthog roamed empty corners while its base fell (seed 246130).
			delete(ai.roles, sq.ID)
			delete(ai.plans, sq.ID)
			ai.rested[sq.ID] = v.Tick()
			continue
		case !ai.inContact(v, sq):
		case r == skirmish && ai.prey(v, sq, enemies) != nil:
			e := ai.prey(v, sq, enemies)
			if p := ai.plans[sq.ID]; p == nil || p.goal.kind != kill || p.goal.target != e.ID {
				ai.plans[sq.ID] = &plan{goal: goal{kind: kill, cell: e.Cell, target: e.ID}}
			}
		default:
			ai.roles[sq.ID] = fallingBack
			ai.plans[sq.ID] = &plan{goal: goal{kind: fallback, cell: ai.safety(v, sq)}}
		}
		busy[sq.ID] = true
	}

	count := func(r role) int {
		n := 0
		for _, sq := range mobile {
			if ai.roles[sq.ID] == r {
				n++
			}
		}
		return n
	}
	free := func() []*Squad {
		var out []*Squad
		for _, sq := range mobile {
			back, rested := ai.rested[sq.ID]
			if ai.roles[sq.ID] == noRole && (!rested || v.Tick()-back >= restSeconds*v.sim.TPS()) && !ai.inContact(v, sq) {
				out = append(out, sq)
			}
		}
		return out
	}
	tagged := func(sq *Squad, r string) int {
		if slices.Contains(sq.roles, r) {
			return 1
		}
		return 0
	}
	small := func(sq *Squad) int {
		if len(sq.Members) <= 2 {
			return 1
		}
		return 0
	}

	scouts := 0
	// A small force sends one scout out once: after it has fallen back, the
	// points need every squad more.
	scoutedOnce := len(ai.rested) > 0 && len(mobile) < minForRepeat
	if v.Side == Defender && len(mobile) >= minForScouts && w.Scout > 0 && !scoutedOnce && len(ai.sighted) == 0 {
		scouts = min(max(1, int(math.Round(float64(len(mobile))*scoutShare*w.Scout))), maxScouts, len(mobile)-1)
	}
	if want := scouts - count(scouting); want > 0 {
		cands := free()
		slices.SortStableFunc(cands, func(a, b *Squad) int {
			// Tagged scouts first; units tagged to skirmish only if nothing else fits.
			return cmp.Or(-cmp.Compare(tagged(a, "scout"), tagged(b, "scout")),
				cmp.Compare(tagged(a, "skirmisher"), tagged(b, "skirmisher")),
				-cmp.Compare(small(a), small(b)), -cmp.Compare(a.speed, b.speed), cmp.Compare(a.ID, b.ID))
		})
		for _, sq := range cands[:min(want, len(cands))] {
			ai.roles[sq.ID] = scouting
		}
	}

	// Squads it needs on the points: one per point for the defender, held or
	// to win back (counting only held ones sent squads skirmishing just as
	// points fell), and two per point for the attacker.
	need := len(s.Points)
	if v.Side == Attacker {
		need = 2 * len(s.Points)
	}
	spare := len(mobile) - need - scouts
	// A handful at most: they find and delay the enemy for the main force.
	skirmishers := min(spare, maxSkirmishers, max(1, int(math.Round(float64(len(mobile))*skirmishShare*w.Aggression))))
	if skirmishers <= 0 || w.Aggression <= 0 {
		skirmishers = 0
	}
	for i := len(mobile) - 1; i >= 0 && count(skirmish) > skirmishers; i-- {
		if sq := mobile[i]; ai.roles[sq.ID] == skirmish {
			delete(ai.roles, sq.ID) // too many now, say the force shrank: the newest go back
			delete(ai.plans, sq.ID)
		}
	}
	if want := skirmishers - count(skirmish); want > 0 {
		cands := free()
		slices.SortStableFunc(cands, func(a, b *Squad) int {
			return cmp.Or(-cmp.Compare(tagged(a, "skirmisher"), tagged(b, "skirmisher")),
				cmp.Compare(tagged(a, "scout"), tagged(b, "scout")),
				-cmp.Compare(a.speed, b.speed), cmp.Compare(a.ID, b.ID))
		})
		for _, sq := range cands[:min(want, len(cands))] {
			ai.roles[sq.ID] = skirmish
		}
	}

	// Send each squad on a job where it goes next.
	taken := map[Cell]bool{}
	stops := ai.stops(v)
	for _, sq := range mobile {
		p := ai.plans[sq.ID]
		switch ai.roles[sq.ID] {
		case scouting:
			busy[sq.ID] = true
			if p != nil && p.goal.kind == scout && dist(sq.Cell, p.goal.cell) > closeEnough {
				taken[p.goal.cell] = true
				continue // still on its way
			}
			if at, ok := ai.waypoint(v, sq, taken); ok {
				taken[at] = true
				ai.plans[sq.ID] = &plan{goal: goal{kind: scout, cell: at}}
			}
		case skirmish:
			busy[sq.ID] = true
			if p != nil && p.goal.kind == kill {
				continue // hunting
			}
			if len(stops) == 0 {
				continue
			}
			k := ai.round[sq.ID] % len(stops)
			if p != nil && p.goal.kind == patrol && dist(sq.Cell, p.goal.cell) <= closeEnough {
				k = (k + 1) % len(stops) // there: on to the next stop
			}
			ai.round[sq.ID] = k
			if p == nil || p.goal.kind != patrol || p.goal.cell != stops[k] {
				ai.plans[sq.ID] = &plan{goal: goal{kind: patrol, cell: stops[k]}}
			}
		}
	}
	return busy
}

// stops is a skirmisher's round: each Control Point and the halfway mark to
// the next, in order.
func (ai *AI) stops(v View) []Cell {
	pts := v.sim.Points
	var out []Cell
	for i, p := range pts {
		out = append(out, p.Cell)
		if len(pts) > 1 {
			q := pts[(i+1)%len(pts)].Cell
			out = append(out, Cell{(p.Cell.X + q.X) / 2, (p.Cell.Y + q.Y) / 2})
		}
	}
	return out
}

// prey is the enemy a skirmisher in contact should take on: in view and in
// its Sight, not one it's at a disadvantage against, and not outnumbering it
// badly; the best matchup first, then the nearest.
func (ai *AI) prey(v View, sq *Squad, enemies []*Squad) *Squad {
	s := v.sim
	r := s.sightOf(sq)
	var best *Squad
	for _, e := range enemies {
		t := s.tier(sq, e)
		if t == None || t == Disadvantage || float64(dist2(sq.Cell, e.Cell)) > r*r ||
			float64(len(e.Members)) > outnumbered*float64(len(sq.Members)) {
			continue
		}
		if best == nil || cmp.Or(
			cmp.Compare(tierRank[t], tierRank[s.tier(sq, best)]),
			cmp.Compare(dist2(sq.Cell, e.Cell), dist2(sq.Cell, best.Cell)),
		) < 0 {
			best = e
		}
	}
	return best
}

// safety is where a squad falls back to: the nearest point its side holds,
// or else the nearest friendly squad, or else where it is.
func (ai *AI) safety(v View, sq *Squad) Cell {
	at := home(v)
	if len(at) == 0 {
		for _, o := range ai.own {
			if o != sq && !o.Building && ai.roles[o.ID] == noRole {
				at = append(at, o.Cell)
			}
		}
	}
	if len(at) == 0 {
		return sq.Cell
	}
	return slices.MinFunc(at, func(a, b Cell) int {
		return cmp.Or(cmp.Compare(dist2(sq.Cell, a), dist2(sq.Cell, b)), cmp.Compare(v.sim.Field.index(a), v.sim.Field.index(b)))
	})
}

// inContact is whether an enemy the side has seen lately is in or near the
// squad's Sight.
func (ai *AI) inContact(v View, sq *Squad) bool {
	r := v.sim.sightOf(sq) + 2
	for _, sg := range ai.sighted {
		if float64(dist2(sq.Cell, sg.cell)) <= r*r {
			return true
		}
	}
	return false
}

// waypoint is the middle of the block a scout should look at next: the one
// looked at least lately, leaning toward the attacker's edge and against a
// long walk, and well clear of the side's own points, which it can see.
func (ai *AI) waypoint(v View, sq *Squad, taken map[Cell]bool) (Cell, bool) {
	s := v.sim
	f := s.Field
	bw := (f.W + block - 1) / block
	best, bestScore, found := Cell{}, math.Inf(-1), false
	for b, at := range ai.looked {
		mid := Cell{min(b%bw*block+block/2, f.W-1), min(b/bw*block+block/2, f.H-1)}
		reachable := sq.air || s.costsFor(sq.class)[f.index(mid)] > 0 && s.reachFor(sq.class)[f.index(mid)]
		if taken[mid] || !reachable ||
			slices.ContainsFunc(s.Points, func(p Point) bool { return dist(p.Cell, mid) < block }) {
			continue
		}
		stale := min(float64(v.Tick()-at)/float64(v.sim.TPS()), staleCap)
		toward := float64(max(f.W, f.H)-s.depth(s.Edge, mid)) / float64(max(f.W, f.H)) // 1 at the attacker's edge
		score := stale + 20*toward - dist(sq.Cell, mid)/max(sq.speed, 0.1)/2
		if score > bestScore { // ties keep the lower block
			best, bestScore, found = mid, score, true
		}
	}
	return best, found
}

// state reads a squad's facts now.
// arrival is how near its cell a squad must be to have reached g: a point
// or pad is reached only within the capture radius, where it counts.
func (s *Sim) arrival(g goal) float64 {
	if g.kind == scout || g.kind == patrol || g.kind == fallback || g.target != 0 {
		return closeEnough
	}
	return s.rules.CaptureRadius
}

func (ai *AI) state(v View, sq *Squad, g goal) facts {
	s := v.sim
	var f facts
	if dist(sq.Cell, g.cell) <= s.arrival(g) {
		f |= atGoal
	}
	if t := s.squad(g.target); t != nil && s.canHit(sq, t) {
		f |= inRange
		if dist(sq.Cell, t.Cell) > s.standoff(sq, t) {
			f |= atStandoff
		}
	}
	if s.coverAt(sq.Cell) < 0 && !sq.air {
		f |= inCover
	}
	for _, o := range ai.own {
		if o != sq && !o.Building && dist(o.Cell, sq.Cell) <= nearRadius {
			f |= nearFriendly
			break
		}
	}
	return f
}

func (s *Sim) coverAt(c Cell) int {
	return int(s.content.Terrains[s.Field.Terrains[s.Field.Terrain[s.Field.index(c)]]].Cover)
}

// want is the facts a goal asks for. Holding a point wants cover if the
// faction cares for it and there's some by the point; going after a target
// wants friends near when the squad is down to half strength.
func (ai *AI) want(v View, sq *Squad, g goal) facts {
	w := ai.weightsOf(sq)
	switch g.kind {
	case kill, raid, assault:
		want := inRange
		if t := v.sim.squad(g.target); t != nil && v.sim.standoff(sq, t) > 0 {
			want |= atStandoff // it kites this one
		}
		if len(sq.Members)*2 < sq.Start && w.Caution >= 1 {
			return want | nearFriendly
		}
		return want
	case defend:
		if w.Cover > 0 && !sq.air {
			if _, ok := v.sim.coverNear(sq, g.cell, v.sim.rules.CaptureRadius); ok {
				return atGoal | inCover
			}
		}
	}
	return atGoal
}

// replan finds the cheapest steps from the squad's facts now to its goal's:
// a search over the few states its facts make, at most 4 steps deep. Ties
// go to the action declared first.
func (ai *AI) replan(v View, sq *Squad, p *plan) {
	start, want := ai.state(v, sq, p.goal), ai.want(v, sq, p.goal)
	w := ai.weightsOf(sq)
	speed := max(sq.speed, 0.1)
	travel := func(to Cell) float64 { return dist(sq.Cell, to) / speed }
	type node struct {
		f     facts
		cost  float64
		steps []action
	}
	open := []node{{f: start}}
	best := map[facts]float64{start: 0}
	var found *node
	for len(open) > 0 {
		slices.SortStableFunc(open, func(a, b node) int { return cmp.Compare(a.cost, b.cost) })
		n := open[0]
		open = open[1:]
		if n.f&want == want {
			found = &n
			break
		}
		if len(n.steps) == 4 {
			continue
		}
		for _, a := range []action{goTo, approach, takeCover, regroup, keepDistance} {
			f, cost, ok := n.f, 0.0, true
			switch a {
			case goTo:
				f, cost = (f|atGoal)&^inCover, travel(p.goal.cell)
			case approach:
				ok = p.goal.target != 0
				f, cost = (f|inRange)&^inCover, max(0, dist(sq.Cell, p.goal.cell)-sq.reach)/speed
			case takeCover:
				_, ok = v.sim.coverNear(sq, sq.Cell, nearRadius)
				f, cost = f|inCover, 2/max(w.Cover, 0.1)
			case regroup:
				f, cost = (f|nearFriendly)&^(inCover|atGoal), 3/max(w.Caution, 0.1)
			case keepDistance:
				t := v.sim.squad(p.goal.target)
				ok = t != nil && v.sim.standoff(sq, t) > 0
				f, cost = (f|inRange|atStandoff)&^inCover, 1+max(0, dist(sq.Cell, p.goal.cell)-sq.reach)/speed
			}
			if !ok || f == n.f {
				continue
			}
			c := n.cost + cost
			if old, seen := best[f]; seen && old <= c {
				continue
			}
			best[f] = c
			open = append(open, node{f: f, cost: c, steps: append(slices.Clone(n.steps), a)})
		}
	}
	steps := []action{}
	if found != nil {
		steps = found.steps
	}
	// The same next step keeps where it was sent: re-sending costs a path.
	if len(steps) == 0 || len(p.steps) == 0 || steps[0] != p.steps[0] {
		p.sent = false
	}
	p.steps, p.members = steps, len(sq.Members)
}

// execute carries out a squad's plan: it drops steps whose effect already
// holds, then sends the squad where the next one needs it. With nothing
// left to do it stops and fires at what's in range.
func (ai *AI) execute(v View, sq *Squad, p *plan) []Order {
	now := ai.state(v, sq, p.goal)
	effect := map[action]facts{goTo: atGoal, approach: inRange, takeCover: inCover, regroup: nearFriendly, keepDistance: atStandoff}
	for len(p.steps) > 0 && now&effect[p.steps[0]] != 0 {
		p.steps, p.sent = p.steps[1:], false
	}
	if len(p.steps) == 0 {
		if len(sq.path) > 0 {
			return []Order{{Kind: Hold, Squad: sq.ID}}
		}
		return nil
	}
	// On its way: look again only on its slot each second, as each new
	// destination costs a path.
	if p.sent && len(sq.path) > 0 && (v.Tick()+sq.ID)%v.sim.TPS() != 0 {
		return nil
	}
	to, ok := ai.cellFor(v, sq, p)
	// Stopped short (a crowd round the cell halts a move within closeEnough):
	// sent again unless that's near enough for the goal.
	near := min(closeEnough, v.sim.arrival(p.goal))
	if !ok || (p.sent && dist(p.moveTo, to) <= 2 && (len(sq.path) > 0 || dist(sq.Cell, to) <= near)) {
		return nil
	}
	p.moveTo, p.sent = to, true
	return []Order{{Kind: Move, Squad: sq.ID, Cell: to}}
}

// cellFor is where a squad's next step sends it.
func (ai *AI) cellFor(v View, sq *Squad, p *plan) (Cell, bool) {
	s := v.sim
	switch p.steps[0] {
	case approach:
		return s.firingPosition(sq, p.goal.cell, ai.weightsOf(sq).Cover, 0)
	case keepDistance:
		standoff := 0.0
		if t := s.squad(p.goal.target); t != nil {
			standoff = s.standoff(sq, t)
		}
		return s.firingPosition(sq, p.goal.cell, ai.weightsOf(sq).Cover, standoff)
	case takeCover:
		return s.coverNear(sq, sq.Cell, nearRadius)
	case regroup:
		var near []Cell
		for _, o := range ai.own {
			if o != sq && !o.Building {
				near = append(near, o.Cell)
			}
		}
		if len(near) == 0 {
			return Cell{}, false
		}
		return slices.MinFunc(near, func(a, b Cell) int {
			return cmp.Or(cmp.Compare(dist2(sq.Cell, a), dist2(sq.Cell, b)), cmp.Compare(s.Field.index(a), s.Field.index(b)))
		}), true
	}
	return p.goal.cell, true
}

// standable is whether sq could stop on c: in bounds, its ground, and free.
func (s *Sim) standable(sq *Squad, c Cell) bool {
	f := s.Field
	if c.X < 0 || c.Y < 0 || c.X >= f.W || c.Y >= f.H {
		return false
	}
	i := f.index(c)
	if s.costsFor(sq.class)[i] == 0 || (!sq.air && !s.reachFor(sq.class)[i]) {
		return false
	}
	id := s.layer(sq)[i]
	return id == 0 || id == sq.ID
}

// coverNear is the covered cell within radius of around that's nearest the
// squad, if any.
func (s *Sim) coverNear(sq *Squad, around Cell, radius float64) (Cell, bool) {
	best, found := Cell{}, false
	r := int(radius)
	for y := around.Y - r; y <= around.Y+r; y++ {
		for x := around.X - r; x <= around.X+r; x++ {
			c := Cell{x, y}
			if dist(c, around) > radius || !s.standable(sq, c) || s.coverAt(c) >= 0 {
				continue
			}
			if !found || dist2(sq.Cell, c) < dist2(sq.Cell, best) {
				best, found = c, true
			}
		}
	}
	return best, found
}

// firingPosition is a cell in range of target that the squad can stand on,
// trading the walk there against high ground and cover by the cover weight.
// With a standoff, a cell further than that from the target comes first, if
// there is one: room to back off from one it kites.
func (s *Sim) firingPosition(sq *Squad, target Cell, cover, standoff float64) (Cell, bool) {
	type pick struct {
		c     Cell
		score float64
		found bool
	}
	anywhere, past := pick{score: math.Inf(1)}, pick{score: math.Inf(1)} // past: beyond the standoff
	r := int(sq.reach)
	for y := target.Y - r; y <= target.Y+r; y++ {
		for x := target.X - r; x <= target.X+r; x++ {
			c := Cell{x, y}
			d := dist(c, target)
			if d > sq.reach || d < sq.minRange || !s.standable(sq, c) {
				continue
			}
			score := dist(sq.Cell, c)
			if !sq.air {
				score -= cover * (2*float64(s.height(c)-s.height(target)) - float64(s.coverAt(c)))
			}
			if score < anywhere.score {
				anywhere = pick{c, score, true}
			}
			if standoff > 0 && d > standoff && score < past.score {
				past = pick{c, score, true}
			}
		}
	}
	if past.found {
		return past.c, true
	}
	return anywhere.c, anywhere.found
}

// standoff is how far from e, in cells, sq should fire from: beyond e's
// reach, against an armed enemy that can hurt it and that it outranges and
// outruns, so it can fire and back off as e closes. 0: it doesn't kite e.
func (s *Sim) standoff(sq, e *Squad) float64 {
	if e.Armed && e.speed > 0 && sq.speed > e.speed && sq.reach > e.reach && s.tier(e, sq) != None {
		return e.reach
	}
	return 0
}
