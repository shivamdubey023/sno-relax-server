// sno-relax-server/models/TrainingEntry.js
const mongoose = require('mongoose');

const TrainingEntrySchema = new mongoose.Schema({
    userId: {
        type: String,
        ref: 'User',
        required: true,
        index: true,
    },
    userMessage: { type: String, required: true },
    botReply: { type: String, default: '' },
    language: { type: String, default: 'en' },
    source: { type: String, default: 'pending' },
    processed: { type: Boolean, default: false, index: true },
}, { timestamps: true });

TrainingEntrySchema.index({ userId: 1, processed: 1 });
TrainingEntrySchema.index({ processed: 1, createdAt: -1 });

TrainingEntrySchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

TrainingEntrySchema.virtual("id").get(function () {
  return this._id.toHexString();
});

TrainingEntrySchema.set("toJSON", { virtuals: true });
TrainingEntrySchema.set("toObject", { virtuals: true });

module.exports = mongoose.model('TrainingEntry', TrainingEntrySchema);