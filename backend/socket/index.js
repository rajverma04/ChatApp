import { Server } from "socket.io";
import userHandler from "./handlers/userHandler.js";
import chatHandler from "./handlers/chatHandler.js";
import roomHandler from "./handlers/roomHandler.js";

export const initSocket = (server) => {
    const allowedOrigins = [
        process.env.FRONTEND_URL,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ].filter(Boolean);

    const io = new Server(server, {
        cors: {
            origin: allowedOrigins,
            methods: ["GET", "POST"],
            credentials: true,
        },
        transports: ['polling', 'websocket'],
        allowEIO3: true,
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    io.on("connection", (socket) => {
        // Register individual handlers
        userHandler(io, socket);
        chatHandler(io, socket);
        roomHandler(io, socket);
    });

    return io;
};
