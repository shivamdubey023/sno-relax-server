// sno-relax-server/models/Setting.js
const mongoose = require('mongoose');

const SettingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

SettingSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

SettingSchema.set("toJSON", { virtuals: true });
SettingSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model('Setting', SettingSchema);