const User = require("../models/User");
const ChatHistory = require("../models/ChatHistory");
const Content = require("../models/Content");
const CommunityGroup = require("../models/CommunityGroup");
const GroupMessage = require("../models/GroupMessage");
const Announcement = require("../models/Announcement");
const Report = require("../models/Report");

module.exports = (io) => {
  // Admin namespace for admin-specific WebSocket connections
  const adminNamespace = io.of('/admin');

  adminNamespace.on('connection', (socket) => {
    console.log(`🔌 Admin WebSocket connected: ${socket.id}`);

    // Admin authentication check
    socket.on('authenticate', (data) => {
      const { adminToken, adminId } = data;

      // Simple authentication check (in production, verify JWT token)
      if (adminToken && adminId) {
        socket.adminAuthenticated = true;
        socket.adminId = adminId;
        socket.emit('authenticated', { success: true });
        console.log(`✅ Admin authenticated: ${adminId} (${socket.id})`);
      } else {
        socket.emit('authenticated', { success: false, message: 'Invalid credentials' });
        console.log(`❌ Admin authentication failed: ${socket.id}`);
      }
    });

    // Join admin room for real-time updates
    socket.on('joinAdminRoom', (data) => {
      if (!socket.adminAuthenticated) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const adminId = socket.adminId || data.adminId;
      socket.join(`admin_${adminId}`);
      console.log(`👤 Admin ${adminId} joined admin room`);

      // Send initial stats
      sendRealTimeStats(socket);
    });

    // Handle admin commands
    socket.on('adminCommand', async (data) => {
      if (!socket.adminAuthenticated) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const { command, payload } = data;

      try {
        switch (command) {
          case 'broadcastAnnouncement':
            await handleBroadcastAnnouncement(socket, payload);
            break;
          case 'kickUser':
            await handleKickUser(socket, payload);
            break;
          case 'moderateContent':
            await handleModerateContent(socket, payload);
            break;
          case 'getRealTimeStats':
            await sendRealTimeStats(socket);
            break;
          default:
            socket.emit('error', { message: 'Unknown command' });
        }
      } catch (error) {
        console.error('Admin command error:', error);
        socket.emit('error', { message: 'Command execution failed' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`🔌 Admin WebSocket disconnected: ${socket.id}`);
      if (socket.adminId) {
        socket.leave(`admin_${socket.adminId}`);
      }
    });
  });

  // Real-time stats broadcaster
  const broadcastStatsUpdate = async () => {
    try {
      const stats = await getRealTimeStats();
      adminNamespace.emit('statsUpdate', stats);
    } catch (error) {
      console.error('Error broadcasting stats:', error);
    }
  };

  // Broadcast user activity
  const broadcastUserActivity = (activityData) => {
    adminNamespace.emit('userActivity', activityData);
  };

  // Broadcast new user registration
  const broadcastNewUser = (userData) => {
    adminNamespace.emit('newUser', userData);
  };

  // Broadcast new content
  const broadcastNewContent = (contentData) => {
    adminNamespace.emit('newContent', contentData);
  };

  // Broadcast chat activity
  const broadcastChatActivity = (chatData) => {
    adminNamespace.emit('chatActivity', chatData);
  };

  // Broadcast community updates
  const broadcastCommunityUpdate = (updateData) => {
    adminNamespace.emit('communityUpdate', updateData);
  };

  // Helper functions
  async function getRealTimeStats() {
    try {
      const [
        totalUsers,
        totalChats,
        totalContent,
        totalGroups,
        recentChats,
        activeUsers
      ] = await Promise.all([
        User.countDocuments(),
        ChatHistory.countDocuments(),
        Content.countDocuments(),
        CommunityGroup.countDocuments(),
        ChatHistory.find().sort({ timestamp: -1 }).limit(10),
        User.find({ lastActive: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }).countDocuments()
      ]);

      // Calculate community members
      const groups = await CommunityGroup.find().populate('members');
      const totalCommunityMembers = groups.reduce((sum, group) => sum + (group.members?.length || 0), 0);

      return {
        totalUsers,
        totalChats,
        totalContent,
        totalCommunityGroups: totalGroups,
        totalCommunityMembers,
        activeUsers,
        recentActivity: recentChats.map(chat => ({
          id: chat._id,
          userId: chat.userId,
          message: chat.message.substring(0, 50) + (chat.message.length > 50 ? '...' : ''),
          timestamp: chat.timestamp
        })),
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting real-time stats:', error);
      return null;
    }
  }

  async function sendRealTimeStats(socket) {
    const stats = await getRealTimeStats();
    if (stats) {
      socket.emit('statsUpdate', stats);
    }
  }

  async function handleBroadcastAnnouncement(socket, payload) {
    const { title, message, targetUsers } = payload;

    // Create announcement in database
    const announcement = new Announcement({
      title,
      message,
      createdBy: socket.adminId || 'admin',
      targetUsers: targetUsers || 'all',
      timestamp: new Date()
    });

    await announcement.save();

    // Broadcast to relevant users (this would need user socket management)
    socket.emit('commandResult', {
      command: 'broadcastAnnouncement',
      success: true,
      announcementId: announcement._id
    });
  }

  async function handleKickUser(socket, payload) {
    const { userId, reason } = payload;

    // In a real implementation, you'd handle user kicking logic
    // For now, just log and emit success
    console.log(`Admin ${socket.adminId} kicked user ${userId}. Reason: ${reason}`);

    socket.emit('commandResult', {
      command: 'kickUser',
      success: true,
      userId
    });
  }

  async function handleModerateContent(socket, payload) {
    const { contentId, action, reason } = payload;

    // Update content moderation status
    await Content.findByIdAndUpdate(contentId, {
      moderationStatus: action,
      moderatedBy: socket.adminId,
      moderatedAt: new Date(),
      moderationReason: reason
    });

    socket.emit('commandResult', {
      command: 'moderateContent',
      success: true,
      contentId
    });
  }

  // Set up periodic stats broadcasting (every 30 seconds)
  setInterval(broadcastStatsUpdate, 30000);

  // Export functions for use by other modules
  return {
    broadcastStatsUpdate,
    broadcastUserActivity,
    broadcastNewUser,
    broadcastNewContent,
    broadcastChatActivity,
    broadcastCommunityUpdate
  };
};