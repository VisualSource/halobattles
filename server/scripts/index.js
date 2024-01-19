import {
  intro,
  select,
  spinner,
  group,
  text,
  cancel,
  confirm,
} from "@clack/prompts";
import sqlite3 from "sqlite3";
import { z } from "zod";

const db = new sqlite3.Database("./db/units.db");

const schema = z.object({
  $id: z.string().regex(/.+_.+_\d\d\d?/),
  $name: z
    .string()
    .min(1)
    .refine((arg) => arg.trim()),
  $icon: z
    .string()
    .url()
    .refine((arg) => arg.trim()),
  $unit_cap: z.coerce.number().min(1).optional().default(1),
  $leader_cap: z.coerce.number().min(0).optional().default(0),
  $max_unique: z.coerce.number().min(-1).optional().default(-1),
  $supplies: z.coerce.number().min(1),
  $energy: z.coerce.number().min(1),
  $health: z.coerce.number().min(0),
  $armor: z.coerce.number().min(0),
  $shield: z.coerce.number().min(0),
  $damage: z.coerce.number().min(0),
  $requires: z
    .array(z.string())
    .transform((e) => JSON.stringify(e))
    .default("[]"),
  $faction: z
    .enum(["UNCS", "BANISHED", "COVENANT", "FORERUNNER"])
    .optional()
    .default("UNSC"),
  $weapon_type: z
    .enum(["kinetic", "plasma", "hardlight", "fire", "cryo"])
    .default("kinetic"),
  $stat: z.string().default("g:0,i:0,a:0,e:0"),
  $unit_type: z.enum(["infantry", "vehicle", "ground", "enplacement"]),
  $attributes: z
    .string()
    .optional()
    .transform((e) => {
      if (!e) return "";
      return e.trim();
    }),
});

/**
 * @param {{ key?: string, message: string, required?: string, error: { message: string, min?: number, max?: number } }} opts
 * @return {*}
 */
const validateNumber =
  (opts) =>
  ({ results }) => {
    if (opts.required && !results[opts.required]) return null;

    let initialValue = undefined;
    if (opts.key) {
      initialValue = results.copy ? results.copy[opts.key] : undefined;
    }

    return text({
      message: opts.message,
      initialValue,
      defaultValue: 0,
      validate: (value) => {
        if (!value.length) return "A value is required";
        const r = z.coerce
          .number({ required_error: opts.error.message })
          .max(opts.error?.max ?? Number.MAX_SAFE_INTEGER)
          .min(opts.error?.min ?? 0)
          .safeParse(value);
        if (!r.success) {
          return r.error.errors[0].message ?? "Unknown error";
        }
      },
    });
  };

const boolean = (message) => () =>
  select({
    message,
    options: [
      { value: true, label: "Yes" },
      { value: false, label: "No" },
    ],
  });

/**
 *
 * @param {{ key?: string, message: string, defaultValue?: string }} opts
 * @param {{ label: string; value: unknown }[]} options
 * @returns
 */
const inhertedSelect =
  (opts, options) =>
  ({ results }) => {
    let initialValue = undefined;
    if (opts?.key) {
      initialValue = results.copy
        ? results.copy[opts.key] ?? opts.defaultValue
        : opts.defaultValue;
    }
    return select({
      initialValue,
      message: opts.message,
      options,
    });
  };

/**
 *
 * @param {{ message: string, key: string, index: number }} opts
 * @returns
 */
const strengths = (opts) => {
  return ({ results }) => {
    let initialValue = 0;
    if (results.copy) {
      const item = results.copy.stat.split(",")[opts.index] ?? "0";
      initialValue = parseInt(item.split(":")[1] ?? "0");
    }

    return select({
      initialValue,
      options: [
        { value: 0, label: "Gray: Unit can't attack this type" },
        { value: 1, label: "Red: Below Avg. Vs." },
        { value: 2, label: "Yellow: Average vs." },
        { value: 3, label: "Green: Strong vs" },
      ],
      message: opts.message,
    });
  };
};

const make_unit = function () {
  return group(
    {
      copyUnit: boolean("Copy a unit"),
      copy: async ({ results }) => {
        if (!results.copyUnit) return null;
        /**
         * @type {{ name: string }[]}
         */
        const units = await new Promise((rel, rej) =>
          db.all("SELECT * FROM units", (err, rows) => {
            if (err) return rej(err);
            rel(rows);
          })
        ).catch(() => []);
        units.push({ name: "Empty Unit" });
        return select({
          message: "Select Unit",
          options: units.map((i) => ({ value: i, label: i.name })),
        });
      },
      $id: ({ results }) =>
        text({
          message: "Unit Id",
          initialValue: results.copy ? results?.copy?.id : undefined,
          validate: (e) => {
            if (!e.match(/.+_.+_\d\d\d?/)) {
              return "Enter id in format of 'VALUE_VALUE_00'";
            }
          },
        }),
      $name: ({ results }) =>
        text({
          message: "Unit name",
          initialValue: results.copy ? results?.copy?.name : undefined,
          validate: (e) => {
            if (e.length < 1) return "Enter a longer value.";
          },
        }),
      $icon: ({ results }) =>
        text({
          message: "Unit Icon",
          initialValue: results.copy ? results?.copy?.icon : undefined,
          validate: (value) => {
            const a = z.string().url().safeParse(value);
            if (!a.success) {
              return a.error.errors[0].message;
            }
          },
        }),
      $health: validateNumber({
        key: "health",
        message: "Unit Heath",
        error: {
          min: 0,
          message: "A number for heath is required.",
        },
      }),
      $armor: validateNumber({
        key: "armor",
        message: "Unit Armor",
        error: {
          min: 0,
          message: "A Number for armor is required.",
        },
      }),
      $shield: validateNumber({
        key: "shield",
        message: "Unit Shield",
        error: {
          min: 0,
          message: "A number for shield is required",
        },
      }),
      $supplies: validateNumber({
        key: "supplies",
        message: "Supplies",
        error: {
          message: "A value for supplies is required",
          min: 1,
        },
      }),
      $energy: validateNumber({
        key: "energy",
        message: "Energy",
        error: {
          message: "A value for energy is required",
          min: 1,
        },
      }),
      useUnitCap: boolean("Does unit use the unit cap"),
      $unit_cap: validateNumber({
        key: "unit_cap",
        message: "Unit Cap",
        required: "useUnitCap",
        error: { message: "A value for unit cap is required", min: 0 },
      }),
      useLeaderCap: boolean("Does unit use the leader cap"),
      $leader_cap: validateNumber({
        key: "leader_cap",
        message: "Leader Cap",
        required: "useLeaderCap",
        error: { message: "A value for leader cap is required.", min: 0 },
      }),
      $max_unique: validateNumber({
        key: "max_unique",
        message: "Max Unique Units (unlimited is -1)",
        error: { min: -1, message: "A value for max unique is required." },
      }),
      $weapon_type: inhertedSelect(
        { key: "weapon_type", defaultValue: "kinetic", message: "Weapon Type" },
        [
          { value: "kinetic", label: "Kinetic" },
          { value: "plasma", label: "Plasma" },
          { value: "hardlight", label: "Hardlight" },
          { value: "fire", label: "Fire" },
          { value: "cryo", label: "Cryo" },
        ]
      ),
      $damage: validateNumber({
        key: "damage",
        message: "Unit Damage",
        error: { min: 0, message: "A value is required for damage" },
      }),
      $unit_type: inhertedSelect(
        { key: "unit_type", defaultValue: "infantry", message: "Unit Type" },
        [
          { value: "infantry", label: "Infantry" },
          { value: "air", label: "Air Vehicle" },
          { value: "ground", label: "Ground Vehicle" },
          { value: "enplacement", label: "Enplacement" },
        ]
      ),

      $attributes: ({ results }) =>
        text({
          initialValue: results.copy
            ? results.copy?.attributes ?? undefined
            : undefined,
          message: "Attributes",
        }),
      air_strength: strengths({
        key: "stat",
        index: 0,
        message: "Strength vs air",
      }),
      ground_strength: strengths({
        key: "stat",
        index: 1,
        message: "Strength vs Ground",
      }),
      infantry_strength: strengths({
        key: "stat",
        index: 2,
        message: "Strength vs infantry",
      }),
      enplacement_strength: strengths({
        key: "stat",
        index: 3,
        message: "Strength vs Enplacement",
      }),
    },
    {
      onCancel() {
        cancel("Operation cancelled.");
        process.exit(0);
      },
    }
  );
};

const main = async () => {
  db.exec(
    `CREATE TABLE IF NOT EXISTS units (
            id TEXT, 
            name TEXT, 
            icon TEXT, 
            unit_cap INTEGER DEFAULT 1, 
            leader_cap INTEGER DEFAULT 0, 
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
            attributes TEXT,
            requires TEXT DEFUALT '[]',
            faction TEXT DEFAULT 'UNSC'
        );`,
    (err) => {
      if (err) console.error(err);
    }
  );

  intro("Data Builder");
  const s = spinner();

  while (true) {
    const create_type = await select({
      message: "What do you want to create",
      options: [
        { value: "unit", label: "Unit" },
        { value: "building", label: "Building" },
        { value: "tech", label: "Tech" },
        { value: "view", label: "View" },
      ],
    });

    switch (create_type) {
      case "unit": {
        const result = await make_unit();

        s.start("Creating Unit");

        const data = schema.safeParse({
          ...result,
          $attributes: result.$attributes,
          $stat: `g:${result.ground_strength},i:${result.infantry_strength},a:${result.air_strength},e:${result.enplacement_strength}`,
        });

        if (!data.success) {
          console.error(data.error.errors);
          break;
        }
        db.run(
          `INSERT INTO units VALUES ($id,$name,$icon,$unit_cap,$leader_cap,$max_unique,$supplies,$energy,$health,$armor,$shield,$damage,$weapon_type,$unit_type,$stat,$attributes);`,
          data.data,
          (err) => {
            if (err) console.error(err);
          }
        );

        break;
      }
      default:
        break;
    }
    s.stop("Finished");

    const shouldContinue = await confirm({
      message: "Do you want to continue?",
    });

    if (!shouldContinue) break;
  }
};
main();
