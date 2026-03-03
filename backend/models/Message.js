import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  from: {
    type: String,
    required: true,
    ref: 'User'
  },
  to: {
    type: String,
    required: true
  },
  isGroup: {
    type: Boolean,
    default: false
  },
  message: {
    type: String,
    default: ""
  },
  mediaUrl: {
    type: String,
    default: null  // base64 encoded media
  },
  mediaType: {
    type: String,
    enum: ["image", "video", "file", null],
    default: null
  },
  mediaName: {
    type: String,
    default: null  // original filename
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  // true for E2E-encrypted DMs (client-encrypted) and server-encrypted group messages
  isEncrypted: {
    type: Boolean,
    default: false
  },
  reactions: [
    {
      emoji: String,
      users: [String] // Array of userNames
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
messageSchema.index({ from: 1, to: 1, createdAt: -1 });

export default mongoose.model('Message', messageSchema);
