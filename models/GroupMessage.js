// sno-relax-server/models/GroupMessage.js
const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
    userId: {
        type: String,
        ref: 'User',
        required: true,
    },
    emoji: { type: String, required: true },
}, { _id: true });

const groupMessageSchema = new mongoose.Schema({
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CommunityGroup',
        required: true,
        index: true,
    },
    senderId: {
        type: String,
        ref: 'User',
        required: true,
        index: true,
    },
    senderNickname: { type: String, default: "Anonymous" },
    isAdmin: { type: Boolean, default: false },
    message: { type: String, required: true },
    reactions: { type: [reactionSchema], default: [] },
    readBy: [{
        type: String,
        ref: 'User',
    }],
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date },
    deletedAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
}, { 
    timestamps: true,
    collation: { locale: 'en', strength: 2 }
});

groupMessageSchema.index({ groupId: 1, createdAt: -1 });
groupMessageSchema.index({ groupId: 1, senderId: 1 });
groupMessageSchema.index({ senderId: 1, createdAt: -1 });

groupMessageSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

groupMessageSchema.set("toJSON", { virtuals: true });
groupMessageSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model('GroupMessage', groupMessageSchema);