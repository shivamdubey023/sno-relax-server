// sno-relax-server/models/index.js
const User = require('./User');
const Mood = require('./Mood');
const CommunityGroup = require('./CommunityGroup');
const GroupMessage = require('./GroupMessage');
const ChatHistory = require('./ChatHistory');
const PrivateMessage = require('./PrivateMessage');
const HospitalReport = require('./HospitalReport');
const HealthPlan = require('./HealthPlan');
const UserProfileChange = require('./UserProfileChange');
const Announcement = require('./Announcement');
const Community = require('./Community');
const TrainingEntry = require('./TrainingEntry');
const Report = require('./Report');
const Content = require('./Content');
const Setting = require('./Setting');

module.exports = {
    User,
    Mood,
    CommunityGroup,
    GroupMessage,
    ChatHistory,
    PrivateMessage,
    HospitalReport,
    HealthPlan,
    UserProfileChange,
    Announcement,
    Community,
    TrainingEntry,
    Report,
    Content,
    Setting,
};