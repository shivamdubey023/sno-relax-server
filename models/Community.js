// sno-relax-server/models/Community.js
const mongoose = require('mongoose');

const communitySchema = new mongoose.Schema({
    title: { type: String, required: true, index: true },
    content: { type: String, required: true },
    author: {
        type: String,
        ref: 'User',
        required: true,
        index: true,
    },
    mediaUrl: { type: String },
}, { timestamps: true });

communitySchema.index({ author: 1, createdAt: -1 });
communitySchema.index({ createdAt: -1 });
communitySchema.index({ title: 'text', content: 'text' });

communitySchema.virtual("id").get(function () {
  return this._id.toHexString();
});

communitySchema.set("toJSON", { virtuals: true });
communitySchema.set("toObject", { virtuals: true });

module.exports = mongoose.model('Community', communitySchema);