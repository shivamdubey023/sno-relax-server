// sno-relax-server/models/HospitalReport.js
const mongoose = require('mongoose');

const patientInfoSchema = new mongoose.Schema({
    patientName: { type: String },
    age: { type: Number },
    gender: { type: String },
    refBy: { type: String },
    collectionDate: { type: String },
    reportDate: { type: String },
}, { _id: false });

const testResultSchema = new mongoose.Schema({
    category: { type: String, enum: ['blood', 'metabolic', 'liver', 'thyroid', 'cardiac'] },
    name: { type: String },
    value: { type: Number },
    unit: { type: String },
    normal: {
        min: { type: Number },
        max: { type: Number }
    },
    status: { type: String, enum: ['normal', 'abnormal', 'critical', 'unknown'] },
    raw: { type: String }
}, { _id: false });

const conditionSchema = new mongoose.Schema({
    condition: { type: String },
    matchedKeywords: [{ type: String }],
    confidence: { type: Number }
}, { _id: false });

const HospitalReportSchema = new mongoose.Schema({
    userId: {
        type: String,
        ref: 'User',
        required: true,
        index: true,
    },
    userName: { type: String },
    image: { type: Buffer },
    imageMime: { type: String },
    ocrText: { type: String, default: '' },
    
    patientInfo: { type: patientInfoSchema, default: {} },
    testResults: { type: [testResultSchema], default: [] },
    conditions: { type: [conditionSchema], default: [] },
    summary: {
        overall: { type: String, enum: ['normal', 'abnormal', 'critical'], default: 'normal' },
        criticalFindings: { type: Number, default: 0 },
        abnormalFindings: { type: Number, default: 0 },
        normalFindings: { type: Number, default: 0 },
        message: { type: String },
        detectedConditions: [{ type: String }]
    },
    recommendations: [{ type: String }],
    reportStatus: { type: String, enum: ['pending', 'analyzed', 'error'], default: 'pending' }
}, { timestamps: true });

HospitalReportSchema.index({ userId: 1, createdAt: -1 });
HospitalReportSchema.index({ createdAt: -1 });
HospitalReportSchema.index({ reportStatus: 1 });

HospitalReportSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

HospitalReportSchema.set("toJSON", { virtuals: true });
HospitalReportSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model('HospitalReport', HospitalReportSchema);