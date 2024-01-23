import HTTP_STATUS from "./HttpStatus.js";

export default class HttpError<T extends keyof typeof HTTP_STATUS> extends Error {
    public status: typeof HTTP_STATUS[T];
    constructor(msg: string, status: T, public redirect: string = "/error", private withQuery: boolean = true) {
        super(msg);
        this.status = HTTP_STATUS[status];
    }

    public getRedirectPath(): string {
        return `${this.redirect}${this.withQuery ? `?status=${encodeURIComponent(`${this.status.code} ${this.status.text}`)}&reason=${encodeURIComponent(this.message)}` : ""}`;
    }
}