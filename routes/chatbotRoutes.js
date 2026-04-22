// sno-relax-server/routes/chatbotRoutes.js
const express = require("express");
const router = express.Router();
const ChatHistory = require("../models/ChatHistory");
const TrainingEntry = require('../models/TrainingEntry');
const User = require("../models/User");
const chatbotEngine = require('../utils/chatbotEngine');

const fs = require('fs');
const path = require('path');
const TRAINING_FILE = path.join(__dirname, '..', 'training_data.json');

const COHERE_API_KEY = process.env.COHERE_API_KEY;

function saveTrainingEntry(entry) {
  try {
    let arr = [];
    if (fs.existsSync(TRAINING_FILE)) {
      const raw = fs.readFileSync(TRAINING_FILE, 'utf8');
      arr = raw ? JSON.parse(raw) : [];
    }
    arr.push(entry);
    fs.writeFileSync(TRAINING_FILE, JSON.stringify(arr, null, 2));
  } catch (err) {
    console.error('Failed to save training entry:', err);
  }
}

async function callCohereGenerate(message) {
  if (!COHERE_API_KEY) throw new Error('Cohere API key not configured');
  const { CohereClient } = require('cohere-ai');
  const co = new CohereClient({ token: COHERE_API_KEY });

  const systemPrompt = `You are SnoRelax, a compassionate AI assistant focused on mental health, stress relief, and promoting healthy lifestyles. Keep responses supportive, positive, brief (under 200 words), and do not provide medical diagnoses.`;

  const response = await co.chat({
    message: `${systemPrompt}\n\nUser: ${message}\n\nAssistant:`,
    model: 'command-r-08-2024',
    max_tokens: 300,
    temperature: 0.7,
    k: 0,
    p: 0.75,
  });

  return response.text.trim();
}

async function detectLanguage(text) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) return "en";
    const data = await res.json();
    return (data && data[2]) || "en";
  } catch (err) {
    return "en";
  }
}

async function translate(text, source, target) {
  if (source === target || !text) return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) return text;
    const data = await res.json();
    if (!data || !Array.isArray(data[0])) return text;
    let translated = "";
    data[0].forEach(chunk => { if (chunk && chunk[0]) translated += chunk[0]; });
    return translated || text;
  } catch (err) {
    return text;
  }
}

router.post("/fast", async (req, res) => {
  const { userId, message, lang = "auto" } = req.body;
  if (!message || !userId) return res.status(400).json({ error: "Message and userId required" });

  try {
    let sourceLang = lang === "auto" ? await detectLanguage(message) : lang;
    let translatedText = message;
    if (sourceLang !== "en") {
      translatedText = await translate(message, sourceLang, "en");
    }

    const localResponse = chatbotEngine.getLocalResponse(translatedText, userId);
    
    if (localResponse) {
      let finalReply = localResponse.text;
      if (sourceLang !== "en") {
        finalReply = await translate(finalReply, "en", sourceLang);
      }

      ChatHistory.create({
        userId,
        userMessage: message,
        botReply: finalReply,
        language: sourceLang
      }).catch(() => {});

      return res.json({
        sender: "bot",
        text: finalReply,
        source: 'local',
        intent: localResponse.intent,
        mood: localResponse.mood
      });
    }

    if (COHERE_API_KEY) {
      try {
        const botReply = await Promise.race([
          callCohereGenerate(translatedText),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
        ]);

        let finalReply = botReply;
        if (sourceLang !== "en") {
          finalReply = await translate(botReply, "en", sourceLang);
        }

        ChatHistory.create({
          userId,
          userMessage: message,
          botReply: finalReply,
          language: sourceLang
        }).catch(() => {});

        return res.json({ sender: "bot", text: finalReply, source: 'cohere' });
      } catch (e) {
        console.warn('Cohere failed, falling back to local:', e.message);
      }
    }

    res.json({
      sender: "bot",
      text: "I'm here to listen and support you. What's on your mind?",
      source: 'default'
    });

  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ sender: "bot", text: "Sorry, something went wrong. Please try again." });
  }
});

router.post("/", async (req, res) => {
  const { userId, message, lang = "auto" } = req.body;
  if (!message || !userId) return res.status(400).json({ error: "Message and userId required" });

  try {
    let userRole = "user";
    try {
      const user = await User.findOne({ $or: [{ userId }, { _id: userId }] });
      if (user?.role) userRole = user.role;
    } catch (err) {}

    let sourceLang = lang === "auto" ? await detectLanguage(message) : lang;
    let translatedText = message;
    if (sourceLang !== "en") {
      translatedText = await translate(message, sourceLang, "en");
    }

    const KEYWORDS = ['stress', 'anxious', 'anxiety', 'depress', 'sad', 'happy', 'sleep', 'tired', 'panic', 'work', 'family', 'angry', 'lonely'];
    const normalized = translatedText.toLowerCase();
    const matchedKeywords = KEYWORDS.filter(k => normalized.includes(k));
    const preferLocal = matchedKeywords.length >= 2;

    let localResponse = null;
    if (preferLocal) {
      localResponse = chatbotEngine.getLocalResponse(translatedText, userId);
    }

    let botReply = "";
    let source = "unknown";

    if (localResponse) {
      botReply = localResponse.text;
      source = 'local';
    } else if (COHERE_API_KEY) {
      try {
        botReply = await Promise.race([
          callCohereGenerate(translatedText),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
        ]);
        source = 'cohere';
      } catch (err) {
        console.error('Cohere error:', err.message);
        botReply = "";
      }
    }

    if (!botReply) {
      botReply = "I'm here to listen and support you. How are you feeling right now?";
      source = 'fallback';
    }

    let finalReply = botReply;
    if (sourceLang !== "en") {
      finalReply = await translate(botReply, "en", sourceLang);
    }

    ChatHistory.create({
      userId,
      userMessage: message,
      botReply: finalReply,
      language: sourceLang
    }).catch(err => console.error("Failed to store chat history:", err));

    if (source === 'cohere' || source === 'local') {
      TrainingEntry.create({
        userId,
        userMessage: message,
        botReply: finalReply,
        language: sourceLang,
        source,
        processed: false
      }).catch(() => {});
    }

    const moodAnalysis = chatbotEngine.detectMoodFromText(message);

    const resp = { sender: "bot", text: finalReply, role: userRole, source };
    if (moodAnalysis.score > 0) {
      resp.moodAnalysis = {
        mood: moodAnalysis.mood,
        confidence: moodAnalysis.confidence
      };
    }

    res.json(resp);

  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ sender: "bot", text: "Sorry, bot unavailable." });
  }
});

module.exports = router;