import http from "http";
import dotenv from "dotenv";
import app from "./app.js";
import { initSocket } from "./socket.js";

dotenv.config();

const PORT = process.env.PORT || 4000;
const httpServer = http.createServer(app);

// Inicializamos Socket.IO usando tu archivo socket.js
const io = initSocket(httpServer);

app.set("io", io);

httpServer.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT} 🚀`);
});
