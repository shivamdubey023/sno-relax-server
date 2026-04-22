// sno-relax-server/models/CommunityGroup.js
const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
    userId: {
        type: String,
        ref: 'User',
        required: true,
    },
    nickname: { type: String, default: "Anonymous" },
    joinedAt: { type: Date, default: Date.now },
}, { _id: true });

const communityGroupSchema = new mongoose.Schema({
    name: { type: String, required: true, index: true },
    description: { type: String, default: "" },
    createdBy: {
        type: String,
        ref: 'User',
        required: true,
        index: true,
    },
    adminId: {
        type: String,
        ref: 'User',
        required: true,
        index: true,
    },
    isPrivate: { type: Boolean, default: false },
    inviteCode: { type: String, sparse: true, index: true },
    members: [memberSchema],
    isActive: { type: Boolean, default: true, index: true },
    maxMembers: { type: Number, default: 50 },
}, { timestamps: true });

communityGroupSchema.index({ name: 'text' });
communityGroupSchema.index({ isPrivate: 1, isActive: 1 });

communityGroupSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

communityGroupSchema.set("toJSON", { virtuals: true });
communityGroupSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model('CommunityGroup', communityGroupSchema);