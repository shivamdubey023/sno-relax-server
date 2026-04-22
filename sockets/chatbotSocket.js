module.exports = function (io) {
  const ChatHistory = require('../models/ChatHistory');
  const TrainingEntry = require('../models/TrainingEntry');
  const chatbotEngine = require('../utils/chatbotEngine');

  console.log('🤖 ChatBot Socket initialized');

  const { CohereClient } = (() => {
    try { return require('cohere-ai'); } catch (e) { return {}; }
  })();
  const COHERE_API_KEY = process.env.COHERE_API_KEY;
  const fetch = (...args) => import('node-fetch').then(m => m.default(...args));

  async function detectLanguage(text) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      return res.ok ? (await res.json())?.[2] || 'en' : 'en';
    } catch (err) { return 'en'; }
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
      let translated = '';
      data[0].forEach(chunk => { if (chunk && chunk[0]) translated += chunk[0]; });
      return translated || text;
    } catch (err) { return text; }
  }

  async function callCohereGenerate(message) {
    if (!COHERE_API_KEY || !CohereClient) throw new Error('Cohere API key not configured');
    const co = new CohereClient({ token: COHERE_API_KEY });
    const response = await co.chat({
      message: `You are SnoRelax, a compassionate mental health assistant. Keep responses supportive, positive, brief (under 200 words).\n\nUser: ${message}\n\nAssistant:`,
      model: 'command-r-08-2024',
      max_tokens: 300,
      temperature: 0.7,
    });
    return response.text.trim();
  }

  io.on('connection', (socket) => {
    console.log(`🤖 ChatBot client connected: ${socket.id}`);

    socket.on('chatbotMessage', async (payload) => {
      try {
        const { userId, message, lang = 'auto' } = payload || {};
        if (!userId || !message) return socket.emit('chatbotError', { error: 'userId and message required' });

        let sourceLang = lang === 'auto' ? await detectLanguage(message) : lang;
        let translatedText = message;
        if (sourceLang !== 'en') translatedText = await translate(message, sourceLang, 'en');

        const localResponse = chatbotEngine.getLocalResponse(translatedText, userId);
        let botReply = '';
        let source = 'local';

        if (localResponse) {
          botReply = localResponse.text;
        } else if (COHERE_API_KEY) {
          try {
            botReply = await Promise.race([
              callCohereGenerate(translatedText),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
            ]);
            source = 'cohere';
          } catch (err) {
            console.warn('Cohere failed:', err.message);
          }
        }

        if (!botReply) {
          botReply = "I'm here to listen and support you. What's on your mind?";
          source = 'fallback';
        }

        let finalReply = botReply;
        if (sourceLang !== 'en') {
          finalReply = await translate(botReply, 'en', sourceLang);
        }

        ChatHistory.create({ userId, userMessage: message, botReply: finalReply, language: sourceLang }).catch(() => {});

        if (source === 'cohere') {
          TrainingEntry.create({ userId, userMessage: message, botReply: finalReply, language: sourceLang, source }).catch(() => {});
        }

        const moodAnalysis = chatbotEngine.detectMoodFromText(message);
        socket.emit('chatbotResponse', { sender: 'bot', text: finalReply, source, mood: localResponse?.mood || moodAnalysis.mood });

      } catch (err) {
        console.error('chatbotMessage error:', err.message);
        socket.emit('chatbotError', { error: 'internal error' });
      }
    });

    socket.on('chatbotFast', async (payload) => {
      try {
        const { userId, message, lang = 'auto' } = payload || {};
        if (!userId || !message) return socket.emit('chatbotError', { error: 'userId and message required' });

        let sourceLang = lang === 'auto' ? await detectLanguage(message) : lang;
        let translatedText = message;
        if (sourceLang !== 'en') translatedText = await translate(message, sourceLang, 'en');

        const localResponse = chatbotEngine.getLocalResponse(translatedText, userId);
        
        if (localResponse) {
          let finalReply = localResponse.text;
          if (sourceLang !== 'en') finalReply = await translate(finalReply, 'en', sourceLang);
          
          ChatHistory.create({ userId, userMessage: message, botReply: finalReply, language: sourceLang }).catch(() => {});
          return socket.emit('chatbotResponse', { sender: 'bot', text: finalReply, source: 'local', intent: localResponse.intent });
        }

        if (COHERE_API_KEY) {
          try {
            const botReply = await Promise.race([
              callCohereGenerate(translatedText),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
            ]);
            
            let finalReply = botReply;
            if (sourceLang !== 'en') finalReply = await translate(botReply, 'en', sourceLang);
            
            ChatHistory.create({ userId, userMessage: message, botReply: finalReply, language: sourceLang }).catch(() => {});
            return socket.emit('chatbotResponse', { sender: 'bot', text: finalReply, source: 'cohere' });
          } catch (err) {
            console.warn('Cohere failed:', err.message);
          }
        }

        socket.emit('chatbotResponse', { sender: 'bot', text: "I'm here to listen and support you. What's on your mind?", source: 'fallback' });

      } catch (err) {
        console.error('chatbotFast error:', err.message);
        socket.emit('chatbotError', { error: 'internal error' });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`🤖 ChatBot client disconnected: ${socket.id} (${reason})`);
    });
  });
};