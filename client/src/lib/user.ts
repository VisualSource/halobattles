export const user = {
    id: "1724ea86-18a1-465c-b91a-fce23e916aae",
    getUser() {
        return this.id
    },
    setUser(id: string) {
        this.id = id;
    },
    generateId() {
        this.id = crypto.randomUUID();
        return this.id;
    }
}