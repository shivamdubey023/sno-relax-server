// sno-relax-server/controllers/communityController.js
const CommunityGroup = require("../models/CommunityGroup");
const GroupMessage = require("../models/GroupMessage");
const Announcement = require("../models/Announcement");
const User = require("../models/User");

module.exports = {
  // ==================== GROUPS ====================

  // Alias for joinGroup - used by admin routes
  addMember: async (req, res) => {
    return module.exports.joinGroup(req, res);
  },
  
  getGroups: async (req, res) => {
    try {
      try {
        // Try MongoDB first
        const groups = await CommunityGroup.find({ isActive: true })
          .select("_id name description createdBy adminId isPrivate members isActive maxMembers createdAt inviteCode")
          .sort({ createdAt: -1 });
        
        // Return groups with member count
        const groupsWithCount = groups.map(group => ({
          ...group.toObject(),
          memberCount: group.members ? group.members.length : 0,
        }));
        
        return res.json(groupsWithCount);
      } catch (mongoErr) {
        console.warn("⚠️ [getGroups] MongoDB error:", mongoErr.message);
      }
      
      // Fallback: Use in-memory store
      if (global.communityStore && global.communityStore.groups) {
        return res.json(global.communityStore.groups);
      }
      
      // If no fallback, return empty
      res.json([]);
      
    } catch (err) {
      console.error("❌ [getGroups] Error:", err.message);
      res.status(500).json({ error: "Failed to fetch groups", details: err.message });
    }
  },

  createGroup: async (req, res) => {
    try {
      const { name, description, createdBy, maxMembers = 50, isPrivate = false, inviteCode: providedInvite } = req.body;
      
      if (!name || !createdBy) {
        return res.status(400).json({ error: "Name and createdBy (userId) required" });
      }
      
      if (name.length < 3 || name.length > 50) {
        return res.status(400).json({ error: "Group name must be 3-50 characters" });
      }

      // Try to resolve the creator user; if not found (e.g. admin created group outside of users table)
      // allow creation but fall back to a sensible nickname.
      const user = await User.findOne({ userId: createdBy });
      const creatorNickname = user ? (user.communityNickname || `${user.firstName || 'Admin'}`) : "Group Admin";

      // generate invite code for private groups if not provided
      let inviteCode = null;
      if (isPrivate) {
        inviteCode = providedInvite && String(providedInvite).trim() ? String(providedInvite).trim() : Math.random().toString(36).slice(2, 8).toUpperCase();
      }

      const group = await CommunityGroup.create({
        name,
        description: description || "",
        createdBy,
        adminId: createdBy,
        isPrivate: !!isPrivate,
        inviteCode: inviteCode,
        members: [{
          userId: createdBy,
          nickname: creatorNickname,
          joinedAt: new Date(),
        }],
        maxMembers,
        isActive: true,
      });

      // return full group (including inviteCode) so admin can copy it
      res.status(201).json(group);
    } catch (err) {
      console.error("Error creating group:", err);
      res.status(500).json({ error: "Failed to create group" });
    }
  },

  deleteGroup: async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.body;

      const group = await CommunityGroup.findById(id);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      // Only admin can delete
      if (group.adminId !== userId) {
        return res.status(403).json({ error: "Only admin can delete group" });
      }

      await CommunityGroup.findByIdAndDelete(id);
      res.json({ message: "Group deleted successfully" });
    } catch (err) {
      console.error("Error deleting group:", err);
      res.status(500).json({ error: "Failed to delete group" });
    }
  },

  updateGroup: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, maxMembers, isActive } = req.body;
      const group = await CommunityGroup.findById(id);
      if (!group) return res.status(404).json({ error: 'Group not found' });
      if (name) group.name = name;
      if (description !== undefined) group.description = description;
      if (maxMembers !== undefined) group.maxMembers = maxMembers;
      if (isActive !== undefined) group.isActive = isActive;
      await group.save();
      res.json({ message: 'Group updated', group });
    } catch (err) {
      console.error('Error updating group:', err);
      res.status(500).json({ error: 'Failed to update group' });
    }
  },

  clearGroupMessages: async (req, res) => {
    try {
      const { groupId } = req.params;
      await GroupMessage.deleteMany({ groupId });
      res.json({ ok: true, message: 'Group messages cleared' });
    } catch (err) {
      console.error('Error clearing messages:', err);
      res.status(500).json({ error: 'Failed to clear messages' });
    }
  },

  // ==================== GROUP MEMBERS ====================

  joinGroup: async (req, res) => {
    try {
      const { groupId } = req.params;
      const { userId, nickname, inviteCode } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId required" });
      }

      const group = await CommunityGroup.findById(groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      if (!group.isActive) {
        return res.status(400).json({ error: "Group is inactive" });
      }

      // If group is private, require inviteCode or allow admin
      if (group.isPrivate) {
        const provided = inviteCode || null;
        if (String(group.adminId) !== String(userId) && (!provided || String(provided) !== String(group.inviteCode))) {
          return res.status(403).json({ error: "Invite code required or invalid for private group" });
        }
      }

      // Check if already a member (with null safety)
      if ((group.members || []).some(m => m && m.userId === userId)) {
        return res.status(400).json({ error: "Already a member of this group" });
      }

      // Check max members
      if (group.members.length >= group.maxMembers) {
        return res.status(400).json({ error: "Group is full" });
      }

      // Try to find user; allow joining even if user does not exist (anonymous/guest flows)
      const user = await User.findOne({ userId });

      const finalNickname = nickname || (user ? (user.communityNickname || "Anonymous") : "Anonymous");

      group.members.push({
        userId,
        nickname: finalNickname,
        joinedAt: new Date(),
      });

      await group.save();
      res.status(200).json({ message: "Joined group successfully", group });
    } catch (err) {
      console.error("Error joining group:", err);
      res.status(500).json({ error: "Failed to join group" });
    }
  },

  leaveGroup: async (req, res) => {
    try {
      const { groupId } = req.params;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId required" });
      }

      const group = await CommunityGroup.findById(groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      const memberIndex = group.members.findIndex(m => m.userId === userId);
      if (memberIndex === -1) {
        return res.status(400).json({ error: "Not a member of this group" });
      }

      // Don't allow admin to leave without assigning new admin
      if (group.adminId === userId && group.members.length > 1) {
        return res.status(403).json({ 
          error: "Admin cannot leave group. Assign a new admin first." 
        });
      }

      group.members.splice(memberIndex, 1);

      // If group is empty, mark as inactive
      if (group.members.length === 0) {
        group.isActive = false;
      }

      await group.save();
      res.json({ message: "Left group successfully" });
    } catch (err) {
      console.error("Error leaving group:", err);
      res.status(500).json({ error: "Failed to leave group" });
    }
  },

  getGroupMembers: async (req, res) => {
    try {
      const { groupId } = req.params;

      const group = await CommunityGroup.findById(groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      res.json(group.members);
    } catch (err) {
      console.error("Error fetching members:", err);
      res.status(500).json({ error: "Failed to fetch members" });
    }
  },

  updateMemberNickname: async (req, res) => {
    try {
      const { groupId } = req.params;
      const { userId, nickname } = req.body;

      if (!userId || !nickname) {
        return res.status(400).json({ error: "userId and nickname required" });
      }

      if (nickname.length < 3 || nickname.length > 20) {
        return res.status(400).json({ error: "Nickname must be 3-20 characters" });
      }

      const group = await CommunityGroup.findById(groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      const member = group.members.find(m => m.userId === userId);
      if (!member) {
        return res.status(404).json({ error: "Member not found in group" });
      }

      member.nickname = nickname;
      await group.save();

      res.json({ message: "Nickname updated", member });
    } catch (err) {
      console.error("Error updating nickname:", err);
      res.status(500).json({ error: "Failed to update nickname" });
    }
  },

  removeMember: async (req, res) => {
    try {
      const { groupId } = req.params;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId required" });
      }

      const group = await CommunityGroup.findById(groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      const memberIndex = group.members.findIndex(m => m.userId === userId);
      if (memberIndex === -1) {
        return res.status(404).json({ error: "Member not found in group" });
      }

      group.members.splice(memberIndex, 1);

      // If group is empty, mark as inactive
      if (group.members.length === 0) {
        group.isActive = false;
      }

      await group.save();
      res.json({ message: "Member removed successfully" });
    } catch (err) {
      console.error("Error removing member:", err);
      res.status(500).json({ error: "Failed to remove member" });
    }
  },

  // ==================== GROUP MESSAGES ====================

  getGroupMessages: async (req, res) => {
    try {
      const { groupId } = req.params;
      const { limit = 50, skip = 0 } = req.query;

      // Verify group exists
      const group = await CommunityGroup.findById(groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      const messages = await GroupMessage.find({ groupId })
        .sort({ createdAt: 1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit));

      const totalCount = await GroupMessage.countDocuments({ groupId });

      res.json({
        messages,
        total: totalCount,
        limit: parseInt(limit),
        skip: parseInt(skip),
      });
    } catch (err) {
      console.error("Error fetching messages:", err);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  },

  postGroupMessage: async (req, res) => {
    try {
      const { groupId } = req.params;
      const { senderId, senderNickname, message, isAdmin: forceAdminFlag } = req.body;

      if (!senderId || !message) {
        return res.status(400).json({ error: "senderId and message required" });
      }

      if (message.trim().length === 0) {
        return res.status(400).json({ error: "Message cannot be empty" });
      }

      // Verify group exists
      const group = await CommunityGroup.findById(groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      // Allow posting if sender is a member OR is an admin (official)
      const member = group.members.find(m => m.userId === senderId);

      // Load admin list from store to detect official admins
      let isAdmin = false;
      try {
        // eslint-disable-next-line global-require
        const admins = require("../store/admins.json");
        if (Array.isArray(admins) && admins.some(a => String(a.userId) === String(senderId))) {
          isAdmin = true;
        }
      } catch (e) {
        // ignore if admins file not available
      }

      // allow explicit admin override (useful from admin UI)
      if (!isAdmin && forceAdminFlag) isAdmin = true;

      if (!member && !isAdmin) {
        return res.status(403).json({ error: "Not a member of this group" });
      }

      // Determine nickname
      let finalNickname = senderNickname;
      if (!finalNickname) {
        if (member) finalNickname = member.nickname || "Anonymous";
        else if (isAdmin) {
          // try to find admin display name
          try {
            const admins = require("../store/admins.json");
            const found = Array.isArray(admins) && admins.find(a => String(a.userId) === String(senderId));
            finalNickname = (found && (found.firstName || found.email || 'Admin')) || 'Admin';
          } catch (e) {
            finalNickname = 'Admin';
          }
        } else {
          finalNickname = 'Anonymous';
        }
      }

      const newMessage = await GroupMessage.create({
        groupId,
        senderId,
        senderNickname: finalNickname,
        message: message.trim(),
        isEdited: false,
        isAdmin: !!isAdmin,
      });

      res.status(201).json(newMessage);
    } catch (err) {
      console.error("Error posting message:", err);
      res.status(500).json({ error: "Failed to post message" });
    }
  },

  deleteMessage: async (req, res) => {
    try {
      const { messageId } = req.params;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId required" });
      }

      const message = await GroupMessage.findById(messageId);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Only sender or admin can delete
      if (message.senderId !== userId) {
        // Check if user is group admin
        const group = await CommunityGroup.findById(message.groupId);
        if (!group || group.adminId !== userId) {
          return res.status(403).json({ error: "Cannot delete message" });
        }
      }

      await GroupMessage.findByIdAndDelete(messageId);
      res.json({ message: "Message deleted successfully" });
    } catch (err) {
      console.error("Error deleting message:", err);
      res.status(500).json({ error: "Failed to delete message" });
    }
  },

  editMessage: async (req, res) => {
    try {
      const { messageId } = req.params;
      const { userId, message } = req.body;

      if (!userId || !message) {
        return res.status(400).json({ error: "userId and message required" });
      }

      const existingMessage = await GroupMessage.findById(messageId);
      if (!existingMessage) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Only sender can edit
      if (existingMessage.senderId !== userId) {
        return res.status(403).json({ error: "Cannot edit message" });
      }

      // Can only edit within 15 minutes
      const editTimeLimit = 15 * 60 * 1000; // 15 minutes
      if (Date.now() - new Date(existingMessage.createdAt).getTime() > editTimeLimit) {
        return res.status(400).json({ error: "Message is too old to edit" });
      }

      existingMessage.message = message.trim();
      existingMessage.isEdited = true;
      existingMessage.editedAt = new Date();

      await existingMessage.save();
      res.json(existingMessage);
    } catch (err) {
      console.error("Error editing message:", err);
      res.status(500).json({ error: "Failed to edit message" });
    }
  },

  // ==================== ANNOUNCEMENTS ====================

  getAnnouncements: async (req, res) => {
    try {
      const announcements = await Announcement.find()
        .sort({ createdAt: -1 })
        .limit(20);
      res.json(announcements);
    } catch (err) {
      console.error("Error fetching announcements:", err);
      res.status(500).json({ error: "Failed to fetch announcements" });
    }
  },

  createAnnouncement: async (req, res) => {
    try {
      const { title, message, createdBy } = req.body;

      if (!title || !message) {
        return res.status(400).json({ error: "Title and message required" });
      }

      const announcement = await Announcement.create({
        title,
        message,
        createdBy: createdBy || "Admin",
      });

      res.status(201).json(announcement);
    } catch (err) {
      console.error("Error creating announcement:", err);
      res.status(500).json({ error: "Failed to create announcement" });
    }
  },

  deleteAnnouncement: async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.body;

      const announcement = await Announcement.findById(id);
      if (!announcement) {
        return res.status(404).json({ error: "Announcement not found" });
      }

      // Basic permission check - you may want to implement role-based access
      await Announcement.findByIdAndDelete(id);
      res.json({ message: "Announcement deleted successfully" });
    } catch (err) {
      console.error("Error deleting announcement:", err);
      res.status(500).json({ error: "Failed to delete announcement" });
    }
  },

  // ==================== NICKNAMES ====================

  updateNickname: async (req, res) => {
    try {
      const { userId } = req.params;
      const { nickname } = req.body;

      if (!nickname) {
        return res.status(400).json({ error: "Nickname required" });
      }

      if (nickname.length < 3 || nickname.length > 20) {
        return res.status(400).json({ error: "Nickname must be 3-20 characters" });
      }

      const user = await User.findOneAndUpdate(
        { userId },
        { communityNickname: nickname },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ message: "Nickname updated", nickname: user.communityNickname });
    } catch (err) {
      console.error("Error updating nickname:", err);
      res.status(500).json({ error: "Failed to update nickname" });
    }
  },

  getNickname: async (req, res) => {
    try {
      const { userId } = req.params;

      const user = await User.findOne({ userId });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ nickname: user.communityNickname || "Anonymous" });
    } catch (err) {
      console.error("Error fetching nickname:", err);
      res.status(500).json({ error: "Failed to fetch nickname" });
    }
  },
};
