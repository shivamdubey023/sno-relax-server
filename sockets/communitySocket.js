const GroupMessage = require("../models/GroupMessage");
const PrivateMessage = require("../models/PrivateMessage");

module.exports = function (io) {
  console.log('💬 Community Socket initialized');
  
  io.on("connection", (socket) => {
    console.log(`🔗 Client connected: ${socket.id} (${socket.handshake.address})`);

    // identify user (optional): clients can emit `identify` with their userId to join a personal room
    socket.on("identify", (userId) => {
      if (userId) {
        socket.join(`user_${userId}`);
        socket.userId = userId;
        console.log(`User ${userId} identified`);
      }
    });

    socket.on("joinGroup", async (groupId) => {
      socket.join(groupId);
      socket.currentGroup = groupId;
      
      // Mark messages as read when user joins
      if (socket.userId && groupId) {
        try {
          await GroupMessage.updateMany(
            { groupId, readBy: { $ne: socket.userId } },
            { $addToSet: { readBy: socket.userId } }
          );
        } catch (e) {
          console.error("Error marking messages as read:", e);
        }
      }
    });

    socket.on("leaveGroup", (groupId) => {
      socket.leave(groupId);
      if (socket.currentGroup === groupId) {
        socket.currentGroup = null;
      }
    });

    // Send message with reactions support
    socket.on("sendGroupMessage", async (payload) => {
      try {
        const { groupId, senderId, senderNickname, message, isAdmin: forceAdmin } = payload;

        let isAdmin = !!forceAdmin;
        try {
          const admins = require("../store/admins.json");
          if (Array.isArray(admins) && admins.some(a => String(a.userId) === String(senderId))) {
            isAdmin = true;
          }
        } catch (e) {}

        const m = new GroupMessage({ 
          groupId, 
          senderId, 
          senderNickname: senderNickname || (isAdmin ? 'Admin' : 'Anonymous'), 
          message, 
          isAdmin,
          readBy: [senderId]
        });
        await m.save();
        
        const populated = await m.populate("senderId", "name firstName lastName");
        io.to(groupId).emit("receiveGroupMessage", populated);
        io.to(groupId).emit("newMessage", populated);
      } catch (err) {
        console.error("socket sendGroupMessage error", err);
        socket.emit("messageError", { error: "Failed to send message" });
      }
    });

    // Add reaction to message
    socket.on("addReaction", async (payload) => {
      try {
        const { messageId, userId, emoji } = payload;
        const message = await GroupMessage.findByIdAndUpdate(
          messageId,
          { $pull: { reactions: { userId } } },
          { new: true }
        );
        
        const updated = await GroupMessage.findByIdAndUpdate(
          messageId,
          { $push: { reactions: { userId, emoji } } },
          { new: true }
        ).populate("senderId", "name firstName lastName");
        
        if (updated && socket.currentGroup) {
          io.to(socket.currentGroup).emit("reactionAdded", updated);
        }
      } catch (err) {
        console.error("socket addReaction error", err);
      }
    });

    // Remove reaction from message
    socket.on("removeReaction", async (payload) => {
      try {
        const { messageId, userId } = payload;
        const updated = await GroupMessage.findByIdAndUpdate(
          messageId,
          { $pull: { reactions: { userId } } },
          { new: true }
        ).populate("senderId", "name firstName lastName");
        
        if (updated && socket.currentGroup) {
          io.to(socket.currentGroup).emit("reactionRemoved", updated);
        }
      } catch (err) {
        console.error("socket removeReaction error", err);
      }
    });

    // Mark message as read
    socket.on("markRead", async (payload) => {
      try {
        const { messageId, userId } = payload;
        await GroupMessage.findByIdAndUpdate(
          messageId,
          { $addToSet: { readBy: userId } }
        );
      } catch (err) {
        console.error("socket markRead error", err);
      }
    });

    // Typing indicator
    socket.on("typing", (payload) => {
      const { groupId, userId, nickname, isTyping } = payload;
      socket.to(groupId).emit("userTyping", { userId, nickname, isTyping });
    });

    // Legacy handlers
    socket.on("sendMessage", async (payload) => {
      try {
        const groupId = payload.groupId || payload?.message?.groupId;
        const message = payload.message || payload;
        const senderId = message.senderId || message.userId || null;
        const text = message.message || message.text || (typeof message === "string" ? message : "");
        
        let isAdmin = false;
        try {
          const admins = require("../store/admins.json");
          if (Array.isArray(admins) && admins.some(a => String(a.userId) === String(senderId))) {
            isAdmin = true;
          }
        } catch (e) {}

        const m = new GroupMessage({ 
          groupId, 
          senderId, 
          senderNickname: (isAdmin ? 'Admin' : undefined), 
          message: text, 
          isAdmin,
          readBy: senderId ? [senderId] : []
        });
        await m.save();
        const populated = await m.populate("senderId", "name");
        io.to(groupId).emit("newMessage", populated);
        io.to(groupId).emit("receiveGroupMessage", populated);
      } catch (err) {
        console.error("socket sendMessage error", err);
      }
    });

    socket.on("sendPrivateMessage", async (payload) => {
      try {
        const { senderId, receiverId, message } = payload;
        const m = new PrivateMessage({ senderId, receiverId, message });
        await m.save();
        io.to(`user_${receiverId}`).emit("receivePrivateMessage", m);
      } catch (err) {
        console.error("socket sendPrivateMessage error", err);
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(`🔌 Client disconnected: ${socket.id} (${reason})`);
    });

    socket.on("connect_error", (error) => {
      console.error(`❌ Connection error for ${socket.id}:`, error.message);
    });
  });
};
