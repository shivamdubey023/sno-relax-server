const express = require("express");
const router = express.Router();
const User = require("../models/User");
const mongoose = require('mongoose');
const ChatHistory = require("../models/ChatHistory");
const Content = require("../models/Content");
const Community = require("../models/Community");
const fs = require("fs");
const path = require("path");
const communityController = require("../controllers/communityController");
const GroupMessage = require("../models/GroupMessage");
const CommunityGroup = require("../models/CommunityGroup");
const Announcement = require("../models/Announcement");
const PrivateMessage = require("../models/PrivateMessage");
const Report = require("../models/Report");
const Setting = require("../models/Setting");
const UserProfileChange = require("../models/UserProfileChange");
const adminAuth = require('../middleware/adminAuth');

// Admin login route
router.post('/login', (req, res) => {
  try {
    const { adminId, password } = req.body;
    
    // Simple hardcoded admin credentials (for now)
    if (adminId === "admin" && password === "pass") {
      res.json({ 
        token: "admin-token-" + Date.now(),
        adminId: adminId,
        message: "Login successful"
      });
    } else {
      res.status(401).json({ error: "Invalid admin credentials" });
    }
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Simple helpers for community groups stored in a JSON file
const COMMUNITY_FILE = path.join(__dirname, "..", "data", "communities.json");
function readCommunity() {
  if (!fs.existsSync(COMMUNITY_FILE)) return { groups: [], messages: [] };
  return JSON.parse(fs.readFileSync(COMMUNITY_FILE, "utf8"));
}
function writeCommunity(data) {
  fs.mkdirSync(path.dirname(COMMUNITY_FILE), { recursive: true });
  fs.writeFileSync(COMMUNITY_FILE, JSON.stringify(data, null, 2));
}

// ----------------- USERS -----------------

// Health endpoint (DB status) - safe, masked diagnostics
router.get('/health', (req, res) => {
  try {
    const uriRaw = process.env.MONGODB_URI || process.env.MONGO_URI || null;
    const isLocal = uriRaw ? /localhost|127\.0\.0\.1/.test(uriRaw) : false;
    const isSRV = uriRaw ? /mongodb\+srv:/.test(uriRaw) : false;
    const dbState = mongoose.connection ? mongoose.connection.readyState : 0; // 0=disconnected,1=connected,2=connecting,3=disconnecting
    res.json({
      ok: true,
      dbConnected: dbState === 1,
      dbState,
      dbType: uriRaw ? (isSRV ? 'atlas-srv' : isLocal ? 'local' : 'uri') : 'none',
      envSet: !!uriRaw
    });
  } catch (err) {
    console.error('Health check error:', err);
    res.status(500).json({ ok: false, error: 'Health check failed' });
  }
});


router.get("/users", async (req, res) => {
  try {
    console.log("[getUsers] 🔄 Fetching users from MongoDB...");
    const users = await User.find().sort({ createdAt: -1 });
    console.log(`[getUsers] ✅ Successfully fetched ${users.length} users from MongoDB`);
    res.json(users);
  } catch (err) {
    console.error("[getUsers] ❌ MongoDB Error:", err.message);
    console.log("[getUsers] 📥 Falling back to in-memory userStore...");
    
    // Fallback to in-memory user store
    if (global.userStore && Array.isArray(global.userStore)) {
      console.log(`[getUsers] ✅ Returning ${global.userStore.length} users from fallback store`);
      res.json(global.userStore);
    } else {
      console.error("[getUsers] ❌ Fallback store not available");
      res.status(500).json({ error: "Failed to fetch users - database unavailable" });
    }
  }
});

router.get("/users/:id", async (req, res) => {
  try {
    console.log(`[getUser] 🔄 Fetching user ${req.params.id}...`);
    const user = await User.findById(req.params.id);
    if (!user) {
      console.log(`[getUser] ⚠️ User ${req.params.id} not found in MongoDB, checking fallback...`);
      // Try fallback store
      if (global.userStore) {
        const fallbackUser = global.userStore.find(u => u._id === req.params.id);
        if (fallbackUser) {
          console.log(`[getUser] ✅ Found in fallback store`);
          return res.json(fallbackUser);
        }
      }
      return res.status(404).json({ error: "User not found" });
    }
    console.log(`[getUser] ✅ Found user ${req.params.id}`);
    res.json(user);
  } catch (err) {
    console.error(`[getUser] ❌ Error:`, err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/users/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User updated successfully", user });
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ----------------- CHATS -----------------

router.get("/chats", async (req, res) => {
  try {
    const { userId } = req.query;
    let query = {};
    if (userId) query.userId = userId;
    const chats = await ChatHistory.find(query).sort({ timestamp: -1 });
    res.json(chats);
  } catch (err) {
    console.error("Error fetching chats:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ----------------- PRIVATE MESSAGES (admin) -----------------
// Fetch private messages for a user (admin view)
router.get("/private-messages", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const msgs = await PrivateMessage.find({ $or: [{ senderId: userId }, { receiverId: userId }] }).sort({ createdAt: 1 });
    res.json({ ok: true, messages: msgs });
  } catch (err) {
    console.error("Error fetching private messages (admin):", err);
    res.status(500).json({ error: err.message });
  }
});

// Admin can post a private message (reply to user)
router.post("/private-message", async (req, res) => {
  try {
    const { senderId, receiverId, message } = req.body;
    if (!senderId || !receiverId || !message) return res.status(400).json({ error: "senderId, receiverId and message required" });
    const m = await PrivateMessage.create({ senderId, receiverId, message: String(message).trim() });
    const io = req.app && req.app.get("io");
    if (io && receiverId) io.to(`user_${receiverId}`).emit("receivePrivateMessage", m);
    res.status(201).json({ ok: true, message: m });
  } catch (err) {
    console.error("Error creating private message (admin):", err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------- COMMUNITY -----------------

router.get("/community", async (req, res) => {
  try {
    const posts = await Community.find().sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    console.error("Error fetching community posts:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/community/:id", async (req, res) => {
  try {
    const post = await Community.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found" });
    res.json(post);
  } catch (err) {
    console.error("Error fetching post:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/community/:id", async (req, res) => {
  try {
    const updatedPost = await Community.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedPost) return res.status(404).json({ error: "Post not found" });
    res.json({ message: "Post updated successfully", post: updatedPost });
  } catch (err) {
    console.error("Error updating post:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/community/:id", async (req, res) => {
  try {
    const deletedPost = await Community.findByIdAndDelete(req.params.id);
    if (!deletedPost) return res.status(404).json({ error: "Post not found" });
    res.json({ message: "Post deleted successfully" });
  } catch (err) {
    console.error("Error deleting post:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/community/group/:groupId", (req, res) => {
  const { groupId } = req.params;
  const db = readCommunity();
  const groupIndex = db.groups.findIndex((g) => g.id === groupId);

  if (groupIndex === -1) return res.status(404).json({ error: "Group not found" });

  db.groups.splice(groupIndex, 1);
  db.messages = db.messages.filter((m) => m.groupId !== groupId);
  writeCommunity(db);
  res.json({ ok: true, message: "Group deleted successfully" });
});

// ---------- Admin: Mongo-backed community management (reuses communityController)
// List groups (mongo)
router.get("/community/groups", async (req, res) => {
  try {
    const groups = await CommunityGroup.find().populate("createdBy", "name email");
    res.json({ ok: true, groups });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Create group (admin)
router.post("/community/group", async (req, res) => {
  // expect { name, description, createdBy }
  return communityController.createGroup(req, res);
});

// Delete group (admin)
router.delete("/community/group/mongo/:id", async (req, res) => {
  return communityController.deleteGroup(req, res);
});

// Delete a specific group message (moderation)
router.delete("/community/group/:groupId/message/:messageId", async (req, res) => {
  try {
    const { messageId } = req.params;
    const deleted = await GroupMessage.findByIdAndDelete(messageId);
    if (!deleted) return res.status(404).json({ error: "Message not found" });
    // notify clients in group room if io available
    const io = req.app && req.app.get("io");
    if (io && deleted.groupId) io.to(String(deleted.groupId)).emit("messageDeleted", { messageId });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Add / remove members (admin)
router.post("/community/group/:id/member", async (req, res) => communityController.addMember(req, res));
router.delete("/community/group/:id/member", async (req, res) => communityController.removeMember(req, res));

// Announcements (admin)
router.post("/announcement", async (req, res) => communityController.createAnnouncement(req, res));
router.delete("/announcement/:id", async (req, res) => communityController.deleteAnnouncement(req, res));

// Fetch announcements (admin view)
router.get("/announcements", async (req, res) => communityController.getAnnouncements(req, res));

// ----------------- STATS -----------------

router.get("/stats", async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalChats = await ChatHistory.countDocuments();
    res.json({ totalUsers, totalChats });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ----------------- SETTINGS (admin) -----------------
// Get theme (or other settings) by key. Currently supports 'theme'.
router.get("/settings/theme", async (req, res) => {
  try {
    const s = await Setting.findOne({ key: "theme" });
    if (!s) return res.json({ ok: true, theme: null });
    return res.json({ ok: true, theme: s.value });
  } catch (err) {
    console.error("Error fetching theme setting:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Update theme (admin)
router.put("/settings/theme", async (req, res) => {
  try {
    const { theme } = req.body;
    if (!theme) return res.status(400).json({ error: "theme required" });

  // basic validation: allow only a small set of themes (remove 'therapist')
  const allowed = ["light", "dark"];
    if (!allowed.includes(theme)) return res.status(400).json({ error: "invalid theme" });

    const s = await Setting.findOneAndUpdate(
      { key: "theme" },
      { value: theme },
      { upsert: true, new: true }
    );

    // broadcast to connected clients (if socket available)
    const io = req.app && req.app.get("io");
    if (io) {
      io.emit("themeChanged", theme);
    }

    return res.json({ ok: true, theme: s.value });
  } catch (err) {
    console.error("Error updating theme setting:", err);
    return res.status(500).json({ error: err.message });
  }
});

router.get("/stats/chats", async (req, res) => {
  try {
    const today = new Date();
    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(today.getDate() - i);
      return d;
    }).reverse();

    const chatCounts = await Promise.all(
      last7Days.map(async (day) => {
        const start = new Date(day.setHours(0, 0, 0, 0));
        const end = new Date(day.setHours(23, 59, 59, 999));
        const count = await ChatHistory.countDocuments({ timestamp: { $gte: start, $lte: end } });
        return { day: start.toLocaleDateString("en-US", { weekday: "short" }), chats: count };
      })
    );

    res.json(chatCounts);
  } catch (err) {
    console.error("Error fetching chat stats:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ----------------- CONTENT -----------------

router.get("/content", async (req, res) => {
  try {
    const contents = await Content.find().sort({ createdAt: -1 });
    res.json(contents);
  } catch (err) {
    console.error("Error fetching content:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/content/:id", async (req, res) => {
  try {
    const content = await Content.findById(req.params.id);
    if (!content) return res.status(404).json({ error: "Content not found" });
    res.json(content);
  } catch (err) {
    console.error("Error fetching content:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/content", async (req, res) => {
  try {
    const { title, description, type, mediaUrl } = req.body;
    if (!title || !description || !type) return res.status(400).json({ error: "Title, description, and type required" });
    const newContent = await Content.create({ title, description, type, mediaUrl });
    res.json(newContent);
  } catch (err) {
    console.error("Error creating content:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/content/:id", async (req, res) => {
  try {
    const updatedContent = await Content.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedContent) return res.status(404).json({ error: "Content not found" });
    res.json(updatedContent);
  } catch (err) {
    console.error("Error updating content:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/content/:id", async (req, res) => {
  try {
    const deletedContent = await Content.findByIdAndDelete(req.params.id);
    if (!deletedContent) return res.status(404).json({ error: "Content not found" });
    res.json({ message: "Content deleted successfully" });
  } catch (err) {
    console.error("Error deleting content:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ----------------- REPORTS -----------------
// list reports
router.get('/reports', async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 });
    res.json({ ok: true, reports });
  } catch (err) {
    console.error('Error fetching reports:', err);
    res.status(500).json({ error: err.message });
  }
});

// create a report
router.post('/report', async (req, res) => {
  try {
    const { title, description, reportedBy, metadata } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'title and description required' });
    const r = await Report.create({ title, description, reportedBy, metadata });
    res.status(201).json({ ok: true, report: r });
  } catch (err) {
    console.error('Error creating report:', err);
    res.status(500).json({ error: err.message });
  }
});

// delete a report
router.delete('/report/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const d = await Report.findByIdAndDelete(id);
    if (!d) return res.status(404).json({ error: 'Report not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting report:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------- RELATIONSHIPS / ANALYTICS -----------------
// Return aggregated relationship data: groups vs users, chat counts per user,
// frequent terms per user and overall top terms. This is designed for admin
// dashboard consumption (tables + charts).
router.get('/relationships/summary', async (req, res) => {
  try {
    // Groups with members
    const groups = await CommunityGroup.find().lean();
    const groupsUsers = groups.map(g => ({
      groupId: g._id,
      name: g.name,
      memberCount: (g.members || []).length,
      members: (g.members || []).map(m => ({ userId: m.userId, nickname: m.nickname }))
    }));

    // Message counts per user (group messages)
    const groupAgg = await GroupMessage.aggregate([
      { $group: { _id: "$senderId", count: { $sum: 1 } } }
    ]);
    const privateAgg = await PrivateMessage.aggregate([
      { $group: { _id: "$senderId", count: { $sum: 1 } } }
    ]);
    const chatHistAgg = await ChatHistory.aggregate([
      { $group: { _id: "$userId", count: { $sum: 1 } } }
    ]);

    // Merge counts by userId
    const countsMap = new Map();
    const addCounts = (arr, key) => {
      arr.forEach(a => {
        const id = String(a._id);
        if (!countsMap.has(id)) countsMap.set(id, { userId: id, groupMessages: 0, privateMessages: 0, chatHistory: 0 });
        countsMap.get(id)[key] = a.count;
      });
    };
    addCounts(groupAgg, 'groupMessages');
    addCounts(privateAgg, 'privateMessages');
    addCounts(chatHistAgg, 'chatHistory');

    // Enrich with user info for known users
    const userIds = Array.from(countsMap.keys());
    const users = await User.find({ userId: { $in: userIds } }).lean();
    const userById = new Map(users.map(u => [u.userId, u]));
    const userChatCounts = Array.from(countsMap.values()).map(c => {
      const u = userById.get(c.userId) || {};
      return {
        userId: c.userId,
        name: (u.firstName ? `${u.firstName} ${u.lastName}` : (u.communityNickname || u.userId)),
        groupMessages: c.groupMessages || 0,
        privateMessages: c.privateMessages || 0,
        chatHistory: c.chatHistory || 0,
        total: (c.groupMessages || 0) + (c.privateMessages || 0) + (c.chatHistory || 0)
      };
    });

  // Frequent term extraction (naive): fetch all messages and compute term frequency per user/group
  // Note: this may be heavy on large datasets; consider batching or an async job for very large DBs.
  const recentGroupMsgs = await GroupMessage.find().sort({ createdAt: -1 }).lean();
  const recentChatHist = await ChatHistory.find().sort({ timestamp: -1 }).lean();
  const recentPrivate = await PrivateMessage.find().sort({ createdAt: -1 }).lean();

    const tokenize = (text) => {
      if (!text) return [];
      return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .filter(t => t.length > 2);
    };

    const termCountsByUser = new Map();
    const overall = new Map();

    const ingest = (userId, text) => {
      const tokens = tokenize(text);
      if (!tokens.length) return;
      if (!termCountsByUser.has(userId)) termCountsByUser.set(userId, {});
      const m = termCountsByUser.get(userId);
      tokens.forEach(t => {
        m[t] = (m[t] || 0) + 1;
        overall.set(t, (overall.get(t) || 0) + 1);
      });
    };

    // Also collect per-group term counts and per-group message counts
    const termCountsByGroup = new Map();
    const groupMessageCounts = new Map();

    recentGroupMsgs.forEach(m => {
      const sid = String(m.senderId);
      ingest(sid, m.message);

      // per-group
      const gid = String(m.groupId);
      groupMessageCounts.set(gid, (groupMessageCounts.get(gid) || 0) + 1);
      if (!termCountsByGroup.has(gid)) termCountsByGroup.set(gid, {});
      const gm = termCountsByGroup.get(gid);
      tokenize(m.message).forEach(t => gm[t] = (gm[t] || 0) + 1);
    });

    recentPrivate.forEach(m => ingest(String(m.senderId), m.message));
    recentChatHist.forEach(m => ingest(String(m.userId), m.userMessage));

    const frequentTermsByUser = [];
    for (const [userId, map] of termCountsByUser.entries()) {
      const items = Object.entries(map).sort((a,b) => b[1] - a[1]).slice(0,25).map(([term,count]) => ({ term, count }));
      frequentTermsByUser.push({ userId, topTerms: items });
    }

    const topTermsOverall = Array.from(overall.entries()).sort((a,b)=>b[1]-a[1]).slice(0,100).map(([term,count])=>({ term, count }));

    // Build per-group top terms and message counts
    const topTermsByGroup = [];
    for (const [gid, map] of termCountsByGroup.entries()) {
      const items = Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,25).map(([term,count]) => ({ term, count }));
      topTermsByGroup.push({ groupId: gid, topTerms: items, messageCount: groupMessageCounts.get(gid) || 0 });
    }

    // Build mapping of user -> groups they belong to
    const userGroups = {};
    groups.forEach(g => {
      (g.members || []).forEach(m => {
        if (!userGroups[m.userId]) userGroups[m.userId] = [];
        userGroups[m.userId].push({ groupId: g._id, groupName: g.name });
      });
    });

    return res.json({ ok: true, groupsUsers, userChatCounts, frequentTermsByUser, topTermsOverall, topTermsByGroup, userGroups });
  } catch (err) {
    console.error('Error computing relationships summary:', err);
    return res.status(500).json({ error: err.message });
  }
});

// --------------- USER PROFILE CHANGES (Audit Log) ---------------
// Get profile change history for a user or all users
router.get('/profile-changes', async (req, res) => {
  try {
    const { userId, limit = 100, skip = 0 } = req.query;
    let query = {};
    if (userId) query.userId = userId;
    const changes = await UserProfileChange.find(query).sort({ changedAt: -1 }).skip(parseInt(skip)).limit(parseInt(limit));
    const total = await UserProfileChange.countDocuments(query);
    res.json({ ok: true, changes, total, limit: parseInt(limit), skip: parseInt(skip) });
  } catch (err) {
    console.error('Error fetching profile changes:', err);
    res.status(500).json({ error: err.message });
  }
});

// Log a profile change (called by user service or admin endpoint)
router.post('/profile-change', async (req, res) => {
  try {
    const { userId, fieldName, oldValue, newValue, changedBy = 'user' } = req.body;
    if (!userId || !fieldName || newValue === undefined) {
      return res.status(400).json({ error: 'userId, fieldName, newValue required' });
    }
    const change = await UserProfileChange.create({
      userId,
      fieldName,
      oldValue: oldValue !== undefined ? oldValue : null,
      newValue,
      changedBy,
      changedAt: new Date()
    });
    res.status(201).json({ ok: true, change });
  } catch (err) {
    console.error('Error logging profile change:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------- ADMIN POPUP -----------------
// Store admin popup content in server `store/admin_popup.json` so frontend can fetch it
const POPUP_FILE = path.join(__dirname, '..', 'store', 'admin_popup.json');

function readPopup() {
  try {
    if (!fs.existsSync(POPUP_FILE)) return { content: '', version: '1' };
    const raw = fs.readFileSync(POPUP_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    console.error('Error reading popup file:', e);
    return { content: '', version: '1' };
  }
}

function writePopup(obj) {
  try {
    fs.mkdirSync(path.dirname(POPUP_FILE), { recursive: true });
    fs.writeFileSync(POPUP_FILE, JSON.stringify(obj || { content: '', version: '1' }, null, 2));
    return true;
  } catch (e) {
    console.error('Error writing popup file:', e);
    return false;
  }
}

// Public GET: return popup content and version
router.get('/popup', (req, res) => {
  try {
    const p = readPopup();
    res.json({ ok: true, content: p.content || '', version: p.version || '1' });
  } catch (err) {
    console.error('Error reading admin popup:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin-only POST to update popup content
router.post('/popup', adminAuth, (req, res) => {
  try {
    const { content, version } = req.body || {};
    if (typeof content !== 'string') return res.status(400).json({ ok: false, error: 'content (string) required' });
    const v = version || String(Date.now());
    const ok = writePopup({ content, version: v });
    if (!ok) return res.status(500).json({ ok: false, error: 'Failed to save popup' });
    return res.json({ ok: true, content, version: v });
  } catch (err) {
    console.error('Error writing admin popup:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
