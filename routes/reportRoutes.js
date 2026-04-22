// sno-relax-server/routes/reportRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const HospitalReport = require('../models/HospitalReport');
const reportAnalyzer = require('../utils/reportAnalyzer');

let sharp = null;
let createWorker = null;

try {
  sharp = require('sharp');
} catch (e) {
  console.warn('Optional dependency `sharp` not installed. Image normalization disabled.');
}

try {
  ({ createWorker } = require('tesseract.js'));
} catch (e) {
  console.warn('Optional dependency `tesseract.js` not installed. OCR disabled.');
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function performOCR(imageBuffer, language = 'eng') {
  if (!createWorker) {
    return { success: false, text: '', error: 'OCR not available' };
  }

  const worker = await createWorker({ logger: m => {} });
  try {
    await worker.load();
    await worker.loadLanguage(language);
    await worker.initialize(language);
    const { data: { text, confidence } } = await worker.recognize(imageBuffer);
    return { success: true, text: (text || '').trim(), confidence };
  } catch (e) {
    return { success: false, text: '', error: e.message };
  } finally {
    try { await worker.terminate(); } catch (e) {}
  }
}

async function normalizeImage(buffer) {
  if (!sharp) return buffer;
  try {
    return await sharp(buffer)
      .resize({ width: 2000, height: 2800, fit: 'inside', withoutEnlargement: true })
      .grayscale(false)
      .normalize()
      .toFormat('png')
      .toBuffer();
  } catch (e) {
    console.warn('Image normalization failed, using original:', e.message);
    return buffer;
  }
}

router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    console.log('📤 Report upload request received');
    console.log('Body keys:', Object.keys(req.body || {}));
    console.log('File:', req.file ? `present (${req.file.size} bytes, ${req.file.mimetype})` : 'missing');
    
    const { userId, userName, language } = req.body;
    
    if (!userId) {
      console.error('❌ Upload failed: userId missing');
      return res.status(400).json({ error: 'userId required' });
    }
    if (!req.file) {
      console.error('❌ Upload failed: file missing');
      return res.status(400).json({ error: 'image file required' });
    }

    console.log('📄 Processing image for user:', userId);
    const normalizedImage = await normalizeImage(req.file.buffer);
    
    const ocrResult = await performOCR(normalizedImage, language || 'eng');
    console.log('🔍 OCR result:', ocrResult.success ? 'success' : 'failed', '- text length:', ocrResult.text?.length || 0);
    
    let analysis = null;
    let reportStatus = 'analyzed';
    
    if (ocrResult.success && ocrResult.text.length > 20) {
      analysis = reportAnalyzer.analyze(ocrResult.text);
      console.log('📊 Analysis complete:', analysis?.summary?.overall || 'unknown');
    } else {
      reportStatus = 'error';
      analysis = { 
        success: false, 
        error: ocrResult.error || 'Could not extract text from image',
        rawTextLength: ocrResult.text.length 
      };
    }

    const report = await HospitalReport.create({
      userId,
      userName: userName || undefined,
      image: normalizedImage,
      imageMime: 'image/png',
      ocrText: ocrResult.text,
      patientInfo: analysis.patientInfo || {},
      testResults: analysis.testResults || [],
      conditions: analysis.conditions || [],
      summary: analysis.summary || { overall: 'unknown', message: 'Analysis could not be completed' },
      recommendations: analysis.recommendations || [],
      reportStatus
    });

    console.log('✅ Report saved:', report._id);

    res.status(201).json({
      ok: true,
      reportId: report._id,
      ocrConfidence: ocrResult.confidence || 0,
      analysis
    });

  } catch (err) {
    console.error('❌ Report upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/upload-multi', upload.array('images', 5), async (req, res) => {
  try {
    const { userId, userName } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'At least one image file required' });
    }

    const results = [];
    
    for (const file of req.files) {
      const normalizedImage = await normalizeImage(file.buffer);
      const ocrResult = await performOCR(normalizedImage);
      
      let analysis = null;
      let reportStatus = 'analyzed';
      
      if (ocrResult.success && ocrResult.text.length > 20) {
        analysis = reportAnalyzer.analyze(ocrResult.text);
      } else {
        reportStatus = 'error';
        analysis = { success: false, error: 'Could not extract text' };
      }

      const report = await HospitalReport.create({
        userId,
        userName: userName || undefined,
        image: normalizedImage,
        imageMime: 'image/png',
        ocrText: ocrResult.text,
        patientInfo: analysis.patientInfo || {},
        testResults: analysis.testResults || [],
        conditions: analysis.conditions || [],
        summary: analysis.summary || { overall: 'unknown' },
        recommendations: analysis.recommendations || [],
        reportStatus
      });

      results.push({
        reportId: report._id,
        ocrConfidence: ocrResult.confidence || 0,
        analysis
      });
    }

    const combinedAnalysis = {
      allReports: results,
      totalReports: results.length,
      overallSummary: results.map(r => r.analysis?.summary).filter(Boolean),
      aggregatedRecommendations: [...new Set(results.flatMap(r => r.analysis?.recommendations || []))]
    };

    res.status(201).json({ ok: true, results: combinedAnalysis });

  } catch (err) {
    console.error('Multi-upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { all, limit = 10 } = req.query;
    
    console.log('📥 Get reports request:', { userId, all, limit });
    
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    if (all === '1' || all === 'true') {
      const reports = await HospitalReport.find({ userId })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .select('-image')
        .lean();
      
      return res.json({
        ok: true,
        count: reports.length,
        reports: reports.map(r => ({
          id: r._id,
          userName: r.userName,
          reportStatus: r.reportStatus,
          summary: r.summary,
          testResults: r.testResults,
          conditions: r.conditions,
          recommendations: r.recommendations,
          patientInfo: r.patientInfo,
          ocrText: r.ocrText,
          testResultsCount: r.testResults?.length || 0,
          createdAt: r.createdAt
        }))
      });
    }

    const report = await HospitalReport.findOne({ userId })
      .sort({ createdAt: -1 })
      .select('-image')
      .lean();
    
    if (!report) {
      return res.json({ ok: true, exists: false, reports: [] });
    }

    res.json({
      ok: true,
      exists: true,
      reports: [{
        id: report._id,
        userName: report.userName,
        reportStatus: report.reportStatus,
        patientInfo: report.patientInfo,
        testResults: report.testResults,
        conditions: report.conditions,
        summary: report.summary,
        recommendations: report.recommendations,
        ocrText: report.ocrText,
        createdAt: report.createdAt
      }]
    });

  } catch (err) {
    console.error('Get report error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/report/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    
    const report = await HospitalReport.findById(reportId).select('-image').lean();
    
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ ok: true, report });

  } catch (err) {
    console.error('Get report by ID error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/image/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const report = await HospitalReport.findById(id).lean();
    
    if (!report || !report.image) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    res.set('Content-Type', report.imageMime || 'image/png');
    res.set('Cache-Control', 'public, max-age=31536000');
    res.send(report.image);

  } catch (err) {
    console.error('Get report image error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    const { userId } = req.body;
    
    const report = await HospitalReport.findOneAndDelete({ 
      _id: reportId,
      ...(userId && { userId })
    });
    
    if (!report) {
      return res.status(404).json({ error: 'Report not found or unauthorized' });
    }

    res.json({ ok: true, message: 'Report deleted successfully' });

  } catch (err) {
    console.error('Delete report error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/reanalyze/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    
    const report = await HospitalReport.findById(reportId);
    
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    if (!report.ocrText || report.ocrText.length < 20) {
      return res.status(400).json({ error: 'No valid OCR text to analyze' });
    }

    const newAnalysis = reportAnalyzer.analyze(report.ocrText);
    
    report.patientInfo = newAnalysis.patientInfo || {};
    report.testResults = newAnalysis.testResults || [];
    report.conditions = newAnalysis.conditions || [];
    report.summary = newAnalysis.summary || { overall: 'unknown' };
    report.recommendations = newAnalysis.recommendations || [];
    report.reportStatus = 'analyzed';
    await report.save();

    res.json({ ok: true, analysis: newAnalysis });

  } catch (err) {
    console.error('Reanalyze error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/analyze-text', async (req, res) => {
  try {
    const { text, userId } = req.body;
    
    if (!text || text.length < 20) {
      return res.status(400).json({ error: 'Text must be at least 20 characters' });
    }

    const analysis = reportAnalyzer.analyze(text);
    
    if (userId) {
      const report = await HospitalReport.create({
        userId,
        ocrText: text,
        patientInfo: analysis.patientInfo || {},
        testResults: analysis.testResults || [],
        conditions: analysis.conditions || [],
        summary: analysis.summary || { overall: 'unknown' },
        recommendations: analysis.recommendations || [],
        reportStatus: 'analyzed'
      });
      
      return res.json({ ok: true, reportId: report._id, analysis });
    }

    res.json({ ok: true, analysis });

  } catch (err) {
    console.error('Analyze text error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;