// sno-relax-server/utils/userRef.js
const mongoose = require('mongoose');
const User = require('../models/User');

async function getUserObjectId(userIdString) {
    if (!userIdString) return null;
    
    if (mongoose.Types.ObjectId.isValid(userIdString)) {
        return new mongoose.Types.ObjectId(userIdString);
    }
    
    const user = await User.findOne({ userId: userIdString }).select('_id').lean();
    return user ? user._id : null;
}

async function getUserIdFromObjectId(userObjectId) {
    if (!userObjectId) return null;
    
    if (typeof userObjectId === 'string') {
        return userObjectId;
    }
    
    const user = await User.findById(userObjectId).select('userId').lean();
    return user ? user.userId : null;
}

async function getPopulatedUser(userIdString) {
    if (!userIdString) return null;
    
    if (mongoose.Types.ObjectId.isValid(userIdString)) {
        return User.findById(userIdString);
    }
    
    return User.findOne({ userId: userIdString });
}

module.exports = {
    getUserObjectId,
    getUserIdFromObjectId,
    getPopulatedUser,
};