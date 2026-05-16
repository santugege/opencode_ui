import { createApiServer } from "./app/createApp";

const port = Number(process.env.PORT ?? 8787);

createApiServer().listen({ host: "127.0.0.1", port }, (error, address) => {
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log(`api listening on ${address}`);
});
