import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/database.js";
import User from "./models/User.js";
import Message from "./models/Message.js";
import Room from "./models/Room.js";

import { initSocket } from "./socket/index.js";

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 4000;
const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL
].filter(Boolean);

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST"],
  credentials: true,
}));
app.use(express.json());

const server = http.createServer(app);

// Initialize Socket.IO
const io = initSocket(server);

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
