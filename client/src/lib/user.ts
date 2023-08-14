import type { UUID } from "server";

type UserId = {
    id: UUID | null;
    getUser: () => UUID,
    setUser: (id: UUID) => void;
    generateId(): UUID;
}

const USER_ID_STORAGE_KEY = "game-user-id";

export const user: UserId = {
    id: null,
    getUser() {
        if (this.id !== null) return this.id;

        if (import.meta.env.VITE_USE_STORE_USER_ID === "fixed") {
            this.id = "1724ea86-18a1-465c-b91a-fce23e916aae";
            return this.id;
        }

        if (import.meta.env.VITE_USE_STORE_USER_ID === "random") {
            return this.generateId();
        }

        const id = localStorage.getItem(USER_ID_STORAGE_KEY) as UUID | null;

        if (!id) return this.generateId();

        this.id = id;
        return this.id;
    },
    setUser(id: UUID) {
        this.id = id;
    },
    generateId() {
        this.id = crypto.randomUUID();
        localStorage.setItem(USER_ID_STORAGE_KEY, this.id);
        return this.id;
    }
}