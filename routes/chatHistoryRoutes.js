const express = require("express");
const router = express.Router();
const ChatHistory = require("../models/ChatHistory");

router.get("/", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "UserId required" });
  }

  try {
    const history = await ChatHistory.find({ userId }).sort({ timestamp: 1 });

    const formatted = history.map(h => ({
      userMessage: h.userMessage,
      botReply: h.botReply,
    }));

    res.json(formatted);
  } catch (err) {
    console.error("Chat history error:", err);
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
});

module.exports = router;
