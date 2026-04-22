// sno-relax-server/models/PrivateMessage.js
const mongoose = require('mongoose');

const privateMessageSchema = new mongoose.Schema({
    senderId: {
        type: String,
        ref: 'User',
        required: true,
        index: true,
    },
    receiverId: {
        type: String,
        ref: 'User',
        required: true,
        index: true,
    },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
}, { timestamps: true });

privateMessageSchema.index({ senderId: 1, createdAt: -1 });
privateMessageSchema.index({ receiverId: 1, createdAt: -1 });
privateMessageSchema.index({ senderId: 1, receiverId: 1 });
privateMessageSchema.index({ receiverId: 1, isRead: 1 });

privateMessageSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

privateMessageSchema.set("toJSON", { virtuals: true });
privateMessageSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model('PrivateMessage', privateMessageSchema);