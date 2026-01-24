const express = require("express");
const router = express.Router();
const ChatHistory = require("../models/ChatHistory");
const TrainingEntry = require('../models/TrainingEntry');
const User = require("../models/User");

const fs = require('fs');
const path = require('path');
const TRAINING_FILE = path.join(__dirname, '..', 'training_data.json');

// ---------------- Save Training ----------------
function saveTrainingEntry(entry) {
  try {
    let arr = [];
    if (fs.existsSync(TRAINING_FILE)) {
      const raw = fs.readFileSync(TRAINING_FILE, 'utf8');
      arr = raw ? JSON.parse(raw) : [];
    }
    arr.push(entry);
    fs.writeFileSync(TRAINING_FILE, JSON.stringify(arr, null, 2));
    
    // ✅ Optionally trigger training script (spawn in background)
    // This calls models/train_bot.py with the training data
    triggerTrainingUpdate(arr);
  } catch (err) {
    console.error('Failed to save training entry:', err);
  }
}

// ✅ NEW: Trigger training update in background (non-blocking with spawn)
function triggerTrainingUpdate(trainingData) {
  try {
    const trainScript = path.join(__dirname, '..', 'models', 'train_bot.py');
    if (!fs.existsSync(trainScript)) return; // train_bot.py not available
    
    // Use spawn (not spawnSync) to run truly in background
    const trainProcess = spawn('python3', [trainScript], {
      detached: true,
      stdio: 'ignore'  // don't capture output
    });
    
    // Unref allows parent process to exit without waiting
    trainProcess.unref();
    
    console.log('📚 Training update triggered (background)');
  } catch (err) {
    console.warn('Training trigger skipped:', err.message);
  }
}

// ✅ FIX: Python Chatbot with proper error checking
// ---------------- Cohere API - Primary Chatbot ----------------
const COHERE_API_KEY = process.env.COHERE_API_KEY;
async function callCohereGenerate(message, userId, sessionId) {
  if (!COHERE_API_KEY) throw new Error('Cohere API key not configured');

  const { CohereClient } = require('cohere-ai');
  const co = new CohereClient({
    token: COHERE_API_KEY,
  });

  const systemPrompt = `You are SnoRelax, a compassionate AI assistant focused on mental health, stress relief, and promoting healthy lifestyles. Your responses should:

1. Show empathy and understanding for users' feelings
2. Provide practical, evidence-based suggestions for stress management
3. Encourage healthy habits like exercise, meditation, and good sleep
4. Promote seeking professional help when appropriate
5. Keep responses supportive, positive, and medically appropriate
6. Focus on wellness, mindfulness, and emotional well-being
7. Avoid giving medical diagnoses or prescribing treatments

Always respond as a caring health companion who guides users toward better mental and physical wellness.`;

  const response = await co.chat({
    message: `${systemPrompt}\n\nUser: ${message}\n\nAssistant:`,
    model: 'command-r-08-2024',
    max_tokens: 300,
    temperature: 0.7,
    k: 0,
    p: 0.75,
    frequency_penalty: 0,
    presence_penalty: 0
  });

  return response.text.trim();
}

// ---------------- Mood Analysis + Habit Suggestions (Cohere) ----------------
async function callCohereAnalyzeMood(userText) {
  if (!COHERE_API_KEY) return null;

  // Ask Cohere to return a small JSON with mood label and 3 habit suggestions
  const moodPrompt = `You are a compassionate mental health assistant. Analyze the user's short message and return a JSON object with two fields:
1) "mood": a single-word mood label (one of: happy, sad, anxious, stressed, neutral, angry, tired, depressed, hopeful) that best summarizes the user's current emotional state.
2) "habits": an array of up to 3 habit suggestion objects. Each habit suggestion should have "title" (short phrase) and "description" (one sentence practical tip). Keep descriptions concise.

Input message:
"""
${userText}
"""

Return ONLY valid JSON. Example:
{"mood":"anxious","habits":[{"title":"Short breathing breaks","description":"Take 3 deep breaths every hour to ground yourself."},{"title":"Move for 5 minutes","description":"Stand up and walk or stretch for 5 minutes to reduce tension."}]}
`;

  try {
    const url = 'https://api.cohere.ai/v1/generate';
    
    // Create AbortController for timeout
    const controller = new AbortController();
    const fetchTimeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout for mood analysis

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${COHERE_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'xlarge',
          prompt: moodPrompt,
          max_tokens: 180,
          temperature: 0.4,
          stop_sequences: ["\n\n"],
        }),
        signal: controller.signal,
      });

      clearTimeout(fetchTimeoutId);

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.warn('Cohere mood analysis failed:', res.status, txt);
        return null;
      }

      const data = await res.json();
      let text = data?.generations?.[0]?.text || '';
      text = text.trim();

      // Try to extract the JSON from the model output
      const jsonStart = text.indexOf('{');
      if (jsonStart >= 0) text = text.slice(jsonStart);
      try {
        const parsed = JSON.parse(text);
        // Basic validation
        if (parsed && (parsed.mood || parsed.habits)) return parsed;
      } catch (e) {
        console.warn('Failed to parse Cohere mood JSON:', e.message);
        return null;
      }
    } catch (err) {
      clearTimeout(fetchTimeoutId);
      throw err;
    }
  } catch (err) {
    console.warn('Error calling Cohere mood analysis:', err.message);
    return null;
  }

  return null;
}

// ---------------- GOOGLE FREE TRANSLATE ----------------

// Detect language (safe with fallback)
async function detectLanguage(text) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) return "en";
    const data = await res.json();
    return (data && data[2]) || "en";
  } catch (err) {
    console.warn("Language detection failed, assuming en:", err.message);
    return "en"; // default to english
  }
}

// Translate text (safe with fallback)
async function translate(text, source, target) {
    try {
    // Skip translation if same language or already en
    if (source === target) return text;

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) return text;
    const data = await res.json();

    if (!data || !Array.isArray(data[0])) return text;

    let translated = "";
    data[0].forEach(chunk => {
      if (chunk && chunk[0]) translated += chunk[0];
    });

    return translated || text;
  } catch (err) {
    console.warn("Translation failed, returning original text:", err.message);
    return text; // return original on error
  }
}

// ---------------- ROUTE ----------------
router.post("/", async (req, res) => {
  const { userId, message, lang = "auto" } = req.body;
  if (!message || !userId) return res.status(400).json({ error: "Message and userId required" });

  try {
    // Check user role
    let userRole = "user";
    try {
      const user = await User.findOne({ $or: [{ userId }, { _id: userId }] });
      if (user?.role) userRole = user.role;
    } catch (err) {
      console.warn("User role check failed:", err);
    }

    // -------- Auto detect + translate to English ----------
    let sourceLang = lang;

    if (lang === "auto") {
      sourceLang = await detectLanguage(message);
    }

    let translatedText = message;
    if (sourceLang !== "en") {
      translatedText = await translate(message, sourceLang, "en");
    }

    // -------- Keyword extraction + prefer-Cohere logic --------
    // If the message contains multiple important keywords (or none), prefer Cohere
    const KEYWORDS = ['stress','anxious','anxiety','depress','sad','happy','sleep','insomnia','tired','panic','work','family','relationship','angry','lonely','overwhelm','suicid'];
    const normalized = (translatedText || '').toLowerCase();
    const matchedKeywords = KEYWORDS.filter(k => normalized.includes(k));
    // prefer Cohere when 2 or more keywords found, or when none are found (open-ended)
    const preferCohere = (matchedKeywords.length >= 2) || (matchedKeywords.length === 0);

    // -------- Fetch Chat History ----------
    const previousChats = await ChatHistory.find({ userId }).sort({ timestamp: 1 });

    let prompt = previousChats
      .map(chat => `User: ${chat.userMessage}\nBot: ${chat.botReply}`)
      .join("\n");

    if (prompt.length) prompt += "\n";
    prompt += `User: ${translatedText}\nBot:`;

    // -------- Bot Logic (Cohere AI Only) ----------
    let botReply = "";
    let source = "cohere";

    // Try Cohere AI
    if (COHERE_API_KEY) {
      try {
        console.log("📡 Calling Cohere AI...");
        botReply = await callCohereGenerate(translatedText, userId, `session_${Date.now()}`);
        console.log(`✅ Got Cohere response: ${String(botReply).substring(0,50)}...`);
      } catch (err) {
        console.error('Cohere error:', err.message);
        botReply = "I'm sorry, I'm having trouble responding right now. Please try again in a moment.";
        source = "error";
      }
    } else {
      console.error('No Cohere API key configured');
      botReply = "Service temporarily unavailable. Please try again later.";
      source = "error";
    }

        const hfData = await hfRes.json();
        botReply = hfData.generated_text || "[No reply from Hugging Face]";
        source = "huggingface";
        console.log(`✅ Got HuggingFace response`);

      } catch (err) {
        console.error("HuggingFace error:", err.message);
        botReply = "";
      }
    }

    // 4. Default friendly response
    if (!botReply) {
      botReply = "I'm here to listen and support you. 🌱 What's on your mind?";
      source = "default";
      console.warn("⚠️ Using default response");
    }

    // -------- Save Chat History ----------
    try {
      await ChatHistory.create({
        userId,
        userMessage: message,
        botReply,
        language: sourceLang
      });
    } catch (err) {
      console.error("Failed to store chat history:", err);
    }

    // -------- Save Training File (background, non-blocking) --------
    // Save to both file (for backup) and DB (for AI health assistant training)
    try {
      const trainingData = {
        userId,
        userMessage: message,
        botReply,
        language: sourceLang,
        source,
        timestamp: new Date().toISOString()
      };
      
      // Save to file (non-blocking)
      saveTrainingEntry(trainingData);
      
      // Also save to DB asynchronously (non-blocking) for future training
      // Persist to DB when the reply came from Cohere OR when we flagged preferCohere
      try {
        if (source === 'cohere' || preferCohere) {
          TrainingEntry.create({
            userId,
            userMessage: message,
            botReply,
            language: sourceLang,
            source,
            processed: false
          }).catch(err => console.warn('Failed to save training entry to DB:', err.message));
        }
      } catch (e) {}
    } catch (e) {
      console.warn('Training save error:', e.message);
    }

    // -------- Mood analysis & habit suggestions (best-effort) --------
    let moodAnalysis = null;
    try {
      // Use user's original message (not translated) for mood analysis when possible
      moodAnalysis = await callCohereAnalyzeMood(message);
    } catch (e) {
      console.warn('Mood analysis failed:', e.message);
    }

    // -------- Translate Bot Reply Back --------
    let finalReply = botReply;
    if (sourceLang !== "en") {
      try {
        finalReply = await translate(botReply, "en", sourceLang);
      } catch (err) {
        console.error("Back translation failed:", err);
      }
    }

    // Return moodAnalysis if available
    const resp = { sender: "bot", text: finalReply, role: userRole };
    if (moodAnalysis) resp.moodAnalysis = moodAnalysis;

    res.json(resp);

  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ sender: "bot", text: "⚠️ Sorry, bot unavailable." });
  }
});

module.exports = router;
