// sno-relax-server/models/Content.js
const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
    title: { type: String, required: true, index: true },
    description: { type: String, required: true },
    type: { type: String, required: true, enum: ['article', 'video', 'exercise'], index: true },
    mediaUrl: { type: String },
    createdBy: {
        type: String,
        ref: 'User',
        index: true,
    },
}, { timestamps: true });

contentSchema.index({ type: 1, createdAt: -1 });
contentSchema.index({ title: 'text', description: 'text' });

contentSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

contentSchema.set("toJSON", { virtuals: true });
contentSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model('Content', contentSchema);