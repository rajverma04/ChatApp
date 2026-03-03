import Room from "../../models/Room.js";
import Message from "../../models/Message.js";
import { broadcastRooms, broadcastContactsToUser, broadcastContactsToMany, users } from "../utils.js";
import { decryptText } from "../../utils/encryption.js";

// Format a group message for the client, decrypting the stored ciphertext
const formatGroupMsg = (msg) => ({
    id: msg._id.toString(),
    from: msg.from,
    to: msg.to,
    time: new Date(msg.createdAt).toLocaleString(),
    createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : new Date(msg.createdAt).toISOString(),
    message: (msg.isEncrypted) ? decryptText(msg.message) : msg.message,
    isGroup: true,
    isEncrypted: false, // always false after server-side decryption
    status: msg.status,
    reactions: msg.reactions || [],
    mediaUrl: msg.mediaUrl || null,
    mediaType: msg.mediaType || null,
    mediaName: msg.mediaName || null,
});

export default (io, socket) => {
    const createRoom = async ({ roomName, description, members, isPrivate, createdBy }) => {
        try {
            const creator = socket.userName || createdBy || (members && members[0]);
            if (!creator) return socket.emit("error", { message: "Authentication required." });
            if (!roomName || roomName.length < 3) return socket.emit("error", { message: "Invalid room name" });

            let room = await Room.findOne({ name: roomName });
            if (room) return socket.emit("error", { message: "Room already exists" });

            room = await Room.create({
                name: roomName,
                description: description || "",
                isPrivate: !!isPrivate,
                createdBy: creator,
                members: members && members.length > 0 ? members : [creator],
            });

            socket.join(roomName);
            await broadcastRooms(io);
            socket.emit("create_room_success", room);
        } catch (error) {
            console.error("Error creating room:", error);
            socket.emit("error", { message: "Failed to create room" });
        }
    };

    const joinRoom = async ({ roomName }) => {
        try {
            const room = await Room.findOne({ name: roomName });
            if (!room) return socket.emit("error", { message: "Room not found" });

            if (room.isPrivate && !room.members.includes(socket.userName)) {
                return socket.emit("error", { message: "This is a private room." });
            }

            const wasNewMember = !room.members.includes(socket.userName);
            if (wasNewMember) {
                room.members.push(socket.userName);
                await room.save();
            }

            socket.join(roomName);
            const PAGE_SIZE = 50;
            const rawHistory = await Message.find({ to: roomName, isGroup: true })
                .sort({ createdAt: -1 })
                .limit(PAGE_SIZE + 1)
                .lean();
            const hasMore = rawHistory.length > PAGE_SIZE;
            const pageMessages = hasMore ? rawHistory.slice(0, PAGE_SIZE) : rawHistory;
            pageMessages.reverse();
            const formattedMessages = pageMessages.map(formatGroupMsg);
            socket.emit("message_history", { messages: formattedMessages, hasMore });
            await broadcastRooms(io);

            // If this user just joined, update contacts for all existing members (they can now see each other)
            if (wasNewMember) {
                await broadcastContactsToMany(io, room.members);
                // Also update the new member's own contact list
                await broadcastContactsToUser(io, socket.userName);
            }
        } catch (error) {
            console.error("Error joining room:", error);
            socket.emit("error", { message: "Failed to join room" });
        }
    };

    // Room creator directly adds a member (no approval needed)
    const addRoomMember = async ({ roomName, memberName }) => {
        try {
            if (!socket.userName) return;
            const room = await Room.findOne({ name: roomName });
            if (!room) return socket.emit("error", { message: "Room not found" });
            if (room.createdBy !== socket.userName) return socket.emit("error", { message: "Only the room creator can add members" });

            const targetUser = await import("../../models/User.js").then(m => m.default.findOne({ name: memberName }));
            if (!targetUser) return socket.emit("error", { message: `User "${memberName}" not found` });
            if (room.members.includes(memberName)) return socket.emit("error", { message: "User is already a member" });

            room.members.push(memberName);
            await room.save();

            // Notify the added user
            const targetSocketId = users.get(memberName);
            if (targetSocketId) {
                io.to(targetSocketId).emit("notification", {
                    message: `You were added to room "${roomName}" by ${socket.userName}`,
                    type: "room_added",
                });
                // Make them join the socket room and send history
                const targetSocket = (await io.fetchSockets()).find(s => s.id === targetSocketId);
                if (targetSocket) {
                    targetSocket.join(roomName);
                    const PAGE_SIZE = 50;
                    const rawMsgs = await Message.find({ to: roomName, isGroup: true })
                        .sort({ createdAt: -1 })
                        .limit(PAGE_SIZE + 1)
                        .lean();
                    const hasMoreMsgs = rawMsgs.length > PAGE_SIZE;
                    const pageMsgs = hasMoreMsgs ? rawMsgs.slice(0, PAGE_SIZE) : rawMsgs;
                    pageMsgs.reverse();
                    targetSocket.emit("message_history", {
                        messages: pageMsgs.map(formatGroupMsg),
                        hasMore: hasMoreMsgs,
                    });
                }
            }

            await broadcastRooms(io);
            // Update contacts for all members (new member is now visible to everyone in the room)
            await broadcastContactsToMany(io, room.members);
            socket.emit("room_member_added", { roomName, memberName });
        } catch (error) {
            console.error("Error in add_room_member:", error);
            socket.emit("error", { message: "Failed to add member" });
        }
    };

    // Room creator removes a member
    const removeRoomMember = async ({ roomName, memberName }) => {
        try {
            if (!socket.userName) return;
            const room = await Room.findOne({ name: roomName });
            if (!room) return socket.emit("error", { message: "Room not found" });
            if (room.createdBy !== socket.userName) return socket.emit("error", { message: "Only the room creator can remove members" });
            if (memberName === socket.userName) return socket.emit("error", { message: "Cannot remove yourself (you are the creator)" });
            if (!room.members.includes(memberName)) return socket.emit("error", { message: "User is not a member" });

            const previousMembers = [...room.members];
            room.members = room.members.filter(m => m !== memberName);
            await room.save();

            // Kick the removed user from socket room
            const targetSocketId = users.get(memberName);
            if (targetSocketId) {
                io.to(targetSocketId).emit("notification", {
                    message: `You were removed from room "${roomName}" by ${socket.userName}`,
                    type: "room_removed",
                });
                io.to(targetSocketId).emit("kicked_from_room", { roomName });
                const targetSocket = (await io.fetchSockets()).find(s => s.id === targetSocketId);
                if (targetSocket) targetSocket.leave(roomName);
                // Update removed user's contact list
                await broadcastContactsToUser(io, memberName);
            }

            await broadcastRooms(io);
            // Update contacts for remaining members (removed user may no longer be visible)
            await broadcastContactsToMany(io, previousMembers);
            socket.emit("room_member_removed", { roomName, memberName });
        } catch (error) {
            console.error("Error in remove_room_member:", error);
            socket.emit("error", { message: "Failed to remove member" });
        }
    };

    const requestJoin = async ({ roomName }) => {
        try {
            const room = await Room.findOne({ name: roomName });
            if (!room) return socket.emit("error", { message: "Room not found" });
            if (room.members.includes(socket.userName)) return socket.emit("error", { message: "Already a member" });
            if (room.pendingRequests.includes(socket.userName)) return socket.emit("error", { message: "Request pending" });

            room.pendingRequests.push(socket.userName);
            await room.save();

            const creatorSocketId = users.get(room.createdBy);
            if (creatorSocketId) {
                io.to(creatorSocketId).emit("notification", {
                    message: `${socket.userName} wants to join: ${roomName}`,
                    type: "join_request"
                });
            }
            await broadcastRooms(io);
            socket.emit("request_join_success", { roomName });
        } catch (error) {
            console.error("Error requesting join:", error);
        }
    };

    const approveJoin = async ({ roomName, userName }) => {
        try {
            const room = await Room.findOne({ name: roomName });
            if (!room || room.createdBy !== socket.userName) return;

            room.pendingRequests = room.pendingRequests.filter(u => u !== userName);
            if (!room.members.includes(userName)) room.members.push(userName);
            await room.save();

            const userSocketId = users.get(userName);
            if (userSocketId) {
                io.to(userSocketId).emit("notification", {
                    message: `Your request to join ${roomName} was approved!`,
                    type: "join_approved",
                });
            }
            await broadcastRooms(io);
            await broadcastContactsToMany(io, room.members);
        } catch (error) {
            console.error("Error approving join:", error);
        }
    };

    const declineJoin = async ({ roomName, userName }) => {
        try {
            const room = await Room.findOne({ name: roomName });
            if (!room || room.createdBy !== socket.userName) return;
            room.pendingRequests = room.pendingRequests.filter(u => u !== userName);
            await room.save();
            await broadcastRooms(io);
        } catch (error) {
            console.error("Error declining join:", error);
        }
    };

    const markRoomRead = async ({ roomName }) => {
        try {
            if (!socket.userName) return;
            const lastMessage = await Message.findOne({ to: roomName, isGroup: true }).sort({ createdAt: -1 }).select("_id").lean();
            if (lastMessage) {
                await Room.findOneAndUpdate({ name: roomName }, { $set: { [`lastSeen.${socket.userName}`]: lastMessage._id.toString() } });
            }
        } catch (error) {
            console.error("Error marking room as read:", error);
        }
    };

    socket.on("create_room", createRoom);
    socket.on("join_room", joinRoom);
    socket.on("add_room_member", addRoomMember);
    socket.on("remove_room_member", removeRoomMember);
    socket.on("request_join", requestJoin);
    socket.on("approve_join", approveJoin);
    socket.on("decline_join", declineJoin);
    socket.on("mark_room_read", markRoomRead);
};
