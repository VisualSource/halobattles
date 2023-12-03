declare global {
    namespace NodeJS {
        interface ProcessEnv {
            STEAM_API_KEY: string;
            PUBLIC_URL: string;
            NODE_ENV: "production" | "development" | "test";
            PRIVATE_KEY: string;
            SIGNING_ALG: string;
        }
    }
}

export { }