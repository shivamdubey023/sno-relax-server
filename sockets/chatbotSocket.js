module.exports = function (io) {
  const ChatHistory = require('../models/ChatHistory');
  const TrainingEntry = require('../models/TrainingEntry');
  const User = require('../models/User');

  const { CohereClient } = (() => {
    try {
      return require('cohere-ai');
    } catch (e) {
      return {};
    }
  })();

  const COHERE_API_KEY = process.env.COHERE_API_KEY;

  const fetch = (...args) => import('node-fetch').then(m => m.default(...args));

  async function detectLanguage(text) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      if (!res.ok) return 'en';
      const data = await res.json();
      return (data && data[2]) || 'en';
    } catch (err) {
      console.warn('Language detection failed:', err.message);
      return 'en';
    }
  }

  async function translate(text, source, target) {
    try {
      if (!text) return text;
      if (source === target) return text;
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      if (!res.ok) return text;
      const data = await res.json();
      if (!data || !Array.isArray(data[0])) return text;
      let translated = '';
      data[0].forEach(chunk => { if (chunk && chunk[0]) translated += chunk[0]; });
      return translated || text;
    } catch (err) {
      console.warn('Translation failed:', err.message);
      return text;
    }
  }

  async function callCohereGenerate(message) {
    if (!COHERE_API_KEY || !CohereClient) throw new Error('Cohere API key not configured');
    const co = new CohereClient({ token: COHERE_API_KEY });

    const systemPrompt = `You are SnoRelax, a compassionate AI assistant focused on mental health, stress relief, and promoting healthy lifestyles. Keep responses supportive, positive, brief, and do not provide medical diagnoses.`;

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

  async function callCohereAnalyzeMood(userText) {
    if (!COHERE_API_KEY) return null;

    const moodPrompt = `You are a compassionate mental health assistant. Analyze the user's short message and return a JSON object with two fields:\n1) \"mood\": a single-word mood label (one of: happy, sad, anxious, stressed, neutral, angry, tired, depressed, hopeful)\n2) \"habits\": an array of up to 3 habit suggestion objects with \"title\" and \"description\". Return ONLY valid JSON.\n\nInput message:\n"""\n${userText}\n"""\n`;

    try {
      const url = 'https://api.cohere.ai/v1/generate';
      const controller = new AbortController();
      const fetchTimeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${COHERE_API_KEY}` },
        body: JSON.stringify({ model: 'xlarge', prompt: moodPrompt, max_tokens: 180, temperature: 0.4, stop_sequences: ['\n\n'] }),
        signal: controller.signal
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
      const jsonStart = text.indexOf('{');
      if (jsonStart >= 0) text = text.slice(jsonStart);
      try {
        const parsed = JSON.parse(text);
        if (parsed && (parsed.mood || parsed.habits)) return parsed;
      } catch (e) {
        console.warn('Failed to parse Cohere mood JSON:', e.message);
        return null;
      }

    } catch (err) {
      console.warn('Error calling Cohere mood analysis:', err.message);
      return null;
    }

    return null;
  }

  io.on('connection', (socket) => {
    socket.on('chatbotMessage', async (payload) => {
      try {
        const { userId, message, lang = 'auto' } = payload || {};
        if (!userId || !message) return socket.emit('chatbotError', { error: 'userId and message required' });

        // detect language and translate to en
        let sourceLang = lang;
        if (lang === 'auto') sourceLang = await detectLanguage(message);
        let translatedText = message;
        if (sourceLang !== 'en') translatedText = await translate(message, sourceLang, 'en');

        // prefer Cohere and call it
        let botReply = '';
        let source = 'cohere';
        if (COHERE_API_KEY) {
          try {
            botReply = await callCohereGenerate(translatedText);
          } catch (err) {
            console.error('Cohere error (socket):', err.message);
            botReply = "I'm sorry, I'm having trouble responding right now. Please try again in a moment.";
            source = 'error';
          }
        } else {
          botReply = 'Service temporarily unavailable. Please try again later.';
          source = 'error';
        }

        if (!botReply) {
          botReply = "I'm here to listen and support you. What's on your mind?";
          source = 'default';
        }

        // save history
        try {
          await ChatHistory.create({ userId, userMessage: message, botReply, language: sourceLang });
        } catch (err) {
          console.warn('Failed to save chat history (socket):', err.message);
        }

        // save training entry (non-blocking)
        try {
          if (source === 'cohere') {
            TrainingEntry.create({ userId, userMessage: message, botReply, language: sourceLang, source }).catch(e => {});
          }
        } catch (e) {}

        // mood analysis
        let moodAnalysis = null;
        try { moodAnalysis = await callCohereAnalyzeMood(message); } catch (e) { }

        // translate reply back
        let finalReply = botReply;
        if (sourceLang !== 'en') {
          try { finalReply = await translate(botReply, 'en', sourceLang); } catch (e) { }
        }

        // emit back
        const resp = { sender: 'bot', text: finalReply, moodAnalysis };
        socket.emit('chatbotResponse', resp);

      } catch (err) {
        console.error('chatbotMessage error:', err.message);
        socket.emit('chatbotError', { error: 'internal error' });
      }
    });
  });
};