CREATE TABLE IF NOT EXISTS users (
    steamid TEXT, 
    profile TEXT, 
    avatar_full TEXT,
    avatar_default TEXT,
    avatar_medium TEXT, 
    displayname TEXT, 
    created TIMESTAMP
);

CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY, 
    name TEXT, 
    icon TEXT, 
    unit_cap INTEGER DEFAULT 1, 
    leader_cap INTEGER DEFAULT -1, 
    max_unique INTEGER DEFAULT -1,
    supplies INTEGER DEFAULT 1, 
    energy INTEGER DEFAULT 1, 
    health INTEGER DEFAULT 0, 
    armor INTEGER DEFAULT 0, 
    shield INTEGER DEFAULT 0,
    damage INTEGER DEFAULT 0,
    weapon_type TEXT DEFAULT 'kinetic',
    unit_type TEXT DEFAULT 'infantry',
    stat TEXT DEFAULT 'g:0,i:0,a:0,e:0',
    attributes TEXT DEFAULT '[]',
    requires TEXT DEFAULT '[]',
    faction TEXT DEFAULT 'UNSC',
    build_time INTEGER DEFAULT 10
);

CREATE TABLE IF NOT EXISTS buildings ( 
    id TEXT PRIMARY KEY,
    name TEXT,
    icon TEXT,
    description TEXT,
    faction TEXT DEFAULT 'UNSC',
    max_local_instances INTEGER DEFAULT -1,
    max_global_instances INTEGER DEFAULT -1,
    requires TEXT DEFAULT '[]',
    supplies INTEGER DEFAULT 0,
    energy INTEGER DEFAULT 0,
    upkeep_energy INTEGER DEFAULT 0,
    upkeep_supplies INTEGER DEFAULT 0,
    attributes TEXT DEFAULT '[]',
    stat TEXT DEFAULT 'g:0,i:0,a:0,e:0', 
    weapon_type TEXT DEFAULT 'none',
    shield INTEGER DEFAULT 0,
    health INTEGER DEFAULT 100,
    armor INTEGER DEFAULT 0,
    damage INTEGER DEFAULT 0,
    build_time INTEGER DEFAULT 10
);