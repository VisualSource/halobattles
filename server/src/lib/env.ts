import { config } from 'dotenv';
import { z } from 'zod';
import { exit } from 'node:process';

const schema = z.object({
    STEAM_API_KEY: z.string().min(1),
    PUBLIC_URL: z.string().url(),
    SIGNING_ALG: z.enum(["RS256"]),
    NODE_ENV: z.enum(["production", "development", "test"]),
    PRIVATE_KEY: z.string().startsWith("-----BEGIN PRIVATE KEY-----").endsWith("-----END PRIVATE KEY-----")
});

function loadEnv() {
    try {
        config()
    } catch (error) {
        console.warn("Missing .env, ignoring.")
    }

    const data = schema.safeParse(process.env);

    if (data.success) return;

    for (const error of data.error.errors) {
        console.error("\x1b[33m%s\x1b[0m: %s, %s", error.message, error.code, error.path);
    }

    exit(1);
}

loadEnv();

