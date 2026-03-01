import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3
    },
    description: {
        type: String,
        default: ''
    },
    members: [{
        type: String, // array of user names
    }],
    createdBy: {
        type: String,
        required: true
    },
    isPrivate: {
        type: Boolean,
        default: false
    },
    pendingRequests: [{
        type: String, // array of user names
    }],
    lastSeen: {
        type: Map,
        of: String, // Map of userName -> lastReadMessageId
        default: {}
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model('Room', roomSchema);
