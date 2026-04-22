// sno-relax-server/models/Announcement.js
const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
    title: { type: String, required: true, index: true },
    description: { type: String },
    targetGroups: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CommunityGroup',
    }],
    createdBy: {
        type: String,
        ref: 'User',
        index: true,
    },
    dateTime: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

announcementSchema.index({ createdBy: 1, dateTime: -1 });
announcementSchema.index({ dateTime: -1 });

announcementSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

announcementSchema.set("toJSON", { virtuals: true });
announcementSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model('Announcement', announcementSchema);