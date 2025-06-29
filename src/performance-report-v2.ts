import { parseLinkedInPdf, getParsingMetrics, ParsingMetrics } from './index.js';
import fs from 'fs';
import path from 'path';

// Enhanced metrics interface with computed values
interface PerformanceReport {
  fixtureName: string;
  pdfPath: string;
  
  // Raw metrics from parser
  metrics: ParsingMetrics;
  
  // Expected counts from test fixtures
  expectedWorkCount: number;
  expectedEducationCount: number;
  
  // Computed performance indicators
  workSuccessRate: number;
  educationSuccessRate: number;
  overallSuccessRate: number;
  status: string;
  issues: string[];
  strengths: string[];
}

export async function generatePerformanceReport(fixtureName: string): Promise<PerformanceReport> {
  const pdfPath = `tests/fixtures/${fixtureName}/data/Profile.pdf`;
  const expectedPath = `tests/fixtures/${fixtureName}/data/Profile.expected.json`;
  
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }
  
  if (!fs.existsSync(expectedPath)) {
    throw new Error(`Expected results file not found: ${expectedPath}`);
  }

  try {
    // Load expected results to get true expected counts
    const expectedContent = fs.readFileSync(expectedPath, 'utf-8');
    const expected = JSON.parse(expectedContent);
    const expectedWorkCount = expected.work?.length || 0;
    const expectedEducationCount = expected.education?.length || 0;
    
    // Parse the PDF and get metrics directly
    await parseLinkedInPdf(pdfPath);
    const metrics = getParsingMetrics();
    
    if (!metrics) {
      throw new Error('Failed to collect parsing metrics');
    }

    // Compute performance indicators using expected vs parsed counts
    const workSuccessRate = expectedWorkCount > 0 
      ? Math.round((metrics.workEntriesParsed / expectedWorkCount) * 100) 
      : 100;
      
    const educationSuccessRate = expectedEducationCount > 0 
      ? Math.round((metrics.educationEntriesParsed / expectedEducationCount) * 100) 
      : 100;

    // Calculate overall success rate
    const basicsParsed = !!(metrics.hasName && metrics.hasLabel);
    const workParsed = metrics.workEntriesParsed > 0;
    const educationParsed = metrics.educationEntriesParsed > 0;
    const contactParsed = !!(metrics.hasEmail || metrics.hasLinkedIn);
    
    const successfulSections = [basicsParsed, workParsed, educationParsed, contactParsed].filter(Boolean).length;
    const overallSuccessRate = Math.round(successfulSections / 4 * 100);

    // Determine status
    let status: string;
    if (overallSuccessRate === 100) {
      status = 'PERFECT PARSING';
    } else if (overallSuccessRate >= 75) {
      status = 'GOOD PARSING';
    } else if (overallSuccessRate >= 50) {
      status = 'PARTIAL PARSING';
    } else {
      status = 'POOR PARSING';
    }

    // Identify issues and strengths
    const issues: string[] = [];
    const strengths: string[] = [];
    
    if (!basicsParsed) issues.push('Basics section incomplete');
    if (!workParsed) issues.push('Work experience not extracted');
    if (!educationParsed) issues.push('Education section not parsed');
    if (!contactParsed) issues.push('Contact information missing');
    if (workSuccessRate < 100 && metrics.workEntriesDetected > 0) issues.push('Work entry fragmentation detected');
    if (educationSuccessRate < 100 && metrics.educationEntriesDetected > 0) issues.push('Education parsing incomplete');
    
    if (basicsParsed) strengths.push('Complete basics extraction');
    if (metrics.summaryLength > 200) strengths.push('Comprehensive summary extracted');
    if (metrics.skillsCount > 0) strengths.push('Skills successfully parsed');
    if (metrics.totalPages > 1) strengths.push('Multi-page processing successful');
    if (metrics.pageBreaksRemoved > 0) strengths.push('Page break normalization working');

    return {
      fixtureName,
      pdfPath,
      metrics,
      expectedWorkCount,
      expectedEducationCount,
      workSuccessRate,
      educationSuccessRate,
      overallSuccessRate,
      status,
      issues,
      strengths
    };

  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export function generateMarkdownReport(report: PerformanceReport): string {
  const date = new Date().toISOString().split('T')[0];
  
  return `# Parsing Performance Report: ${report.fixtureName}

*Generated on ${date}*

## 📊 Document Analysis
- **📄 Total text items extracted:** ${report.metrics.totalTextItems}
- **📑 Pages processed:** ${report.metrics.totalPages}
- **🔄 Page breaks normalized:** ${report.metrics.pageBreaksRemoved} removed
- **🗂️ Sections detected:** ${report.metrics.sectionsDetected}

## 🎯 Parsing Results by Section

### ✅ Basics Section
- **👤 Name:** ${report.metrics.hasName ? '✅' : '❌'} ${report.metrics.hasName ? 'Extracted' : 'Missing'}
- **🏷️ Label:** ${report.metrics.hasLabel ? '✅' : '❌'} ${report.metrics.hasLabel ? 'Extracted' : 'Missing'}
- **📍 Location:** ${report.metrics.hasLocation ? '✅' : '❌'} ${report.metrics.hasLocation ? 'Extracted' : 'Missing'}
- **📧 Email:** ${report.metrics.hasEmail ? '✅' : '❌'} ${report.metrics.hasEmail ? 'Found' : 'Not found'}
- **🔗 LinkedIn:** ${report.metrics.hasLinkedIn ? '✅' : '❌'} ${report.metrics.hasLinkedIn ? 'Found' : 'Not found'}
- **📝 Summary:** ${report.metrics.summaryLength > 0 ? '✅' : '❌'} ${report.metrics.summaryLength} characters

### 💼 Work Experience
- **📈 Expected entries:** ${report.expectedWorkCount}
- **📋 Entries parsed:** ${report.metrics.workEntriesParsed}
- **✅ Success rate:** ${report.workSuccessRate}% (${report.metrics.workEntriesParsed}/${report.expectedWorkCount})
- **Status:** ${report.workSuccessRate === 100 ? '✅ Perfect' : report.workSuccessRate >= 75 ? '⚠️ Good' : '❌ Needs improvement'}

### 🎓 Education
- **📚 Expected entries:** ${report.expectedEducationCount}
- **🏫 Entries parsed:** ${report.metrics.educationEntriesParsed}
- **✅ Success rate:** ${report.educationSuccessRate}% (${report.metrics.educationEntriesParsed}/${report.expectedEducationCount})
- **Status:** ${report.educationSuccessRate === 100 ? '✅ Perfect' : report.educationSuccessRate >= 75 ? '⚠️ Good' : '❌ Needs improvement'}

### 🛠️ Additional Sections
- **🔧 Skills:** ${report.metrics.skillsCount} entries
- **🌐 Languages:** ${report.metrics.languagesCount} entries
- **📚 Publications:** ${report.metrics.publicationsCount} entries
- **🏆 Awards:** ${report.metrics.awardsCount} entries
- **📜 Certificates:** ${report.metrics.certificatesCount} entries

### 🔍 Section Details
#### Left Column Sections:
${Object.entries(report.metrics.leftColumnSections).map(([section, count]) => `- **${section}:** ${count} items`).join('\n')}

#### Right Column Sections:
${Object.entries(report.metrics.rightColumnSections).map(([section, count]) => `- **${section}:** ${count} items`).join('\n')}

## 🎯 Overall Assessment

**📊 Overall Success Rate:** ${report.overallSuccessRate}%

**🏆 Status:** ${report.status}

### 💪 Strengths
${report.strengths.map(strength => `- ${strength}`).join('\n')}

### ⚠️ Issues Identified
${report.issues.length > 0 ? report.issues.map(issue => `- ${issue}`).join('\n') : '- No major issues detected'}

## 📈 Performance Rating

${report.overallSuccessRate === 100 ? '🏆 **PERFECT PARSING** - All sections successfully extracted!' :
  report.overallSuccessRate >= 75 ? '✅ **GOOD PARSING** - Most sections successfully extracted' :
  report.overallSuccessRate >= 50 ? '⚠️ **PARTIAL PARSING** - Some sections need improvement' :
  '❌ **POOR PARSING** - Major issues detected'}

---
*This report was automatically generated by the LinkedIn Profile Parser performance analysis tool v2.*
`;
}

export async function generateAllReports(): Promise<PerformanceReport[]> {
  const fixturesDir = 'tests/fixtures';
  const fixtures = fs.readdirSync(fixturesDir).filter(name => 
    fs.statSync(path.join(fixturesDir, name)).isDirectory()
  );

  const allReports: PerformanceReport[] = [];

  for (const fixture of fixtures) {
    try {
      console.log(`\n🔍 Analyzing ${fixture}...`);
      const report = await generatePerformanceReport(fixture);
      allReports.push(report);

      // Generate and save individual report
      const markdownReport = generateMarkdownReport(report);
      const reportPath = `tests/fixtures/${fixture}/data/performance-report.md`;
      fs.writeFileSync(reportPath, markdownReport);
      console.log(`✅ Report saved: ${reportPath}`);

    } catch (error) {
      console.error(`❌ Error analyzing ${fixture}:`, error instanceof Error ? error.message : String(error));
    }
  }

  return allReports;
}

export function generateSummaryTable(allReports: PerformanceReport[]): string {
  const date = new Date().toISOString().split('T')[0];
  
  let table = `# LinkedIn Profile Parser - Performance Summary

*Generated on ${date}*

## 📊 Overall Performance Metrics

| Fixture | Pages | Items | Sections | Name | Label | Location | Summary | Work | Education | Skills | Overall | Status |
|---------|-------|-------|----------|------|-------|----------|---------|------|-----------|--------|---------|--------|
`;

  allReports.forEach(r => {
    const m = r.metrics;
    table += `| ${r.fixtureName} | ${m.totalPages} | ${m.totalTextItems} | ${m.sectionsDetected} | ${m.hasName ? '✅' : '❌'} | ${m.hasLabel ? '✅' : '❌'} | ${m.hasLocation ? '✅' : '❌'} | ${m.summaryLength}ch | ${m.workEntriesParsed}/${r.expectedWorkCount} | ${m.educationEntriesParsed}/${r.expectedEducationCount} | ${m.skillsCount} | ${r.overallSuccessRate}% | ${r.status} |\n`;
  });

  table += `\n## 📈 Success Rate Analysis

`;

  const avgSuccess = Math.round(allReports.reduce((sum, r) => sum + r.overallSuccessRate, 0) / allReports.length);
  const perfectCount = allReports.filter(r => r.overallSuccessRate === 100).length;
  const goodCount = allReports.filter(r => r.overallSuccessRate >= 75 && r.overallSuccessRate < 100).length;
  const partialCount = allReports.filter(r => r.overallSuccessRate >= 50 && r.overallSuccessRate < 75).length;
  const poorCount = allReports.filter(r => r.overallSuccessRate < 50).length;

  table += `- **Average Success Rate:** ${avgSuccess}%
- **Perfect Parsing:** ${perfectCount}/${allReports.length} fixtures (${Math.round(perfectCount/allReports.length*100)}%)
- **Good Parsing:** ${goodCount}/${allReports.length} fixtures (${Math.round(goodCount/allReports.length*100)}%)
- **Partial Parsing:** ${partialCount}/${allReports.length} fixtures (${Math.round(partialCount/allReports.length*100)}%)
- **Poor Parsing:** ${poorCount}/${allReports.length} fixtures (${Math.round(poorCount/allReports.length*100)}%)

## 🔍 Detailed Metrics

### Work Experience Parsing
| Fixture | Expected | Parsed | Success Rate |
|---------|----------|--------|--------------|
`;

  allReports.forEach(r => {
    table += `| ${r.fixtureName} | ${r.expectedWorkCount} | ${r.metrics.workEntriesParsed} | ${r.workSuccessRate}% |\n`;
  });

  table += `\n### Education Parsing
| Fixture | Expected | Parsed | Success Rate |
|---------|----------|--------|--------------|
`;

  allReports.forEach(r => {
    table += `| ${r.fixtureName} | ${r.expectedEducationCount} | ${r.metrics.educationEntriesParsed} | ${r.educationSuccessRate}% |\n`;
  });

  table += `\n### Summary Statistics
| Fixture | Summary Length | Skills Count | Total Sections |
|---------|----------------|--------------|----------------|
`;

  allReports.forEach(r => {
    table += `| ${r.fixtureName} | ${r.metrics.summaryLength} chars | ${r.metrics.skillsCount} | ${r.metrics.sectionsDetected} |\n`;
  });

  table += `\n## 🎯 Common Issues Identified

`;

  const allIssues = allReports.flatMap(r => r.issues);
  const issueFrequency = allIssues.reduce((acc, issue) => {
    acc[issue] = (acc[issue] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(issueFrequency)
    .sort(([,a], [,b]) => b - a)
    .forEach(([issue, count]) => {
      table += `- **${issue}:** ${count}/${allReports.length} fixtures (${Math.round(count/allReports.length*100)}%)\n`;
    });

  table += `\n## 💪 Common Strengths

`;

  const allStrengths = allReports.flatMap(r => r.strengths);
  const strengthFrequency = allStrengths.reduce((acc, strength) => {
    acc[strength] = (acc[strength] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(strengthFrequency)
    .sort(([,a], [,b]) => b - a)
    .forEach(([strength, count]) => {
      table += `- **${strength}:** ${count}/${allReports.length} fixtures (${Math.round(count/allReports.length*100)}%)\n`;
    });

  table += `\n---
*This summary was automatically generated by the LinkedIn Profile Parser performance analysis tool v2.*
`;

  return table;
} 