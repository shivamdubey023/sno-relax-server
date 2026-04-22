// sno-relax-server/models/UserProfileChange.js
const mongoose = require("mongoose");

const userProfileChangeSchema = new mongoose.Schema(
  {
    userId: {
        type: String,
        ref: "User",
        required: true,
        index: true,
    },
    fieldName: { type: String, required: true },
    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: String },
  },
  { timestamps: true }
);

userProfileChangeSchema.index({ userId: 1, changedAt: -1 });
userProfileChangeSchema.index({ changedAt: -1 });

userProfileChangeSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

userProfileChangeSchema.set("toJSON", { virtuals: true });
userProfileChangeSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("UserProfileChange", userProfileChangeSchema);