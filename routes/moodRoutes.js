const express = require("express");
const router = express.Router();
const Mood = require("../models/Mood");

// ✅ Add a new mood entry
router.post("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { mood } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    if (mood === undefined || mood === null || typeof mood !== 'number') {
      return res.status(400).json({ error: "mood must be a number" });
    }

    const moodValue = Number(mood);
    if (isNaN(moodValue) || moodValue < 0 || moodValue > 5) {
      return res.status(400).json({ error: "mood must be a number between 0 and 5" });
    }

    const entry = await Mood.create({
      userId,
      mood: moodValue,
      date: new Date(),
    });

    return res.status(201).json({ ok: true, entry });
  } catch (err) {
    console.error("❌ Error saving mood:", err);
    res.status(500).json({ ok: false, error: "Failed to save mood" });
  }
});

// ✅ Get all moods for a specific user
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const moods = await Mood.find({ userId }).sort({ date: 1 });
    return res.json({ ok: true, moods });
  } catch (err) {
    console.error("❌ Error fetching moods:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch moods" });
  }
});

// ✅ Delete all moods for a user (optional admin)
router.delete("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    await Mood.deleteMany({ userId });
    return res.json({ ok: true, message: "All moods deleted for this user" });
  } catch (err) {
    console.error("❌ Error deleting moods:", err);
    res.status(500).json({ ok: false, error: "Failed to delete moods" });
  }
});

module.exports = router;
