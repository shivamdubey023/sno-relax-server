// sno-relax-server/models/ChatHistory.js
const mongoose = require('mongoose');

const chatHistorySchema = new mongoose.Schema({
    userId: {
        type: String,
        ref: 'User',
        required: true,
        index: true,
    },
    userMessage: { type: String, required: true },
    botReply: { type: String },
    language: { type: String, default: 'en' },
    timestamp: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

chatHistorySchema.index({ userId: 1, timestamp: -1 });

chatHistorySchema.virtual("id").get(function () {
  return this._id.toHexString();
});

chatHistorySchema.set("toJSON", { virtuals: true });
chatHistorySchema.set("toObject", { virtuals: true });

module.exports = mongoose.model('ChatHistory', chatHistorySchema);