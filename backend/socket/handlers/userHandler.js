import User from "../../models/User.js";
import Message from "../../models/Message.js";
import Room from "../../models/Room.js";
import { users } from "../utils.js";

export default (io, socket) => {
    const join = async ({ userName, password }) => {
        try {
            if (!userName || !password) {
                return socket.emit("join_error", { message: "Username and password are required." });
            }

            let user = await User.findOne({ name: userName });

            if (user) {
                if (!user.password) {
                    user.password = password;
                    user.socketId = socket.id;
                    user.online = true;
                    user.lastSeen = new Date();
                    await user.save();
                } else {
                    const isPasswordValid = await user.comparePassword(password);
                    if (!isPasswordValid) {
                        return socket.emit("join_error", { message: "Incorrect password." });
                    }
                    if (user.online && users.has(userName)) {
                        return socket.emit("join_error", { message: "Account already logged in elsewhere." });
                    }
                    user.socketId = socket.id;
                    user.online = true;
                    user.lastSeen = new Date();
                    await user.save();
                }
            } else {
                user = await User.create({
                    name: userName,
                    password: password,
                    socketId: socket.id,
                    online: true,
                    lastSeen: new Date(),
                });
            }

            users.set(userName, socket.id);
            socket.userName = userName;
            socket.emit("join_success");

            const allUsers = await User.find({}).lean();
            const userList = allUsers.map((u) => ({
                name: u.name,
                online: u.online,
                lastSeen: u.lastSeen,
                avatar: u.avatar || null,
                bio: u.bio || "",
                status: u.online ? (u.status || "Online") : null,
            }));
            io.emit("users", userList);

            const allRooms = await Room.find({}).lean();
            socket.emit("rooms", allRooms);

            const userRooms = allRooms.filter(r => r.members.includes(userName));
            userRooms.forEach(r => socket.join(r.name));

            const messageHistory = await Message.find({
                $or: [
                    { from: userName },
                    { to: userName },
                    { to: { $in: userRooms.map(r => r.name) }, isGroup: true }
                ]
            })
                .sort({ createdAt: 1 })
                .lean();

            const formattedMessages = messageHistory.map((msg) => ({
                id: msg._id.toString(),
                from: msg.from,
                to: msg.to,
                time: new Date(msg.createdAt).toLocaleString(),
                message: msg.message,
                isGroup: msg.isGroup,
                status: msg.status,
                reactions: msg.reactions || [],
            }));
            socket.emit("message_history", formattedMessages);

            const unreadCounts = {};
            const unreadDMs = await Message.aggregate([
                { $match: { to: userName, status: { $ne: "read" }, isGroup: false } },
                { $group: { _id: "$from", count: { $sum: 1 } } }
            ]);
            unreadDMs.forEach(dm => { unreadCounts[dm._id] = dm.count; });

            for (const room of userRooms) {
                const lastSeenId = room.lastSeen instanceof Map ? room.lastSeen.get(userName) : room.lastSeen?.[userName];
                const query = { to: room.name, isGroup: true };
                if (lastSeenId) query._id = { $gt: lastSeenId };
                const count = await Message.countDocuments(query);
                if (count > 0) unreadCounts[room.name] = count;
            }
            socket.emit("unread_counts", unreadCounts);

            const undeliveredMessages = await Message.find({ to: userName, status: "sent", isGroup: false });
            for (const msg of undeliveredMessages) {
                msg.status = "delivered";
                await msg.save();
                const senderSocketId = users.get(msg.from);
                if (senderSocketId) {
                    io.to(senderSocketId).emit("message_delivered", { messageId: msg._id.toString() });
                }
            }
        } catch (error) {
            console.error("Error in join event:", error);
            socket.emit("join_error", { message: "Failed to join chat" });
        }
    };

    const leave = async () => {
        if (socket.userName) {
            try {
                users.delete(socket.userName);
                await User.findOneAndUpdate({ name: socket.userName }, { online: false, lastSeen: new Date(), socketId: null });
                const allUsers = await User.find({}).lean();
                const userList = allUsers.map((u) => ({ name: u.name, online: u.online, lastSeen: u.lastSeen, avatar: u.avatar || null, bio: u.bio || "", status: u.online ? (u.status || "Online") : null }));
                io.emit("users", userList);
                socket.userName = null;
            } catch (error) {
                console.error("Error in leave event:", error);
            }
        }
    };

    const disconnect = async () => {
        if (socket.userName) {
            try {
                users.delete(socket.userName);
                await User.findOneAndUpdate({ name: socket.userName }, { online: false, lastSeen: new Date(), socketId: null });
                const allUsers = await User.find({}).lean();
                const userList = allUsers.map((u) => ({ name: u.name, online: u.online, lastSeen: u.lastSeen, avatar: u.avatar || null, bio: u.bio || "", status: u.online ? (u.status || "Online") : null }));
                io.emit("users", userList);
            } catch (error) {
                console.error("Error in disconnect event:", error);
            }
        }
    };

    const updateProfile = async ({ avatar, bio, status }) => {
        const name = socket.userName;
        if (!name) return socket.emit("error", { message: "Not authenticated" });
        try {
            const updateData = {};
            if (avatar !== undefined) updateData.avatar = avatar;
            if (bio !== undefined) updateData.bio = bio;
            if (status !== undefined) updateData.status = status;

            await User.findOneAndUpdate({ name }, updateData);

            const allUsers = await User.find({}).lean();
            const userList = allUsers.map((u) => ({
                name: u.name,
                online: u.online,
                lastSeen: u.lastSeen,
                avatar: u.avatar || null,
                bio: u.bio || "",
                status: u.online ? (u.status || "Online") : null,
            }));
            io.emit("users", userList);
            socket.emit("profile_updated");
        } catch (error) {
            console.error("Error in update_profile:", error);
            socket.emit("error", { message: "Failed to update profile" });
        }
    };

    socket.on("join", join);
    socket.on("leave", leave);
    socket.on("disconnect", disconnect);
    socket.on("update_profile", updateProfile);
};
