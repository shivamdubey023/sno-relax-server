const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  emoji: { type: String, required: true },
}, { _id: false });

const groupMessageSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityGroup', required: true, index: true },
  senderId: { type: String, required: true, index: true },
  senderNickname: { type: String, default: "Anonymous" },
  isAdmin: { type: Boolean, default: false },
  message: { type: String, required: true },
  reactions: { type: [reactionSchema], default: [] },
  readBy: { type: [String], default: [] },
  isEdited: { type: Boolean, default: false },
  editedAt: { type: Date },
  deletedAt: { type: Date },
  isDeleted: { type: Boolean, default: false },
}, { 
  timestamps: true,
  collation: { locale: 'en', strength: 2 }
});

// Index for efficient queries
groupMessageSchema.index({ groupId: 1, createdAt: -1 });
groupMessageSchema.index({ groupId: 1, senderId: 1 });

module.exports = mongoose.model('GroupMessage', groupMessageSchema);
