const express = require('express');
const router = express.Router();
const ChatHistory = require('../models/ChatHistory');
const Mood = require('../models/Mood');
const User = require('../models/User');
const HealthPlan = require('../models/HealthPlan');
const TrainingEntry = require('../models/TrainingEntry');
// Robust fetch loader: support CommonJS (node-fetch) and dynamic import for ESM builds
let fetch;
try {
  const nf = require('node-fetch');
  fetch = nf && nf.default ? nf.default : nf;
} catch (e) {
  fetch = (...args) => import('node-fetch').then(m => m.default(...args));
}

let PDFDocument;
try { PDFDocument = require('pdfkit'); } catch (e) { PDFDocument = null; }

const COHERE_API_KEY = process.env.COHERE_API_KEY;

async function callCohereGuide(prompt) {
  if (!COHERE_API_KEY) throw new Error('Cohere API key not configured');
  const url = 'https://api.cohere.ai/v1/generate';
  const enhanced = `You are SnoBot, a compassionate mental health assistant. Given the user's concise history and mood data, produce a short JSON object with keys: summary (one short paragraph), urgent (true/false), recommendations (array of objects with title, type("yoga"|"exercise"|"breathing"|"lifestyle"), durationMinutes, intensity("low"|"moderate"|"high"), steps (array of short step instructions)). Keep responses safe and do not provide medical diagnoses. User data:\n${prompt}\nRespond ONLY with valid JSON.`;

  // Create AbortController for timeout
  const controller = new AbortController();
  const fetchTimeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout for guide generation

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${COHERE_API_KEY}` },
      body: JSON.stringify({ model: 'xlarge', prompt: enhanced, max_tokens: 300, temperature: 0.7 }),
      signal: controller.signal,
    });

    clearTimeout(fetchTimeoutId);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Cohere failed: ${res.status} ${text}`);
    }
    const data = await res.json();
    const text = data?.generations?.[0]?.text || '';
    // Try to extract JSON
    const jsonStart = text.indexOf('{');
    const jsonText = jsonStart !== -1 ? text.slice(jsonStart) : text;
    try {
      const obj = JSON.parse(jsonText);
      return obj;
    } catch (e) {
      // If parsing fails, return a fallback structure
      return { summary: text.trim().split('\n')[0] || '', urgent: false, recommendations: [] };
    }
  } catch (err) {
    clearTimeout(fetchTimeoutId);
    throw err;
  }
}

// Local JS fallback generator (no third-party)
function localGuideFromData({ history, moods, profile }) {
  const recent = (history || []).slice(-10).map(h => h.userMessage || h.userMessage || '').join(' \n ');
  const moodKeywords = (moods || []).map(m => m.note || m.mood || '').join(' ').toLowerCase();
  const textBlob = `${recent} ${moodKeywords} ${profile?.history || ''}`.toLowerCase();

  const contains = (words) => words.some(w => textBlob.includes(w));

  const recs = [];
  // Breathing exercises for stress/anxiety
  if (contains(['stress','anx','panic','overwhelm','overwhelmed','worry'])) {
    recs.push({ title: '4-7-8 Breathing', type: 'breathing', durationMinutes: 5, intensity: 'low', steps: ['Sit comfortably','Inhale for 4 seconds','Hold for 7 seconds','Exhale slowly for 8 seconds','Repeat 4 cycles'] });
    recs.push({ title: 'Gentle Yoga Flow', type: 'yoga', durationMinutes: 10, intensity: 'low', steps: ['Child pose - 1 min','Cat-Cow - 1 min','Downward dog - 1 min','Low lunge each side - 1 min','Savasana - 3 min'] });
  }

  // Low energy -> light movement + sleep hygiene
  if (contains(['tired','fatigue','sleep','insomnia','sleeping'])) {
    recs.push({ title: 'Evening Stretch & Wind-down', type: 'lifestyle', durationMinutes: 12, intensity: 'low', steps: ['Gentle neck rolls - 1 min','Seated forward fold - 2 min','Legs up the wall - 5 min','Deep breathing - 4 min'] });
  }

  // General fitness suggestions
  if (recs.length === 0) {
    recs.push({ title: 'Quick Bodyweight Circuit', type: 'exercise', durationMinutes: 12, intensity: 'moderate', steps: ['Jumping jacks - 1 min','Bodyweight squats - 1 min','Push-ups (knees ok) - 1 min','Plank - 45s','Rest 30s and repeat 2x'] });
    recs.push({ title: 'Morning Mobility', type: 'yoga', durationMinutes: 8, intensity: 'low', steps: ['Neck circles - 30s','Shoulder rolls - 30s','Hip circles - 1 min','Sun salutations x3 - 5 min'] });
  }

  return { summary: (recent || 'No significant chat history available.').slice(0, 300), urgent: false, recommendations: recs };
}

router.post('/guide', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    // Fetch recent chat history
    const history = await ChatHistory.find({ userId }).sort({ timestamp: 1 }).limit(200);
    // Fetch recent moods
    let moods = [];
    try { moods = await Mood.find({ userId }).sort({ date: -1 }).limit(7); } catch (e) {}
    // User profile
    let profile = {};
    try { profile = (await User.findOne({ $or: [{ userId }, { _id: userId }] })) || {}; } catch (e) {}

    // Prepare compact prompt
    const compact = {
      history: history.slice(-20).map(h => ({ userMessage: h.userMessage, botReply: h.botReply })),
      moods: moods.map(m => ({ mood: m.mood, note: m.notes || m.note || '', date: m.date })),
      profile: { firstName: profile.firstName, history: profile.history }
    };

    // Try Cohere first
    if (COHERE_API_KEY) {
      try {
        const prompt = JSON.stringify(compact);
        const guide = await callCohereGuide(prompt);
        return res.json({ ok: true, guide });
      } catch (err) {
        console.warn('Cohere guide failed, falling back to local generator:', err.message);
      }
    }

    // Local fallback
    const guide = localGuideFromData(compact);
    res.json({ ok: true, guide });
  } catch (err) {
    console.error('AI guide error:', err);
    res.status(500).json({ error: err.message });
  }
});

  // Generate weekly plan, save in DB, and return plan id + guide
  router.post('/generate-weekly-plan', async (req, res) => {
    const { userId, days = 7, includePdf = true } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });

    try {
      // collect last N days of chat history
      const since = new Date(Date.now() - (Number(days) || 7) * 24 * 60 * 60 * 1000);
      const history = await ChatHistory.find({ userId, timestamp: { $gte: since } }).sort({ timestamp: 1 }).limit(1000);
      let moods = [];
      try { moods = await Mood.find({ userId, date: { $gte: since } }).sort({ date: 1 }).limit(100); } catch (e) {}
      let profile = {};
      try { profile = (await User.findOne({ $or: [{ userId }, { _id: userId }] })) || {}; } catch (e) {}

      const compact = {
        history: history.map(h => ({ userMessage: h.userMessage, botReply: h.botReply, timestamp: h.timestamp })),
        moods: moods.map(m => ({ mood: m.mood, note: m.notes || m.note || '', date: m.date })),"}]}]}
        profile: { firstName: profile.firstName ? 'REDACTED' : undefined, history: profile.history }
      };

      // generate guide using existing helper
      let guide = null;
      if (COHERE_API_KEY) {
        try {
          guide = await callCohereGuide(JSON.stringify(compact));
        } catch (err) {
          console.warn('Cohere guide failed, using fallback:', err.message);
        }
      }
      if (!guide) guide = localGuideFromData(compact);

      // Build PDF (if requested and PDF lib available)
      let pdfBuffer = null;
      if (includePdf && PDFDocument) {
        try {
          const doc = new PDFDocument({ margin: 40 });
          const chunks = [];
          doc.on('data', (c) => chunks.push(c));
          const title = `Weekly Health Plan - ${new Date().toLocaleDateString()}`;
          doc.fontSize(18).text(title, { align: 'center' });
          doc.moveDown();
          doc.fontSize(12).text('Summary:', { underline: true });
          doc.moveDown(0.2);
          doc.fontSize(11).text(guide.summary || 'No summary available');
          doc.moveDown();

          if (guide.recommendations && guide.recommendations.length) {
            doc.fontSize(12).text('Recommendations:', { underline: true });
            guide.recommendations.forEach((r, idx) => {
              doc.moveDown(0.2);
              doc.fontSize(11).text(`${idx+1}. ${r.title} (${r.type}, ${r.durationMinutes || '-'} min, ${r.intensity || '-'})`);
              if (Array.isArray(r.steps)) {
                r.steps.forEach((s, si) => doc.text(`   - ${s}`));
              }
            });
          }

          doc.addPage();
          doc.fontSize(12).text('Mood Log (last entries):', { underline: true });
          (moods || []).slice(-20).forEach(m => {
            doc.moveDown(0.1);
            doc.fontSize(10).text(`${new Date(m.date).toLocaleString()} • ${m.mood} • ${m.notes || ''}`);
          });

          doc.addPage();
          doc.fontSize(12).text('Chat excerpts:', { underline: true });
          (history || []).slice(-50).forEach(h => {
            doc.moveDown(0.1);
            doc.fontSize(10).text(`User: ${h.userMessage}`);
            if (h.botReply) doc.fontSize(10).text(`Bot: ${h.botReply}`);
          });

          doc.end();
          await new Promise((resolve) => doc.on('end', resolve));
          pdfBuffer = Buffer.concat(chunks);
        } catch (e) {
          console.warn('PDF generation failed:', e.message);
          pdfBuffer = null;
        }
      }

      // Save plan in DB (no PII)
      const plan = await HealthPlan.create({ userId, guide, pdf: pdfBuffer || undefined, pdfMime: pdfBuffer ? 'application/pdf' : undefined });

      // Return plan id and guide summary
      res.json({ ok: true, planId: plan._id, guide });
    } catch (err) {
      console.error('generate-weekly-plan error:', err);
      res.status(500).json({ error: err.message });
    }
  });

// Endpoint to retrieve training data for AI learning/analysis
// This endpoint is used by the AI health assistant to learn from past interactions
router.get('/training-data/:userId', async (req, res) => {
  const { userId } = req.params;
  const { limit = 100, days = 30 } = req.query;

  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    // Get training entries from the last N days
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
    const entries = await TrainingEntry.find({
      userId,
      createdAt: { $gte: since }
    }).sort({ createdAt: -1 }).limit(Number(limit));

    // Also include mood data for context
    const moods = await Mood.find({
      userId,
      createdAt: { $gte: since }
    }).sort({ createdAt: -1 }).limit(50);

    res.json({
      ok: true,
      trainingEntries: entries,
      moodData: moods,
      total: entries.length,
      moodTotal: moods.length
    });
  } catch (err) {
    console.error('training-data error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to get stats on training data collection (for monitoring)
router.get('/training-stats/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    const total = await TrainingEntry.countDocuments({ userId });
    const cohere = await TrainingEntry.countDocuments({ userId, source: 'cohere' });
    const python = await TrainingEntry.countDocuments({ userId, source: 'python' });
    const huggingface = await TrainingEntry.countDocuments({ userId, source: 'huggingface' });
    const unprocessed = await TrainingEntry.countDocuments({ userId, processed: false });

    res.json({
      ok: true,
      stats: {
        total,
        bySource: { cohere, python, huggingface },
        unprocessed
      }
    });
  } catch (err) {
    console.error('training-stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/progress/:userId - weekly progress insights (mood + chat keywords)
router.get('/progress/:userId', async (req, res) => {
  const { userId } = req.params;
  const days = Number(req.query.days || 7);
  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // Fetch moods in the period
    const moods = await Mood.find({ userId, date: { $gte: since } }).sort({ date: 1 }).lean();

    // Fetch chat history in the period
    const chats = await ChatHistory.find({ userId, timestamp: { $gte: since } }).sort({ timestamp: 1 }).lean();

    // Compute simple mood stats
    const moodValues = moods.map(m => Number(m.mood || 0));
    const count = moodValues.length;
    const avg = count ? (moodValues.reduce((a,b)=>a+b,0)/count) : null;
    const firstAvg = count >= 3 ? (moodValues.slice(0, Math.ceil(count/2)).reduce((a,b)=>a+b,0) / Math.max(1, Math.ceil(count/2))) : avg;
    const lastAvg = count >= 3 ? (moodValues.slice(Math.floor(count/2)).reduce((a,b)=>a+b,0) / Math.max(1, Math.floor(count/2))) : avg;
    const trend = (firstAvg !== null && lastAvg !== null) ? (lastAvg - firstAvg) : 0; // positive = improving

    // Find best/worst days
    let best = null, worst = null;
    if (moods.length) {
      const grouped = {};
      moods.forEach(m => {
        const d = new Date(m.date).toISOString().slice(0,10);
        grouped[d] = grouped[d] || [];
        grouped[d].push(Number(m.mood || 0));
      });
      const daysList = Object.keys(grouped).map(d => ({ day: d, avg: grouped[d].reduce((a,b)=>a+b,0)/grouped[d].length }));
      daysList.sort((a,b)=>b.avg - a.avg);
      best = daysList[0] || null;
      worst = daysList[daysList.length-1] || null;
    }

    // Extract keywords from chat messages
    const text = chats.map(c => (c.userMessage || '')).join(' ').toLowerCase();
    const KEYWORDS = ['stress','anxiety','sleep','insomnia','tired','depress','sad','panic','work','family','relationship','lonely','overwhelm','angry','suicid','pain','headache','bp','blood','sugar','diabetes'];
    const keywordCounts = {};
    KEYWORDS.forEach(k => { const re = new RegExp(`\\b${k}\\w*\\b`,'g'); const matches = text.match(re); if (matches && matches.length) keywordCounts[k] = matches.length; });
    // top keywords
    const topKeywords = Object.entries(keywordCounts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,c])=>({ keyword:k, count:c }));

    // Basic recommended actions mapping
    const recommendations = [];
    if (topKeywords.some(t=>['stress','anxiety','panic','overwhelm','worry'].includes(t.keyword))) {
      recommendations.push({ title: 'Breathing & Grounding', reason: 'High stress/anxiety keywords found', tips: ['Try 4-7-8 breathing for 5 minutes','Take a 5-minute walk to break rumination'] });
    }
    if (topKeywords.some(t=>['sleep','insomnia','tired'].includes(t.keyword))) {
      recommendations.push({ title: 'Sleep Hygiene', reason: 'Sleep-related keywords found', tips: ['Avoid screens 1 hour before bed','Keep consistent sleep/wake times','Limit caffeine after midday'] });
    }
    if (topKeywords.some(t=>['depress','sad','lonely'].includes(t.keyword))) {
      recommendations.push({ title: 'Social Connection & Low-Intensity Activity', reason: 'Low mood keywords found', tips: ['Reach out to a trusted friend or community','Try a 10-minute walk outside each day'] });
    }
    if (topKeywords.length === 0) {
      recommendations.push({ title: 'Maintain & Monitor', reason: 'No dominant concerning keywords found', tips: ['Keep logging mood daily','Try simple breathing breaks or brief walks'] });
    }

    // Friendly interpretation for users
    const interpret = () => {
      if (avg === null) return { headline: 'No mood data', detail: 'No mood entries recorded this period.' };
      const avgRounded = Math.round(avg*10)/10;
      let headline = 'Stable mood';
      if (trend > 0.3) headline = 'Improving mood';
      else if (trend < -0.3) headline = 'Worsening mood';
      let detail = `Average mood this period: ${avgRounded} (scale 0–5). `;
      if (best && worst) detail += `Best day: ${best.day} (${Math.round(best.avg*10)/10}), worst day: ${worst.day} (${Math.round(worst.avg*10)/10}).`;
      return { headline, detail };
    };

    res.json({ ok: true, insights: { avg, count, trend, best, worst, topKeywords, recommendations, narrative: interpret() } });
  } catch (err) {
    console.error('progress insights error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

