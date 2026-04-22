// sno-relax-server/models/Mood.js
const mongoose = require("mongoose");

const moodSchema = new mongoose.Schema({
    userId: {
        type: String,
        ref: "User",
        required: true,
        index: true,
    },
    mood: {
        type: Number,
        required: true,
        min: 0,
        max: 5,
    },
    note: {
        type: String,
        default: "",
    },
    tags: {
        type: [String],
        default: [],
    },
    date: {
        type: Date,
        default: Date.now,
        index: true,
    },
}, { timestamps: true });

moodSchema.index({ userId: 1, date: -1 });
moodSchema.index({ date: -1 });

moodSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

moodSchema.set("toJSON", { virtuals: true });
moodSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Mood", moodSchema);