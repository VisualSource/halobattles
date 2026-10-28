// Package content loads, merges, validates and hashes Mods.
package content

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/VisualSource/halobattles/server/internal/gen/contentschema"
	"github.com/santhosh-tekuri/jsonschema/v6"
	"github.com/tailscale/hujson"
	"golang.org/x/text/language"
	"golang.org/x/text/message"
)

// Content is the merged content of every enabled Mod.
type Content struct {
	Doc  contentschema.Content
	JSON []byte // Doc as served: kind → id → definition
	Hash string // hex SHA-256 of JSON
}

type kind struct {
	schema string // the schema its definitions follow
	label  string // for messages
}

// kinds maps each data/<kind> folder, which is also its key in Content.
var kinds = map[string]kind{
	"resources":      {"resource.schema.json", "Resource"},
	"rulesets":       {"ruleset.schema.json", "Ruleset"},
	"factions":       {"faction.schema.json", "Faction"},
	"units":          {"unit.schema.json", "Unit"},
	"buildings":      {"building.schema.json", "Building"},
	"unitClasses":    {"unit-class.schema.json", "Unit Class"},
	"weaponTypes":    {"weapon-type.schema.json", "Weapon Type"},
	"planetTypes":    {"planet-type.schema.json", "Planet Type"},
	"maps":           {"map.schema.json", "Map"},
	"terrains":       {"terrain.schema.json", "Terrain"},
	"terrainPresets": {"terrain-preset.schema.json", "Terrain Preset"},
}

// Problems lists every content error found. Manifest and dependency
// problems stop the load, since content can't be merged without an order;
// every content problem after that is reported together.
type Problems []string

func (p Problems) Error() string {
	return fmt.Sprintf("content has %d problem(s):\n  %s", len(p), strings.Join(p, "\n  "))
}

type loader struct {
	schemas map[string]*jsonschema.Schema
	errs    Problems
}

func (l *loader) fail(format string, args ...any) {
	l.errs = append(l.errs, fmt.Sprintf(format, args...))
}

// Load reads the Mods in dirs (each folder named after its Mod) and returns
// their merged content, or Problems listing everything wrong with it.
func Load(dirs []string) (*Content, error) {
	schemas, err := compileSchemas()
	if err != nil {
		return nil, err
	}
	l := &loader{schemas: schemas}

	mods := l.readManifests(dirs)
	if l.errs != nil {
		return nil, l.errs
	}
	mods = l.order(mods)
	if l.errs != nil {
		return nil, l.errs
	}
	doc, sources := l.merge(mods)

	// A definition that fails its schema is dropped, and references to it
	// aren't reported again as unknown.
	broken := map[string]bool{}
	for _, k := range slices.Sorted(maps.Keys(doc)) {
		for _, id := range slices.Sorted(maps.Keys(doc[k])) {
			key := k + " " + id
			if !l.validate(kinds[k].schema, doc[k][id], fmt.Sprintf("%s %s (from %s)", k, id, strings.Join(sources[key], ", "))) {
				delete(doc[k], id)
				broken[key] = true
			}
		}
	}

	c := &Content{}
	if c.JSON, err = json.Marshal(doc); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(c.JSON, &c.Doc); err != nil {
		return nil, err
	}
	l.crossCheck(&c.Doc, doc, broken, mods)
	if l.errs != nil {
		return nil, l.errs
	}
	sum := sha256.Sum256(c.JSON)
	c.Hash = hex.EncodeToString(sum[:])
	return c, nil
}

type file struct {
	path string // for messages: mod/data/kind/name.jsonc
	kind string
	obj  map[string]any
}

// merge applies every Mod in order: its definitions and replacements first,
// then its Patches.
func (l *loader) merge(mods []*mod) (map[string]map[string]map[string]any, map[string][]string) {
	doc := map[string]map[string]map[string]any{}
	for kind := range kinds {
		doc[kind] = map[string]map[string]any{}
	}
	sources := map[string][]string{}

	for _, m := range mods {
		files := l.readData(m)
		for _, f := range files {
			if _, isPatch := f.obj["patch"]; isPatch {
				continue
			}
			id, _ := f.obj["id"].(string)
			if id == "" {
				l.fail("%s: missing \"id\"", f.path)
				continue
			}
			id = qualify(id, m.Name)
			replace, _ := f.obj["replace"].(bool)
			delete(f.obj, "replace")
			delete(f.obj, "$schema")
			_, exists := doc[f.kind][id]
			switch {
			case replace && !exists:
				l.fail("%s: replaces %s, which doesn't exist", f.path, id)
				continue
			case !replace && exists:
				l.fail("%s: redefines %s; add \"replace\": true or write a Patch", f.path, id)
				continue
			case !replace && namespace(id) != m.Name:
				l.fail("%s: defines %s outside its own namespace %q", f.path, id, m.Name)
				continue
			}
			f.obj["id"] = id
			resolveRefs(f.kind, f.obj, m.Name)
			doc[f.kind][id] = f.obj
			sources[f.kind+" "+id] = append(sources[f.kind+" "+id], f.path)
		}
		for _, f := range files {
			target, isPatch := f.obj["patch"]
			if !isPatch {
				continue
			}
			id, _ := target.(string)
			if id == "" {
				l.fail("%s: \"patch\" must be an id", f.path)
				continue
			}
			id = qualify(id, m.Name)
			existing, exists := doc[f.kind][id]
			if !exists {
				l.fail("%s: patches %s, which doesn't exist", f.path, id)
				continue
			}
			delete(f.obj, "patch")
			delete(f.obj, "$schema")
			if _, has := f.obj["id"]; has {
				l.fail("%s: a Patch can't change \"id\"", f.path)
				continue
			}
			if _, has := f.obj["replace"]; has {
				l.fail("%s: a Patch can't \"replace\"; drop \"patch\" to replace the whole definition", f.path)
				continue
			}
			resolveRefs(f.kind, f.obj, m.Name)
			doc[f.kind][id] = mergePatch(existing, f.obj).(map[string]any)
			sources[f.kind+" "+id] = append(sources[f.kind+" "+id], f.path)
		}
	}
	return doc, sources
}

func (l *loader) readData(m *mod) []file {
	entries, err := os.ReadDir(filepath.Join(m.dir, "data"))
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		l.fail("%s/data: %v", m.Name, err)
		return nil
	}
	var files []file
	for _, e := range entries {
		if _, known := kinds[e.Name()]; !known || !e.IsDir() {
			l.fail("%s/data/%s: unknown content kind (expected one of %s)", m.Name, e.Name(), strings.Join(slices.Sorted(maps.Keys(kinds)), ", "))
			continue
		}
		paths, _ := filepath.Glob(filepath.Join(m.dir, "data", e.Name(), "*.jsonc"))
		for _, p := range paths {
			name := m.Name + "/data/" + e.Name() + "/" + filepath.Base(p)
			obj, err := readJSONC(p)
			if err != nil {
				l.fail("%s: %v", name, err)
				continue
			}
			files = append(files, file{path: name, kind: e.Name(), obj: obj})
		}
	}
	return files
}

func qualify(id, modName string) string {
	if strings.Contains(id, ":") {
		return id
	}
	return modName + ":" + id
}

func namespace(id string) string {
	ns, _, _ := strings.Cut(id, ":")
	return ns
}

// mergePatch applies an RFC 7396 JSON Merge Patch: null deletes a field,
// objects merge recursively, anything else (arrays included) replaces.
func mergePatch(target, patch any) any {
	p, ok := patch.(map[string]any)
	if !ok {
		return patch
	}
	t, _ := target.(map[string]any)
	out := maps.Clone(t)
	if out == nil {
		out = map[string]any{}
	}
	for k, v := range p {
		if v == nil {
			delete(out, k)
		} else {
			out[k] = mergePatch(out[k], v)
		}
	}
	return out
}

func readJSONC(path string) (map[string]any, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	std, err := hujson.Standardize(raw)
	if err != nil {
		return nil, err
	}
	var obj map[string]any
	if err := json.Unmarshal(std, &obj); err != nil {
		return nil, err
	}
	if obj == nil {
		return nil, errors.New("must be a JSON object")
	}
	return obj, nil
}

func roundTrip(in, out any) error {
	b, err := json.Marshal(in)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, out)
}

const schemaBase = "file:///schema/"

func compileSchemas() (map[string]*jsonschema.Schema, error) {
	c := jsonschema.NewCompiler()
	c.DefaultDraft(jsonschema.Draft7)
	names, err := fs.Glob(contentschema.Files, "*.schema.json")
	if err != nil {
		return nil, err
	}
	for _, name := range names {
		f, err := contentschema.Files.Open(name)
		if err != nil {
			return nil, err
		}
		doc, err := jsonschema.UnmarshalJSON(f)
		f.Close()
		if err != nil {
			return nil, fmt.Errorf("%s: %w", name, err)
		}
		if err := c.AddResource(schemaBase+name, doc); err != nil {
			return nil, err
		}
	}
	out := map[string]*jsonschema.Schema{}
	for _, name := range names {
		if out[name], err = c.Compile(schemaBase + name); err != nil {
			return nil, err
		}
	}
	return out, nil
}

var printer = message.NewPrinter(language.English)

// validate checks v against a schema, recording one problem per failing leaf.
func (l *loader) validate(schema string, v any, where string) bool {
	err := l.schemas[schema].Validate(v)
	if err == nil {
		return true
	}
	var ve *jsonschema.ValidationError
	if !errors.As(err, &ve) {
		l.fail("%s: %v", where, err)
		return false
	}
	var walk func(e *jsonschema.ValidationError)
	walk = func(e *jsonschema.ValidationError) {
		if len(e.Causes) == 0 {
			l.fail("%s: at /%s: %s", where, strings.Join(e.InstanceLocation, "/"), e.ErrorKind.LocalizedString(printer))
		}
		for _, c := range e.Causes {
			walk(c)
		}
	}
	walk(ve)
	return false
}
