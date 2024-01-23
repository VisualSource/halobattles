const HTTP_STATUS = {
    OK: { text: "Ok", code: 200 },
    BAD_REQUEST: { text: "Bad Request", code: 400 },
    UNAUTHORIZED: { text: "Unauthorized", code: 401 },
    FORBIDDEN: { text: "Forbidden", code: 403, },
    NOT_FOUND: { text: "Not Found", code: 404 },
    MOVED_PERMANETLY: { text: "Moved Permanently", code: 301 },
    TEMPORARY_REDIRECT: { text: "Temporary Redirect", code: 307 },
    PERMANENT_REDIRECT: { text: "Permanent Redirect", code: 308 },
    INTERNAL_ERROR: { text: "Internal Server Error", code: 500 }
} as const;

export default HTTP_STATUS;