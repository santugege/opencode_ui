import { createApiServer } from "./server";

const port = Number(process.env.PORT ?? 8787);

createApiServer().listen(port, "127.0.0.1", () => {
  console.log(`api listening on http://127.0.0.1:${port}`);
});
