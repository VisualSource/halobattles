import { initApp } from "./server.js";

initApp({
  port: 3000,
  root: import.meta.url,
});
