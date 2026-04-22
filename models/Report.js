// sno-relax-server/models/Report.js
const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    title: { type: String, required: true, index: true },
    description: { type: String, required: true },
    reportedBy: {
        type: String,
        ref: 'User',
        index: true,
    },
    metadata: { type: Object, default: {} },
}, { timestamps: true });

ReportSchema.index({ reportedBy: 1, createdAt: -1 });
ReportSchema.index({ createdAt: -1 });

ReportSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

ReportSchema.set("toJSON", { virtuals: true });
ReportSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model('Report', ReportSchema);