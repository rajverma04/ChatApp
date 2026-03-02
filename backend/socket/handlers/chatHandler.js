import Message from "../../models/Message.js";
import { users } from "../utils.js";

export default (io, socket) => {
    const sendMessage = async (message) => {
        try {
            // Guard: reject payloads over 10MB (base64 ~1.37x raw size)
            const payloadSize = (message.mediaUrl || "").length;
            if (payloadSize > 10 * 1024 * 1024) {
                return socket.emit("error", { message: "File too large. Maximum size is 10MB." });
            }
            if (!message.data && !message.mediaUrl) {
                return socket.emit("error", { message: "Message cannot be empty." });
            }

            const newMessage = await Message.create({
                from: message.userName,
                to: message.to,
                message: message.data || "",
                isGroup: message.isGroup || false,
                status: "sent",
                mediaUrl: message.mediaUrl || null,
                mediaType: message.mediaType || null,
                mediaName: message.mediaName || null,
            });

            const messageData = {
                id: newMessage._id.toString(),
                from: newMessage.from,
                to: newMessage.to,
                time: new Date(newMessage.createdAt).toLocaleString(),
                message: newMessage.message,
                isGroup: newMessage.isGroup,
                status: newMessage.status,
                reactions: [],
                mediaUrl: newMessage.mediaUrl,
                mediaType: newMessage.mediaType,
                mediaName: newMessage.mediaName,
            };

            if (message.isGroup) {
                io.to(message.to).emit("receive_message", messageData);
            } else {
                const recipientSocketId = users.get(message.to);
                if (recipientSocketId) {
                    io.to(recipientSocketId).emit("receive_message", messageData);
                    newMessage.status = "delivered";
                    await newMessage.save();
                    messageData.status = "delivered";
                    socket.emit("message_delivered", { messageId: messageData.id });
                }
                socket.emit("receive_message", messageData);
            }
        } catch (error) {
            console.error("Error saving message:", error);
            socket.emit("error", { message: "Failed to send message" });
        }
    };

    const messagesRead = async ({ from, to }) => {
        try {
            const result = await Message.updateMany(
                { from, to, status: { $ne: "read" }, isGroup: false },
                { status: "read" },
            );

            if (result.modifiedCount > 0) {
                const updatedMessages = await Message.find({ from, to, status: "read", isGroup: false })
                    .select("_id")
                    .lean();
                const messageIds = updatedMessages.map((m) => m._id.toString());
                const senderSocketId = users.get(from);
                if (senderSocketId) {
                    io.to(senderSocketId).emit("messages_read", { messageIds });
                }
            }
        } catch (error) {
            console.error("Error marking messages as read:", error);
        }
    };

    const typing = ({ from, to, isGroup }) => {
        if (isGroup) {
            socket.to(to).emit("typing", { from, to, isGroup: true });
        } else {
            const recipientSocketId = users.get(to);
            if (recipientSocketId) {
                io.to(recipientSocketId).emit("typing", { from });
            }
        }
    };

    const stopTyping = ({ from, to, isGroup }) => {
        if (isGroup) {
            socket.to(to).emit("stop_typing", { from, to, isGroup: true });
        } else {
            const recipientSocketId = users.get(to);
            if (recipientSocketId) {
                io.to(recipientSocketId).emit("stop_typing", { from });
            }
        }
    };

    const reactToMessage = async ({ messageId, emoji }) => {
        try {
            if (!socket.userName) return;

            const message = await Message.findById(messageId);
            if (!message) return;

            if (!message.reactions) message.reactions = [];
            const reactionIndex = message.reactions.findIndex((r) => r.emoji === emoji);

            if (reactionIndex > -1) {
                const userIndex = message.reactions[reactionIndex].users.indexOf(socket.userName);
                if (userIndex > -1) {
                    message.reactions[reactionIndex].users.splice(userIndex, 1);
                    if (message.reactions[reactionIndex].users.length === 0) {
                        message.reactions.splice(reactionIndex, 1);
                    }
                } else {
                    message.reactions[reactionIndex].users.push(socket.userName);
                }
            } else {
                message.reactions.push({ emoji, users: [socket.userName] });
            }

            message.markModified('reactions');
            await message.save();

            const updateData = {
                messageId: message._id.toString(),
                reactions: message.reactions,
                to: message.to,
                isGroup: message.isGroup,
            };

            if (message.isGroup) {
                io.to(message.to).emit("message_reaction_updated", updateData);
            } else {
                const recipientSocketId = users.get(message.to);
                const senderSocketId = users.get(message.from);
                if (recipientSocketId) io.to(recipientSocketId).emit("message_reaction_updated", updateData);
                if (senderSocketId) io.to(senderSocketId).emit("message_reaction_updated", updateData);
            }
        } catch (error) {
            console.error("Error reacting to message:", error);
        }
    };

    socket.on("send_message", sendMessage);
    socket.on("messages_read", messagesRead);
    socket.on("typing", typing);
    socket.on("stop_typing", stopTyping);
    socket.on("react_to_message", reactToMessage);
};
