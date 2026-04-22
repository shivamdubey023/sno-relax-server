// sno-relax-server/models/HealthPlan.js
const mongoose = require('mongoose');

const HealthPlanSchema = new mongoose.Schema({
    userId: {
        type: String,
        ref: 'User',
        required: true,
        index: true,
    },
    guide: { type: Object, default: {} },
    pdf: { type: Buffer },
    pdfMime: { type: String, default: 'application/pdf' },
}, { timestamps: true });

HealthPlanSchema.index({ userId: 1, createdAt: -1 });
HealthPlanSchema.index({ createdAt: -1 });

HealthPlanSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

HealthPlanSchema.set("toJSON", { virtuals: true });
HealthPlanSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model('HealthPlan', HealthPlanSchema);