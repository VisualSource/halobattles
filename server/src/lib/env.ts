import { config } from 'dotenv';
import { z } from 'zod';

const schema = z.object({
    STEAM_API_KEY: z.string().min(1),
    PUBLIC_URL: z.string().url(),
    SIGNING_ALG: z.enum(["RS256"]),
    NODE_ENV: z.enum(["production", "development", "test"]),
    PRIVATE_KEY: z.string().startsWith("-----BEGIN PRIVATE KEY-----").endsWith("-----END PRIVATE KEY-----")
});

const result = config();

if (result.error) {
    throw result.error;
}

schema.parse(result.parsed);