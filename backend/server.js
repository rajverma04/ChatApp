import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/database.js";
import User from "./models/User.js";
import Message from "./models/Message.js";
import Room from "./models/Room.js";

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 4000;

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  methods: ["GET", "POST"],
  credentials: true,
}));
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Map of online users: userName -> socketId
const users = new Map();

// Helper to broadcast filtered rooms to all online users
const broadcastRooms = async () => {
  try {
    const allRooms = await Room.find({}).lean();
    const sockets = await io.fetchSockets();

    for (const s of sockets) {
      // If user is authenticated, show all rooms (so they can discover/search)
      if (s.userName) {
        s.emit("rooms", allRooms);
      } else {
        // If not authenticated (yet), only show public rooms
        const publicRooms = allRooms.filter((r) => !r.isPrivate);
        s.emit("rooms", publicRooms);
      }
    }
  } catch (error) {
    console.error("Error broadcasting rooms:", error);
  }
};

io.on("connection", (socket) => {
  socket.on("send_message", async (message) => {
    try {
      // Save message to database
      const newMessage = await Message.create({
        from: message.userName,
        to: message.to,
        message: message.data,
        isGroup: message.isGroup || false,
        status: "sent",
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
      };

      if (message.isGroup) {
        // Broadcast to all users in the room
        io.to(message.to).emit("receive_message", messageData);
      } else {
        // Send to recipient if online (Individual Chat)
        const recipientSocketId = users.get(message.to);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit("receive_message", messageData);
          // Update status to delivered
          newMessage.status = "delivered";
          await newMessage.save();
          messageData.status = "delivered";
          // Notify sender about delivery
          socket.emit("message_delivered", { messageId: messageData.id });
        }
        // Send to sender so they see their own message
        socket.emit("receive_message", messageData);
      }
    } catch (error) {
      console.error("Error saving message:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  });


  socket.on("create_room", async ({ roomName, description, members, isPrivate, createdBy }) => {
    try {
      const creator = socket.userName || createdBy || (members && members[0]);

      if (!creator) {
        return socket.emit("error", { message: "Authentication required to create a room." });
      }

      if (!roomName || roomName.length < 3) {
        return socket.emit("error", { message: "Invalid room name" });
      }

      let room = await Room.findOne({ name: roomName });
      if (room) {
        return socket.emit("error", { message: "Room already exists" });
      }

      room = await Room.create({
        name: roomName,
        description: description || "",
        isPrivate: !!isPrivate,
        createdBy: creator,
        members: members && members.length > 0 ? members : [creator],
      });

      // Join the creator to the room
      socket.join(roomName);

      // Notify all users about the new room (only if public or they are members)
      await broadcastRooms();

      socket.emit("create_room_success", room);
    } catch (error) {
      console.error("Error creating room:", error);
      socket.emit("error", { message: "Failed to create room" });
    }
  });

  socket.on("join_room", async ({ roomName }) => {
    try {
      const room = await Room.findOne({ name: roomName });
      if (!room) {
        return socket.emit("error", { message: "Room not found" });
      }

      // If room is private and user is not a member, they can't join directly
      if (room.isPrivate && !room.members.includes(socket.userName)) {
        return socket.emit("error", { message: "This is a private room. Please request to join." });
      }

      // Add user to room members if not already
      if (!room.members.includes(socket.userName)) {
        room.members.push(socket.userName);
        await room.save();
      }

      socket.join(roomName);

      // Send group chat history
      const messageHistory = await Message.find({
        to: roomName,
        isGroup: true,
      })
        .sort({ createdAt: 1 })
        .lean();

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

      // Update room list for everyone (filtered)
      await broadcastRooms();
    } catch (error) {
      console.error("Error joining room:", error);
      socket.emit("error", { message: "Failed to join room" });
    }
  });

  socket.on("request_join", async ({ roomName }) => {
    try {
      const room = await Room.findOne({ name: roomName });
      if (!room) return socket.emit("error", { message: "Room not found" });

      if (room.members.includes(socket.userName)) {
        return socket.emit("error", { message: "You are already a member" });
      }

      if (room.pendingRequests.includes(socket.userName)) {
        return socket.emit("error", { message: "Request already pending" });
      }

      room.pendingRequests.push(socket.userName);
      await room.save();

      // Notify the creator if online
      const creatorSocketId = users.get(room.createdBy);
      if (creatorSocketId) {
        io.to(creatorSocketId).emit("notification", {
          message: `${socket.userName} wants to join your room: ${roomName}`,
          type: "join_request"
        });
      }

      await broadcastRooms();
      socket.emit("request_join_success", { roomName });
    } catch (error) {
      console.error("Error requesting join:", error);
      socket.emit("error", { message: "Failed to send request" });
    }
  });

  socket.on("approve_join", async ({ roomName, userName }) => {
    try {
      const room = await Room.findOne({ name: roomName });
      if (!room) return socket.emit("error", { message: "Room not found" });

      if (room.createdBy !== socket.userName) {
        return socket.emit("error", { message: "Only the creator can approve requests" });
      }

      room.pendingRequests = room.pendingRequests.filter(u => u !== userName);
      if (!room.members.includes(userName)) {
        room.members.push(userName);
      }
      await room.save();

      // Notify the user if online
      const userSocketId = users.get(userName);
      if (userSocketId) {
        io.to(userSocketId).emit("notification", {
          message: `Your request to join ${roomName} was approved!`,
          type: "join_approved"
        });
      }

      await broadcastRooms();
    } catch (error) {
      console.error("Error approving join:", error);
      socket.emit("error", { message: "Failed to approve request" });
    }
  });

  socket.on("decline_join", async ({ roomName, userName }) => {
    try {
      const room = await Room.findOne({ name: roomName });
      if (!room) return socket.emit("error", { message: "Room not found" });

      if (room.createdBy !== socket.userName) {
        return socket.emit("error", { message: "Only the creator can decline requests" });
      }

      room.pendingRequests = room.pendingRequests.filter(u => u !== userName);
      await room.save();

      await broadcastRooms();
    } catch (error) {
      console.error("Error declining join:", error);
      socket.emit("error", { message: "Failed to decline request" });
    }
  });

  socket.on("join", async ({ userName, password }) => {
    try {
      // Validate input
      if (!userName || !password) {
        socket.emit("join_error", {
          message: "Username and password are required.",
        });
        return;
      }

      // Find user in database
      let user = await User.findOne({ name: userName });

      if (user) {
        // Check if user has no password (created before password feature)
        if (!user.password) {
          // Update old user with new password
          user.password = password;
          user.socketId = socket.id;
          user.online = true;
          user.lastSeen = new Date();
          await user.save();
        } else {
          // Existing user with password - verify it
          const isPasswordValid = await user.comparePassword(password);

          if (!isPasswordValid) {
            socket.emit("join_error", {
              message: "Incorrect password.",
            });
            return;
          }

          // Check if user is already online (in another session)
          if (user.online && users.has(userName)) {
            socket.emit("join_error", {
              message: "This account is already logged in from another device.",
            });
            return;
          }

          // Update existing user (successful login)
          user.socketId = socket.id;
          user.online = true;
          user.lastSeen = new Date();
          await user.save();
        }
      } else {
        // New user - create account
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

      // Get all users from database
      const allUsers = await User.find({}).lean();
      const userList = allUsers.map((u) => ({
        name: u.name,
        online: u.online,
        lastSeen: u.lastSeen,
      }));

      io.emit("users", userList);

      // Get all rooms from database
      const allRooms = await Room.find({}).lean();
      socket.emit("rooms", allRooms);

      // Automatically join rooms the user is a member of
      const userRooms = allRooms.filter(r => r.members.includes(userName));
      userRooms.forEach(r => socket.join(r.name));

      // Get message history (Individual & Rooms)
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

      // Initial unread counts
      const unreadCounts = {};

      // 1. Unread DMs
      const unreadDMs = await Message.aggregate([
        { $match: { to: userName, status: { $ne: "read" }, isGroup: false } },
        { $group: { _id: "$from", count: { $sum: 1 } } }
      ]);
      unreadDMs.forEach(dm => { unreadCounts[dm._id] = dm.count; });

      // 2. Unread Rooms
      for (const room of userRooms) {
        const lastSeenId = room.lastSeen instanceof Map ? room.lastSeen.get(userName) : room.lastSeen?.[userName];
        const query = { to: room.name, isGroup: true };
        if (lastSeenId) {
          query._id = { $gt: lastSeenId };
        }
        const count = await Message.countDocuments(query);
        if (count > 0) unreadCounts[room.name] = count;
      }

      socket.emit("unread_counts", unreadCounts);

      // Mark undelivered messages as delivered
      const undeliveredMessages = await Message.find({
        to: userName,
        status: "sent",
        isGroup: false,
      });

      for (const msg of undeliveredMessages) {
        msg.status = "delivered";
        await msg.save();

        // Notify original sender
        const senderSocketId = users.get(msg.from);
        if (senderSocketId) {
          io.to(senderSocketId).emit("message_delivered", {
            messageId: msg._id.toString(),
          });
        }
      }
    } catch (error) {
      console.error("Error in join event:", error);
      socket.emit("join_error", { message: "Failed to join chat" });
    }
  });

  socket.on("messages_read", async ({ from, to }) => {
    try {
      // Update message status to read
      const result = await Message.updateMany(
        { from, to, status: { $ne: "read" }, isGroup: false },
        { status: "read" },
      );

      if (result.modifiedCount > 0) {
        // Get updated message IDs
        const updatedMessages = await Message.find({ from, to, status: "read", isGroup: false })
          .select("_id")
          .lean();

        const messageIds = updatedMessages.map((m) => m._id.toString());

        // Notify sender that messages were read
        const senderSocketId = users.get(from);
        if (senderSocketId) {
          io.to(senderSocketId).emit("messages_read", { messageIds });
        }
      }
    } catch (error) {
      console.error("Error marking messages as read:", error);
    }
  });

  socket.on("mark_room_read", async ({ roomName }) => {
    try {
      if (!socket.userName) return;

      const lastMessage = await Message.findOne({ to: roomName, isGroup: true })
        .sort({ createdAt: -1 })
        .select("_id")
        .lean();

      if (lastMessage) {
        // Use $set with dynamic key for Map field in Mongoose
        await Room.findOneAndUpdate(
          { name: roomName },
          { $set: { [`lastSeen.${socket.userName}`]: lastMessage._id.toString() } }
        );
      }
    } catch (error) {
      console.error("Error marking room as read:", error);
    }
  });

  socket.on("typing", ({ from, to, isGroup }) => {
    if (isGroup) {
      socket.to(to).emit("typing", { from, to, isGroup: true });
    } else {
      const recipientSocketId = users.get(to);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("typing", { from });
      }
    }
  });

  socket.on("stop_typing", ({ from, to, isGroup }) => {
    if (isGroup) {
      socket.to(to).emit("stop_typing", { from, to, isGroup: true });
    } else {
      const recipientSocketId = users.get(to);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("stop_typing", { from });
      }
    }
  });

  socket.on("react_to_message", async ({ messageId, emoji }) => {
    try {
      if (!socket.userName) return;

      const message = await Message.findById(messageId);
      if (!message) return;

      if (!message.reactions) message.reactions = [];

      const reactionIndex = message.reactions.findIndex((r) => r.emoji === emoji);

      if (reactionIndex > -1) {
        const userIndex = message.reactions[reactionIndex].users.indexOf(socket.userName);
        if (userIndex > -1) {
          // Remove user from reaction
          message.reactions[reactionIndex].users.splice(userIndex, 1);
          // If no users left, remove the emoji entirely
          if (message.reactions[reactionIndex].users.length === 0) {
            message.reactions.splice(reactionIndex, 1);
          }
        } else {
          // Add user to existing reaction
          message.reactions[reactionIndex].users.push(socket.userName);
        }
      } else {
        // Add new reaction emoji
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
  });

  socket.on("leave", async () => {
    if (socket.userName) {
      try {
        users.delete(socket.userName);

        // Update user status in database
        await User.findOneAndUpdate(
          { name: socket.userName },
          {
            online: false,
            lastSeen: new Date(),
            socketId: null,
          },
        );

        // Send updated user list
        const allUsers = await User.find({}).lean();
        const userList = allUsers.map((u) => ({
          name: u.name,
          online: u.online,
          lastSeen: u.lastSeen,
        }));
        io.emit("users", userList);

        socket.userName = null;
      } catch (error) {
        console.error("Error in leave event:", error);
      }
    }
  });

  socket.on("disconnect", async () => {
    if (socket.userName) {
      try {
        users.delete(socket.userName);

        // Update user status in database
        await User.findOneAndUpdate(
          { name: socket.userName },
          {
            online: false,
            lastSeen: new Date(),
            socketId: null,
          },
        );

        // Send updated user list
        const allUsers = await User.find({}).lean();
        const userList = allUsers.map((u) => ({
          name: u.name,
          online: u.online,
          lastSeen: u.lastSeen,
        }));
        io.emit("users", userList);
      } catch (error) {
        console.error("Error in disconnect event:", error);
      }
    }
  });
});

app.get("/", (req, res) => {
  res.send("<h1>Chat App Backend with MongoDB</h1>");
});

// Health check endpoint
app.get("/health", async (req, res) => {
  const mongoose = (await import("mongoose")).default;
  res.json({
    status: "ok",
    mongodb:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

server.listen(PORT, async () => {
  await connectDB();
  console.log(`Server listening on port ${PORT}`);
});
