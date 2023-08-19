import { initApp } from "./server.js";

initApp({
  port: 3000,
  origin: import.meta.url,
});
