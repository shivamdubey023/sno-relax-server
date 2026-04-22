// sno-relax-server/utils/chatbotEngine.js
// Fast local chatbot engine with caching and fallback to external AI

class ChatBotEngine {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 30 * 60 * 1000;
    this.requestQueue = [];
    this.isProcessing = false;
    this.maxConcurrent = 3;
    this.activeRequests = 0;

    this.intentResponses = {
      greeting: {
        patterns: ['hello', 'hi', 'hey', 'namaste', 'hola', 'sup', 'yo', 'greetings'],
        response: "Hello! I'm SnoRelax, your mental wellness companion. How are you feeling today?",
        mood: 'neutral'
      },
      goodbye: {
        patterns: ['bye', 'goodbye', 'see you', 'talk later', 'take care', 'tata', 'byee'],
        response: "Take care of yourself! Remember, I'm always here when you need to talk. Stay positive!",
        mood: 'happy'
      },
      thanks: {
        patterns: ['thank', 'thanks', 'thx', 'appreciate', 'grateful'],
        response: "You're welcome! It's wonderful that you're taking care of your mental health. I'm here whenever you need me.",
        mood: 'happy'
      },
      stress: {
        patterns: ['stress', 'stressed', 'tension', 'pressure', 'overwhelm', 'burden'],
        response: "I understand stress can be overwhelming. Try these quick techniques: 1) Take 5 deep breaths - breathe in for 4 seconds, hold for 4, breathe out for 4. 2) Take a short walk. 3) Write down what's bothering you. Remember, stress is temporary and you're stronger than you think.",
        mood: 'stressed'
      },
      anxiety: {
        patterns: ['anxious', 'anxiety', 'nervous', 'worried', 'panic', 'fear', 'scared', 'phobia'],
        response: "Anxiety can feel frightening, but you're safe right now. Let's ground ourselves: Name 5 things you can see, 4 you can touch, 3 you can hear, 2 you can smell, 1 you can taste. This helps bring you back to the present moment.",
        mood: 'anxious'
      },
      sadness: {
        patterns: ['sad', 'unhappy', 'depressed', 'down', 'melancholy', 'gloomy', 'blue'],
        response: "I'm here with you. Sadness is a natural emotion. Would you like to share what's weighing on your heart? Sometimes talking about it can help lighten the load. Remember, it's okay to not be okay.",
        mood: 'sad'
      },
      sleep: {
        patterns: ['sleep', 'insomnia', 'tired', 'exhausted', 'rest', 'sleepless', 'nightmare'],
        response: "Good sleep is crucial for mental health. Try these sleep hygiene tips: 1) Keep a consistent sleep schedule. 2) Avoid screens 1 hour before bed. 3) Keep your room cool and dark. 4) Try gentle stretching before sleep. 5) Avoid caffeine after 2 PM.",
        mood: 'tired'
      },
      anger: {
        patterns: ['angry', 'mad', 'furious', 'rage', 'irritated', 'frustrated', 'annoyed'],
        response: "I sense some frustration. Anger is valid, but acting on it might not help. Try counting to 10, or step away from the situation. When you feel calm, reflect: What triggered this? Is there a way to address it constructively?",
        mood: 'angry'
      },
      lonely: {
        patterns: ['lonely', 'alone', 'isolated', 'isolated', 'abandoned', 'no one'],
        response: "Loneliness can be painful, but please know you're not truly alone. I'm here to talk. Consider reaching out to a friend or family member, even with a simple 'Hi, thinking of you.' Connection doesn't require perfection.",
        mood: 'sad'
      },
      motivation: {
        patterns: ['motivation', 'motivated', 'encourage', 'inspire', 'hopeless', 'helpless'],
        response: "You're taking a positive step by being here! Every small action counts. Start with just one thing today - drink water, take a short walk, or send someone a message. Progress, not perfection. You've got this!",
        mood: 'neutral'
      },
      meditation: {
        patterns: ['meditate', 'meditation', 'breathing', 'breathe', 'calm', 'relax', 'mindfulness'],
        response: "Meditation is wonderful for mental clarity. Here's a simple technique: Sit comfortably, close your eyes, and focus on your breath. Inhale for 4 counts, hold for 4, exhale for 4. Repeat 5 times. Even 5 minutes daily can make a difference!",
        mood: 'neutral'
      },
      help: {
        patterns: ['help', 'support', 'need', 'assist', 'advice', 'guidance'],
        response: "I'm here to support you. What specific area would you like help with? Stress management, sleep improvement, anxiety coping, or just someone to talk to?",
        mood: 'neutral'
      },
      selfharm: {
        patterns: ['self harm', 'self-harm', 'cutting', 'suicide', 'suicidal', 'end my life', 'hurt myself'],
        response: "I'm really concerned about you right now. Your life matters, and there are people who want to help. Please reach out to a crisis helpline or trusted person immediately. In India: iCall (9152987821) or Vandrevala (1860-2662-345). You don't have to face this alone.",
        mood: 'sad',
        priority: 'crisis'
      },
      happy: {
        patterns: ['happy', 'joy', 'excited', 'wonderful', 'great', 'amazing', 'fantastic', 'love this'],
        response: "That's wonderful to hear! Positive emotions are like sunshine for the soul. What made you feel this way? Celebrating good moments helps reinforce positive feelings. Keep embracing joy!",
        mood: 'happy'
      },
      workout: {
        patterns: ['exercise', 'workout', 'gym', 'fitness', 'run', 'yoga', 'walk', 'dance'],
        response: "Exercise is a powerful mood booster! It releases endorphins and improves sleep. Even a 10-minute walk can help. Find an activity you enjoy - dancing, yoga, swimming, or just stretching. What's your favorite way to move?",
        mood: 'neutral'
      },
      food: {
        patterns: ['food', 'eat', 'diet', 'hungry', 'nutrition', 'healthy', 'meal'],
        response: "Good nutrition supports mental health! Try to include: Omega-3 rich foods (fish, nuts), leafy greens, whole grains, and stay hydrated. Avoid skipping meals - irregular eating affects mood and energy. How are your eating habits lately?",
        mood: 'neutral'
      },
      work: {
        patterns: ['work', 'job', 'office', 'boss', 'coworker', 'career', 'profession'],
        response: "Work stress is common. Remember to take regular breaks, set boundaries, and prioritize tasks. If possible, discuss workload concerns with your supervisor. Don't let work consume your entire life - balance is key!",
        mood: 'stressed'
      },
      relationships: {
        patterns: ['relationship', 'family', 'friend', 'partner', 'boyfriend', 'girlfriend', 'parent'],
        response: "Relationships can be both fulfilling and challenging. Communication is key - try expressing your feelings openly and honestly. Setting healthy boundaries is also important. What relationship aspect would you like to discuss?",
        mood: 'neutral'
      },
      crisis: {
        patterns: ['crisis', 'emergency', 'urgent', 'helpline', 'hotline'],
        response: "If you're in immediate danger, please call emergency services (112 in India). For emotional support: iCall: 9152987821, Vandrevala: 1860-2662-345. You're not alone - help is available 24/7.",
        mood: 'sad',
        priority: 'crisis'
      }
    };
  }

  normalizeText(text) {
    return text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  detectIntent(message) {
    const normalized = this.normalizeText(message);
    
    for (const [intent, config] of Object.entries(this.intentResponses)) {
      for (const pattern of config.patterns) {
        if (normalized.includes(pattern)) {
          return { intent, ...config };
        }
      }
    }
    return null;
  }

  getCacheKey(message, userId) {
    return `${userId || 'anon'}:${this.normalizeText(message).substring(0, 50)}`;
  }

  getFromCache(message, userId) {
    const key = this.getCacheKey(message, userId);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.response;
    }
    return null;
  }

  setCache(message, userId, response) {
    const key = this.getCacheKey(message, userId);
    this.cache.set(key, { response, timestamp: Date.now() });
    
    if (this.cache.size > 1000) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      this.cache.delete(oldest[0]);
    }
  }

  detectMoodFromText(message) {
    const normalized = this.normalizeText(message);
    const moodKeywords = {
      happy: ['happy', 'joy', 'excited', 'good', 'wonderful', 'great', 'amazing', 'love', 'fantastic', ':)', ':-)', 'yay'],
      sad: ['sad', 'unhappy', 'depressed', 'down', 'cry', 'crying', 'hurt', 'pain', 'gloomy', ':(', ':-(', 'tears'],
      anxious: ['anxious', 'anxiety', 'nervous', 'worried', 'panic', 'fear', 'scared', 'afraid', 'overwhelm'],
      angry: ['angry', 'mad', 'furious', 'rage', 'irritated', 'frustrated', 'annoyed', 'hate'],
      stressed: ['stressed', 'stress', 'tension', 'pressure', 'burden', 'overwhelmed'],
      tired: ['tired', 'exhausted', 'sleepy', 'fatigue', 'drained', 'weary', 'sleep'],
      neutral: ['okay', 'ok', 'fine', 'normal', 'alright', 'so-so']
    };

    const scores = {};
    Object.keys(moodKeywords).forEach(mood => scores[mood] = 0);

    const words = normalized.split(/\s+/);
    words.forEach(word => {
      Object.keys(moodKeywords).forEach(mood => {
        if (moodKeywords[mood].some(kw => word.includes(kw) || kw.includes(word))) {
          scores[mood]++;
        }
      });
    });

    let maxMood = 'neutral';
    let maxScore = 0;
    Object.entries(scores).forEach(([mood, score]) => {
      if (score > maxScore) {
        maxScore = score;
        maxMood = mood;
      }
    });

    return { mood: maxMood, confidence: Math.min(maxScore / 3, 1), score: maxScore };
  }

  getLocalResponse(message, userId = null) {
    const cached = this.getFromCache(message, userId);
    if (cached) return cached;

    const intent = this.detectIntent(message);
    if (intent) {
      this.setCache(message, userId, {
        text: intent.response,
        source: 'local',
        intent: intent.intent,
        mood: intent.mood
      });
      return {
        text: intent.response,
        source: 'local',
        intent: intent.intent,
        mood: intent.mood
      };
    }

    return null;
  }

  async processQueue() {
    if (this.isProcessing || this.activeRequests >= this.maxConcurrent) return;
    if (this.requestQueue.length === 0) return;

    this.isProcessing = true;
    while (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrent) {
      const { resolve, reject, task } = this.requestQueue.shift();
      this.activeRequests++;
      task().then(resolve).catch(reject).finally(() => {
        this.activeRequests--;
        setTimeout(() => this.processQueue(), 100);
      });
    }
    this.isProcessing = false;
  }

  queueRequest(task) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ resolve, reject, task });
      this.processQueue();
    });
  }

  generateContextualResponse(userId, previousMessages, newMessage) {
    const context = previousMessages.slice(-5);
    const contextSummary = context.map(c => `${c.role}: ${c.text}`).join('\n');
    
    return `Previous conversation:\n${contextSummary}\n\nUser's new message: "${newMessage}"\n\nRespond empathetically to the user's new message while considering the conversation context.`;
  }
}

module.exports = new ChatBotEngine();