package content

import (
	"fmt"
	"path/filepath"
	"regexp"
	"sort"

	"github.com/VisualSource/halobattles/server/internal/gen/contentschema"
	"golang.org/x/mod/semver"
)

type mod struct {
	contentschema.ModManifest
	dir  string
	deps []dep
}

// dep is one Factorio-style dependency: "base >= 1.0", "? foo", "! bar".
type dep struct {
	kind              string // "", "?" (optional) or "!" (incompatible)
	name, op, version string
}

var depRe = regexp.MustCompile(`^([?!])? *([a-z0-9_-]+)(?: *(<=|>=|<|=|>) *([0-9]+(?:\.[0-9]+){0,2}))?$`)

func (l *loader) readManifests(dirs []string) []*mod {
	var mods []*mod
	seen := map[string]bool{}
	for _, dir := range dirs {
		if abs, err := filepath.Abs(dir); err == nil {
			dir = abs // so "." still has a folder name
		}
		file := filepath.Join(dir, "mod.jsonc")
		obj, err := readJSONC(file)
		if err != nil {
			l.fail("%s: %v", filepath.ToSlash(file), err)
			continue
		}
		if !l.validate("mod.schema.json", obj, filepath.Base(dir)+"/mod.jsonc") {
			continue
		}
		m := &mod{dir: dir}
		if err := roundTrip(obj, &m.ModManifest); err != nil {
			l.fail("%s/mod.jsonc: %v", filepath.Base(dir), err)
			continue
		}
		if m.Name != filepath.Base(dir) {
			l.fail("%s/mod.jsonc: name %q must match its folder name", filepath.Base(dir), m.Name)
			continue
		}
		if seen[m.Name] {
			l.fail("Mod %s is enabled twice", m.Name)
			continue
		}
		seen[m.Name] = true
		for _, s := range m.Dependencies {
			g := depRe.FindStringSubmatch(s)
			if g == nil {
				l.fail("%s/mod.jsonc: bad dependency %q", m.Name, s)
				continue
			}
			m.deps = append(m.deps, dep{kind: g[1], name: g[2], op: g[3], version: g[4]})
		}
		mods = append(mods, m)
	}
	return mods
}

// order checks dependencies and sorts mods: base first, then by dependency
// depth, then by name.
func (l *loader) order(mods []*mod) []*mod {
	byName := map[string]*mod{}
	for _, m := range mods {
		byName[m.Name] = m
	}
	if byName["base"] == nil {
		l.fail("the base Mod must be enabled")
	}
	for _, m := range mods {
		for _, d := range m.deps {
			other := byName[d.name]
			switch {
			case d.kind == "!" && other != nil:
				l.fail("%s is incompatible with %s", m.Name, d.name)
			case d.kind == "" && other == nil:
				l.fail("%s requires %s, which is not enabled", m.Name, d.name)
			case d.kind != "!" && other != nil && d.op != "" && !satisfies(other.Version, d.op, d.version):
				l.fail("%s requires %s %s %s, but %s is %s", m.Name, d.name, d.op, d.version, d.name, other.Version)
			}
		}
	}

	depths := map[string]int{}
	cycle := false
	var depth func(m *mod, visiting map[string]bool) int
	depth = func(m *mod, visiting map[string]bool) int {
		if d, ok := depths[m.Name]; ok {
			return d
		}
		if visiting[m.Name] {
			if !cycle {
				l.fail("dependency cycle through %s", m.Name)
				cycle = true
			}
			return 0
		}
		visiting[m.Name] = true
		d := 0
		for _, dp := range m.deps {
			if other := byName[dp.name]; other != nil && dp.kind != "!" {
				d = max(d, depth(other, visiting)+1)
			}
		}
		depths[m.Name] = d
		return d
	}
	for _, m := range mods {
		depth(m, map[string]bool{})
	}

	sorted := append([]*mod(nil), mods...)
	sort.SliceStable(sorted, func(i, j int) bool {
		a, b := sorted[i], sorted[j]
		if (a.Name == "base") != (b.Name == "base") {
			return a.Name == "base"
		}
		if depths[a.Name] != depths[b.Name] {
			return depths[a.Name] < depths[b.Name]
		}
		return a.Name < b.Name
	})
	return sorted
}

func satisfies(have, op, want string) bool {
	c := semver.Compare("v"+have, "v"+want)
	switch op {
	case "<":
		return c < 0
	case "<=":
		return c <= 0
	case "=":
		return c == 0
	case ">=":
		return c >= 0
	case ">":
		return c > 0
	}
	panic(fmt.Sprintf("unknown dependency operator %q", op))
}
