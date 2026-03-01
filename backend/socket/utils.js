import Room from "../models/Room.js";

// Map of online users: userName -> socketId
export const users = new Map();

// Helper to broadcast filtered rooms to all online users
export const broadcastRooms = async (io) => {
    try {
        const allRooms = await Room.find({}).lean();
        const sockets = await io.fetchSockets();

        for (const s of sockets) {
            if (s.userName) {
                s.emit("rooms", allRooms);
            } else {
                const publicRooms = allRooms.filter((r) => !r.isPrivate);
                s.emit("rooms", publicRooms);
            }
        }
    } catch (error) {
        console.error("Error broadcasting rooms:", error);
    }
};
