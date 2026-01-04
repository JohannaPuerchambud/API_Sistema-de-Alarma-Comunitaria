// server.js
import http from "http";
import app from "./app.js";
import dotenv from "dotenv";
import { initSocket } from "./socket.js";

dotenv.config();

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);

initSocket(server);

server.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
