import Room from "../models/Room.js";
import User from "../models/User.js";
import Message from "../models/Message.js";

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

// Build the contacts list for a given user:
// - Users who share at least one room with them
// - Users they have exchanged a DM with
export const getContactsForUser = async (userName) => {
    // 1. Users in shared rooms
    const sharedRooms = await Room.find({ members: userName }).lean();
    const contactNames = new Set();
    sharedRooms.forEach((r) => r.members.forEach((m) => { if (m !== userName) contactNames.add(m); }));

    // 2. Users with DM history
    const dmMessages = await Message.find({
        isGroup: false,
        $or: [{ from: userName }, { to: userName }],
    }).select("from to").lean();
    dmMessages.forEach((msg) => {
        if (msg.from !== userName) contactNames.add(msg.from);
        if (msg.to !== userName) contactNames.add(msg.to);
    });

    if (contactNames.size === 0) return [];

    const contactUsers = await User.find({ name: { $in: Array.from(contactNames) } }).lean();
    return contactUsers.map((u) => ({
        name: u.name,
        online: u.online,
        lastSeen: u.lastSeen,
        avatar: u.avatar || null,
        bio: u.bio || "",
        status: u.online ? (u.status || "Online") : null,
        publicKey: u.publicKey || null,
    }));
};

// Emit the contacts list to one specific user
export const broadcastContactsToUser = async (io, userName) => {
    try {
        const socketId = users.get(userName);
        if (!socketId) return;
        const contacts = await getContactsForUser(userName);
        io.to(socketId).emit("users", contacts);
    } catch (error) {
        console.error("Error broadcasting contacts to user:", error);
    }
};

// Re-emit contacts to a set of usernames (e.g. after room membership change)
export const broadcastContactsToMany = async (io, userNames) => {
    for (const name of userNames) {
        await broadcastContactsToUser(io, name);
    }
};
