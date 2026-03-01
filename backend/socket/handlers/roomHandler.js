import Room from "../../models/Room.js";
import Message from "../../models/Message.js";
import { broadcastRooms, users } from "../utils.js";

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

            if (!room.members.includes(socket.userName)) {
                room.members.push(socket.userName);
                await room.save();
            }

            socket.join(roomName);
            const messageHistory = await Message.find({ to: roomName, isGroup: true }).sort({ createdAt: 1 }).lean();
            const formattedMessages = messageHistory.map((msg) => ({
                id: msg._id.toString(),
                from: msg.from,
                to: msg.to,
                time: new Date(msg.createdAt).toLocaleString(),
                message: msg.message,
                isGroup: true,
                status: msg.status,
                reactions: msg.reactions || [],
            }));
            socket.emit("message_history", formattedMessages);
            await broadcastRooms(io);
        } catch (error) {
            console.error("Error joining room:", error);
            socket.emit("error", { message: "Failed to join room" });
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
                    type: "join_approved"
                });
            }
            await broadcastRooms(io);
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
    socket.on("request_join", requestJoin);
    socket.on("approve_join", approveJoin);
    socket.on("decline_join", declineJoin);
    socket.on("mark_room_read", markRoomRead);
};
