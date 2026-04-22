// sno-relax-server/utils/reportAnalyzer.js
// ML-based medical report analyzer using OCR text extraction

class MedicalReportAnalyzer {
  constructor() {
    this.healthIndicators = {
      blood: {
        patterns: [
          { name: 'Hemoglobin', regex: /hemoglobin|hb\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'g/dL', normal: { min: 12, max: 17.5 }, critical: { min: 7, max: 20 } },
          { name: 'RBC', regex: /red blood cell|rbc\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'million/mcL', normal: { min: 4.2, max: 6.1 }, critical: { min: 3, max: 8 } },
          { name: 'WBC', regex: /white blood cell|wbc\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'thousand/mcL', normal: { min: 4.5, max: 11 }, critical: { min: 2, max: 30 } },
          { name: 'Platelets', regex: /platelet\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'thousand/mcL', normal: { min: 150, max: 400 }, critical: { min: 50, max: 1000 } },
          { name: 'Hematocrit', regex: /hematocrit|hct\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: '%', normal: { min: 36, max: 50 }, critical: { min: 25, max: 60 } },
        ],
        status: ['low', 'normal', 'high', 'critical']
      },
      metabolic: {
        patterns: [
          { name: 'Glucose Fasting', regex: /glucose\s*(\bfasting\b)?\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'mg/dL', normal: { min: 70, max: 100 }, critical: { min: 50, max: 400 } },
          { name: 'Glucose Random', regex: /glucose\s*random\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'mg/dL', normal: { min: 70, max: 140 }, critical: { min: 50, max: 400 } },
          { name: 'HbA1c', regex: /hba1c|glycated\s*hemoglobin\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: '%', normal: { min: 4, max: 5.6 }, critical: { min: 3, max: 15 } },
          { name: 'Cholesterol Total', regex: /total\s*cholesterol|cholesterol\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'mg/dL', normal: { min: 0, max: 200 }, critical: { min: 0, max: 300 } },
          { name: 'HDL', regex: /hdl\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'mg/dL', normal: { min: 40, max: 200 }, critical: { min: 20, max: 200 } },
          { name: 'LDL', regex: /ldl\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'mg/dL', normal: { min: 0, max: 100 }, critical: { min: 0, max: 190 } },
          { name: 'Triglycerides', regex: /triglyceride|tg\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'mg/dL', normal: { min: 0, max: 150 }, critical: { min: 0, max: 500 } },
          { name: 'Creatinine', regex: /creatinine\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'mg/dL', normal: { min: 0.7, max: 1.3 }, critical: { min: 0.4, max: 10 } },
          { name: 'BUN', regex: /blood\s*urea|bun\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'mg/dL', normal: { min: 7, max: 20 }, critical: { min: 3, max: 100 } },
          { name: 'Uric Acid', regex: /uric\s*acid\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'mg/dL', normal: { min: 3.5, max: 7.2 }, critical: { min: 2, max: 12 } },
        ],
        status: ['low', 'normal', 'high', 'critical']
      },
      liver: {
        patterns: [
          { name: 'SGPT/ALT', regex: /sgpt|alt\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'U/L', normal: { min: 7, max: 56 }, critical: { min: 0, max: 500 } },
          { name: 'SGOT/AST', regex: /sgot|ast\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'U/L', normal: { min: 10, max: 40 }, critical: { min: 0, max: 500 } },
          { name: 'Bilirubin Total', regex: /bilirubin\s*total\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'mg/dL', normal: { min: 0.1, max: 1.2 }, critical: { min: 0, max: 20 } },
          { name: 'Albumin', regex: /albumin\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'g/dL', normal: { min: 3.5, max: 5.5 }, critical: { min: 1.5, max: 8 } },
        ],
        status: ['low', 'normal', 'high', 'critical']
      },
      thyroid: {
        patterns: [
          { name: 'TSH', regex: /tsh\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'mIU/L', normal: { min: 0.4, max: 4.0 }, critical: { min: 0.01, max: 20 } },
          { name: 'T3', regex: /t3\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'ng/mL', normal: { min: 0.8, max: 2.0 }, critical: { min: 0.2, max: 5 } },
          { name: 'T4', regex: /t4\s*[:\-]?\s*(\d+\.?\d*)/gi, unit: 'mcg/dL', normal: { min: 4.5, max: 12 }, critical: { min: 1, max: 20 } },
        ],
        status: ['low', 'normal', 'high', 'critical']
      },
      cardiac: {
        patterns: [
          { name: 'Blood Pressure Systolic', regex: /blood\s*pressure\s*[:\-]?\s*(\d+)\s*[\/]/gi, unit: 'mmHg', normal: { min: 90, max: 120 }, critical: { min: 70, max: 200 } },
          { name: 'Blood Pressure Diastolic', regex: /blood\s*pressure\s*[:\-]?\s*\d+\s*[\/]?\s*(\d+)/gi, unit: 'mmHg', normal: { min: 60, max: 80 }, critical: { min: 40, max: 120 } },
          { name: 'Heart Rate', regex: /heart\s*rate|pulse\s*[:\-]?\s*(\d+)/gi, unit: 'bpm', normal: { min: 60, max: 100 }, critical: { min: 40, max: 200 } },
        ],
        status: ['low', 'normal', 'high', 'critical']
      }
    };

    this.diseaseKeywords = {
      diabetes: ['diabetes', 'diabetic', 'blood sugar', 'hyperglycemia', 'hypoglycemia'],
      hypertension: ['hypertension', 'high blood pressure', 'elevated bp'],
      anemia: ['anemia', 'low hemoglobin', 'iron deficiency'],
      infection: ['infection', 'inflamed', 'elevated wbc', 'leukocytosis'],
      thyroid_disorder: ['thyroid', 'hyperthyroid', 'hypothyroid', 'goiter'],
      liver_disease: ['hepatitis', 'liver', 'jaundice', 'fatty liver'],
      kidney_disease: ['kidney', 'renal', 'nephropathy'],
      heart_disease: ['cardiac', 'heart', 'cardiovascular', 'coronary']
    };

    this.recommendations = {
      critical: 'Please consult a doctor immediately for medical attention.',
      abnormal: 'Your test results show some values outside normal range. Please follow up with your healthcare provider.',
      normal: 'Your test results appear within normal ranges. Maintain a healthy lifestyle.',
      review: 'Some values need medical interpretation. Please discuss with your doctor.'
    };
  }

  cleanText(text) {
    return (text || '')
      .replace(/\s+/g, ' ')
      .replace(/[^\x00-\x7F]/g, '')
      .replace(/[|]/g, ':')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  extractDates(text) {
    const patterns = [
      /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g,
      /\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/g,
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi
    ];
    
    const dates = [];
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        dates.push(match[0]);
      }
    });
    return [...new Set(dates)].slice(0, 5);
  }

  extractPatientInfo(text) {
    const info = {
      patientName: null,
      age: null,
      gender: null,
      refBy: null,
      collectionDate: null,
      reportDate: null
    };

    const nameMatch = text.match(/patient\s*name\s*[:\-]?\s*([A-Za-z\s]+?)(?=\n|:|$)/i);
    if (nameMatch) info.patientName = nameMatch[1].trim();

    const ageMatch = text.match(/age\s*[:\-]?\s*(\d+)/i);
    if (ageMatch) info.age = parseInt(ageMatch[1]);

    const genderMatch = text.match(/gender\s*[:\-]?\s*(male|female|other|m|f)/i);
    if (genderMatch) info.gender = genderMatch[1].toLowerCase();

    const refByMatch = text.match(/ref\.?\s*by\s*[:\-]?\s*([A-Za-z\s\.]+?)(?=\n|:|$)/i);
    if (refByMatch) info.refBy = refByMatch[1].trim();

    const dates = this.extractDates(text);
    if (dates.length > 0) info.reportDate = dates[0];

    return info;
  }

  analyzeValue(value, normal, critical) {
    const num = parseFloat(value);
    if (isNaN(num)) return 'unknown';
    
    if (num < critical.min || num > critical.max) return 'critical';
    if (num < normal.min || num > normal.max) return 'abnormal';
    return 'normal';
  }

  extractTestResults(text) {
    const results = [];
    const categories = ['blood', 'metabolic', 'liver', 'thyroid', 'cardiac'];

    categories.forEach(category => {
      const categoryConfig = this.healthIndicators[category];
      if (!categoryConfig) return;

      categoryConfig.patterns.forEach(test => {
        const matches = text.match(test.regex);
        if (matches) {
          matches.forEach(match => {
            const valueMatch = match.match(/(\d+\.?\d*)/);
            if (valueMatch) {
              const value = parseFloat(valueMatch[1]);
              const status = this.analyzeValue(value, test.normal, test.critical);
              
              results.push({
                category,
                name: test.name,
                value,
                unit: test.unit,
                normal: test.normal,
                status,
                raw: match.trim()
              });
            }
          });
        }
      });
    });

    return results;
  }

  detectPossibleConditions(text) {
    const lower = text.toLowerCase();
    const detected = [];

    Object.entries(this.diseaseKeywords).forEach(([condition, keywords]) => {
      const matchedKeywords = keywords.filter(kw => lower.includes(kw));
      if (matchedKeywords.length > 0) {
        detected.push({
          condition,
          matchedKeywords,
          confidence: Math.min(matchedKeywords.length * 0.3, 1)
        });
      }
    });

    return detected.sort((a, b) => b.confidence - a.confidence);
  }

  generateSummary(results, conditions) {
    const criticalCount = results.filter(r => r.status === 'critical').length;
    const abnormalCount = results.filter(r => r.status === 'abnormal').length;
    const normalCount = results.filter(r => r.status === 'normal').length;

    let summary = {
      overall: 'normal',
      criticalFindings: criticalCount,
      abnormalFindings: abnormalCount,
      normalFindings: normalCount,
      message: this.recommendations.normal
    };

    if (criticalCount > 0) {
      summary.overall = 'critical';
      summary.message = this.recommendations.critical;
    } else if (abnormalCount > 0) {
      summary.overall = 'abnormal';
      summary.message = this.recommendations.abnormal;
    }

    if (conditions.length > 0 && conditions[0].confidence > 0.5) {
      summary.detectedConditions = conditions.slice(0, 3).map(c => c.condition.replace(/_/g, ' '));
    }

    return summary;
  }

  generateRecommendations(results, conditions, patientInfo) {
    const recommendations = [];
    const criticalAbnormal = results.filter(r => r.status === 'critical' || r.status === 'abnormal');

    if (criticalAbnormal.length > 0) {
      recommendations.push('Schedule a follow-up with your doctor to discuss the abnormal findings.');
    }

    const highGlucose = results.find(r => r.name.includes('Glucose') && r.status !== 'normal');
    if (highGlucose) {
      recommendations.push('Monitor your blood sugar levels regularly. Consider dietary modifications.');
    }

    const highCholesterol = results.find(r => r.name.includes('Cholesterol') && r.status !== 'normal');
    if (highCholesterol) {
      recommendations.push('Reduce saturated fat intake and increase physical activity for cholesterol management.');
    }

    const abnormalBP = results.find(r => r.name.includes('Blood Pressure'));
    if (abnormalBP) {
      recommendations.push('Monitor blood pressure regularly. Reduce sodium intake and maintain a healthy weight.');
    }

    const abnormalThyroid = results.find(r => r.category === 'thyroid' && r.status !== 'normal');
    if (abnormalThyroid) {
      recommendations.push('Consult an endocrinologist for thyroid function evaluation.');
    }

    if (patientInfo.age && patientInfo.age > 45) {
      recommendations.push('Consider regular health check-ups given your age group.');
    }

    if (recommendations.length === 0) {
      recommendations.push('Maintain a balanced diet, regular exercise, and adequate sleep.');
      recommendations.push('Continue regular health screenings as recommended by your doctor.');
    }

    return recommendations;
  }

  analyze(text) {
    const cleanText = this.cleanText(text);
    const patientInfo = this.extractPatientInfo(cleanText);
    const testResults = this.extractTestResults(cleanText);
    const conditions = this.detectPossibleConditions(cleanText);
    const summary = this.generateSummary(testResults, conditions);
    const recommendations = this.generateRecommendations(testResults, conditions, patientInfo);

    return {
      success: true,
      patientInfo,
      testResults,
      conditions,
      summary,
      recommendations,
      rawTextLength: text.length,
      extractedAt: new Date().toISOString()
    };
  }
}

module.exports = new MedicalReportAnalyzer();