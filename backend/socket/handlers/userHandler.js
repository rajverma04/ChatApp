import User from "../../models/User.js";
import Message from "../../models/Message.js";
import Room from "../../models/Room.js";
import { users, broadcastContactsToUser, broadcastContactsToMany, getContactsForUser } from "../utils.js";
import { decryptText } from "../../utils/encryption.js";

// Helper: format a raw DB message for sending to the client.
// Group messages are decrypted server-side; DM ciphertext is passed through as-is.
const formatMsg = (msg) => ({
    id: msg._id.toString(),
    from: msg.from,
    to: msg.to,
    time: new Date(msg.createdAt).toLocaleString(),
    createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : new Date(msg.createdAt).toISOString(),
    // Decrypt group messages; relay DM ciphertext as-is
    message: (msg.isGroup && msg.isEncrypted) ? decryptText(msg.message) : msg.message,
    isGroup: msg.isGroup,
    // After server decryption, group messages are plaintext to the client
    // DMs keep their isEncrypted flag so the receiver's browser can decrypt
    isEncrypted: msg.isGroup ? false : (msg.isEncrypted || false),
    status: msg.status,
    reactions: msg.reactions || [],
    mediaUrl: msg.mediaUrl || null,
    mediaType: msg.mediaType || null,
    mediaName: msg.mediaName || null,
});

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

            // Privacy: send only this user's contacts (not all users globally)
            const contacts = await getContactsForUser(userName);
            socket.emit("users", contacts);

            // Also update online status in the contact lists of existing contacts
            broadcastContactsToMany(io, contacts.map(c => c.name));

            const allRooms = await Room.find({}).lean();
            socket.emit("rooms", allRooms);

            const userRooms = allRooms.filter(r => r.members.includes(userName));
            userRooms.forEach(r => socket.join(r.name));

            // Fetch only the 50 most recent messages on login (paginated)
            const PAGE_SIZE = 50;
            const rawHistory = await Message.find({
                $or: [
                    { from: userName },
                    { to: userName },
                    { to: { $in: userRooms.map(r => r.name) }, isGroup: true }
                ]
            })
                .sort({ createdAt: -1 })
                .limit(PAGE_SIZE + 1)
                .lean();

            const hasMore = rawHistory.length > PAGE_SIZE;
            const pageMessages = hasMore ? rawHistory.slice(0, PAGE_SIZE) : rawHistory;
            // Reverse so messages are in ascending time order for the client
            pageMessages.reverse();

            const formattedMessages = pageMessages.map(formatMsg);
            socket.emit("message_history", { messages: formattedMessages, hasMore });

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

    // Search for users by username prefix (for DM search and room member add)
    const searchUser = async ({ query }) => {
        if (!socket.userName) return;
        if (!query || query.trim().length < 1) {
            return socket.emit("search_results", []);
        }
        try {
            const regex = new RegExp(query.trim(), "i");
            const results = await User.find({
                name: { $regex: regex, $ne: socket.userName },
            }).select("name avatar bio status online").lean();
            socket.emit("search_results", results.map(u => ({
                name: u.name,
                avatar: u.avatar || null,
                bio: u.bio || "",
                status: u.online ? (u.status || "Online") : null,
                online: u.online,
            })));
        } catch (error) {
            console.error("Error in search_user:", error);
        }
    };

    const leave = async () => {
        if (socket.userName) {
            try {
                const leavingUser = socket.userName;
                users.delete(leavingUser);
                await User.findOneAndUpdate({ name: leavingUser }, { online: false, lastSeen: new Date(), socketId: null });
                // Refresh contacts of people who had this user as a contact
                const contacts = await getContactsForUser(leavingUser);
                broadcastContactsToMany(io, contacts.map(c => c.name));
                socket.userName = null;
            } catch (error) {
                console.error("Error in leave event:", error);
            }
        }
    };

    const disconnect = async () => {
        if (socket.userName) {
            try {
                const leavingUser = socket.userName;
                users.delete(leavingUser);
                await User.findOneAndUpdate({ name: leavingUser }, { online: false, lastSeen: new Date(), socketId: null });
                const contacts = await getContactsForUser(leavingUser);
                broadcastContactsToMany(io, contacts.map(c => c.name));
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

            // Re-push updated info to every contact of this user
            const contacts = await getContactsForUser(name);
            socket.emit("users", contacts); // own contact list stays the same
            broadcastContactsToMany(io, contacts.map(c => c.name)); // update friends' lists
            socket.emit("profile_updated");
        } catch (error) {
            console.error("Error in update_profile:", error);
            socket.emit("error", { message: "Failed to update profile" });
        }
    };

    const changeUsername = async ({ newName }) => {
        const oldName = socket.userName;
        if (!oldName) return socket.emit("error", { message: "Not authenticated" });
        if (!newName || newName.trim().length < 3)
            return socket.emit("error", { message: "Username must be at least 3 characters" });
        newName = newName.trim();
        if (newName === oldName) return socket.emit("username_changed", { newName });

        try {
            // 1. Check uniqueness
            const existing = await User.findOne({ name: newName });
            if (existing) return socket.emit("error", { message: `Username "${newName}" is already taken` });

            // 2. Update User document
            await User.findOneAndUpdate({ name: oldName }, { name: newName });

            // 3. Cascade: messages sent by this user
            await Message.updateMany({ from: oldName }, { from: newName });
            // 4. Cascade: DMs addressed to this user
            await Message.updateMany({ to: oldName, isGroup: false }, { to: newName });

            // 5. Cascade: rooms — members list, createdBy, pendingRequests
            await Room.updateMany({ members: oldName }, { $set: { "members.$[el]": newName } }, { arrayFilters: [{ "el": oldName }] });
            await Room.updateMany({ createdBy: oldName }, { createdBy: newName });
            await Room.updateMany({ pendingRequests: oldName }, { $set: { "pendingRequests.$[el]": newName } }, { arrayFilters: [{ "el": oldName }] });

            // 6. Update socket and users map
            users.delete(oldName);
            users.set(newName, socket.id);
            socket.userName = newName;

            // 7. Notify the user themselves so frontend can update localStorage + state
            socket.emit("username_changed", { oldName, newName });

            // 8. Refresh contacts for all contacts of this user (they see the new name)
            const contacts = await getContactsForUser(newName);
            broadcastContactsToMany(io, contacts.map(c => c.name));
            socket.emit("users", contacts);

            // 9. Refresh rooms for everyone
            const { broadcastRooms } = await import("../utils.js");
            broadcastRooms(io);
        } catch (error) {
            console.error("Error in change_username:", error);
            socket.emit("error", { message: "Failed to change username" });
        }
    };

    // ── Paginated message loading ────────────────────────────────────────────
    const fetchMoreMessages = async ({ chatKey, isGroup, before }) => {
        if (!socket.userName) return;
        try {
            const PAGE_SIZE = 50;
            // `before` is an ISO timestamp string sent by the client
            const beforeDate = before ? new Date(before) : new Date();

            const query = isGroup
                ? { to: chatKey, isGroup: true, createdAt: { $lt: beforeDate } }
                : {
                    $or: [
                        { from: socket.userName, to: chatKey, isGroup: false },
                        { from: chatKey, to: socket.userName, isGroup: false },
                    ],
                    createdAt: { $lt: beforeDate },
                };

            const raw = await Message.find(query)
                .sort({ createdAt: -1 })
                .limit(PAGE_SIZE + 1)
                .lean();

            const hasMore = raw.length > PAGE_SIZE;
            const page = hasMore ? raw.slice(0, PAGE_SIZE) : raw;
            page.reverse(); // oldest first

            const formatted = page.map(formatMsg);

            socket.emit("more_messages", { messages: formatted, hasMore, chatKey, isGroup });
        } catch (error) {
            console.error("Error in fetch_more_messages:", error);
        }
    };

    // ── Public key registration (for DM E2E encryption) ──────────────────────
    const registerPublicKey = async ({ publicKey }) => {
        if (!socket.userName || !publicKey) return;
        try {
            await User.findOneAndUpdate({ name: socket.userName }, { publicKey });
            // Re-broadcast contacts so the updated publicKey is visible to DM partners
            const contacts = await getContactsForUser(socket.userName);
            broadcastContactsToMany(io, contacts.map(c => c.name));
        } catch (error) {
            console.error("Error registering public key:", error);
        }
    };

    socket.on("join", join);
    socket.on("search_user", searchUser);
    socket.on("leave", leave);
    socket.on("disconnect", disconnect);
    socket.on("update_profile", updateProfile);
    socket.on("change_username", changeUsername);
    socket.on("fetch_more_messages", fetchMoreMessages);
    socket.on("register_public_key", registerPublicKey);
};
