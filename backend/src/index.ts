import "dotenv/config";
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { attachSignaling } from "./signaling.js";

const PORT = Number(process.env.PORT ?? 3001);

const app = createApp();
const httpServer = createServer(app);
attachSignaling(httpServer);

httpServer.listen(PORT, () => {
  console.log(
    `IsyaRasa backend listening on port ${PORT} (HTTP + Socket.io signaling)`,
  );
});
