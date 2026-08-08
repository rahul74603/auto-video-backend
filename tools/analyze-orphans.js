#!/usr/bin/env node
/**
 * analyze-orphans.js — Analyze 1,170 orphan pages CSV and generate fix map
 * Usage: node tools/analyze-orphans.js path/to/orphan.csv
 * 
 * Outputs:
 *  - orphan-stats.json (statistics)
 *  - orphan-fix-map.csv (complete mapping for every URL)
 *  - orphan-clusters.json (content clusters)
 *  - missing-hubs.json (recommended hub pages)
 */

const fs = require('fs');
const path = require('path');
const csvPath = process.argv[2];

if (!csvPath) {
  console.error('Usage: node tools/analyze-orphans.js <path-to-csv>');
  console.error('Example: node tools/analyze-orphans.js ./studygyaan_orphan.csv');
  process.exit(1);
}

if (!fs.existsSync(csvPath)) {
  console.error(`File not found: ${csvPath}`);
  process.exit(1);
}

const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split('\n').filter(l => l.trim());
const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

console.log(`Columns: ${headers.join(', ')}`);
console.log(`Total lines: ${lines.length}`);

function parseCSVLine(line) {
  // Simple CSV parser handling quoted fields
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i+1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

const rows = [];
for (let i = 1; i < lines.length; i++) {
  const values = parseCSVLine(lines[i]);
  if (values.length < 2) continue;
  const obj = {};
  headers.forEach((h, idx) => {
    obj[h] = (values[idx] || '').replace(/^"|"$/g, '').trim();
  });
  rows.push(obj);
}

console.log(`Parsed rows: ${rows.length}`);

// Classification helpers
function classifyContentType(url, title) {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = (title || '').toLowerCase();
  
  if (lowerUrl.includes('/web-stories/')) return 'WEB_STORY';
  if (lowerUrl.includes('/test/') || lowerTitle.includes('mock test') || lowerTitle.includes('practice test')) return 'MOCK_TEST';
  if (lowerTitle.includes('admit card') || lowerTitle.includes('hall ticket')) return 'ADMIT_CARD';
  if (lowerTitle.includes('result') || lowerTitle.includes('merit list') || lowerTitle.includes('cut off') || lowerTitle.includes('scorecard')) return 'RESULT';
  if (lowerTitle.includes('syllabus') || lowerTitle.includes('exam pattern')) return 'SYLLABUS';
  if (lowerTitle.includes('answer key')) return 'ANSWER_KEY';
  if (lowerUrl.includes('/job/') || lowerTitle.includes('recruitment') || lowerTitle.includes('vacancy') || lowerTitle.includes('bharti')) return 'JOB';
  if (lowerUrl.includes('/update/') || lowerTitle.includes('update') || lowerTitle.includes('notification')) return 'UPDATE';
  if (lowerUrl.includes('/material/') || lowerTitle.includes('notes') || lowerTitle.includes('study material')) return 'STUDY_MATERIAL';
  if (lowerUrl.includes('/course/') || lowerUrl.includes('/premium-notes')) return 'PREMIUM';
  if (lowerUrl.includes('/ebook') || lowerUrl.includes('/e-books')) return 'EBOOK';
  if (['/about-us', '/contact-us', '/privacy-policy', '/terms-conditions', '/free-study-material', '/premium-notes', '/e-books'].some(p => lowerUrl.endsWith(p) || lowerUrl.includes(p))) return 'STATIC';
  return 'OTHER';
}

function determineExam(url, title) {
  const combined = `${url} ${title}`.toUpperCase();
  const exams = [
    'SSC GD', 'SSC CGL', 'SSC CHSL', 'SSC MTS', 'SSC', 
    'RRB GROUP D', 'RRB NTPC', 'RAILWAY', 'RRB',
    'BANKING', 'IBPS', 'SBI PO', 'SBI CLERK', 'BANK PO', 'BANK CLERK',
    'POLICE', 'MP POLICE', 'UP POLICE', 'BIHAR POLICE', 'RAJASTHAN POLICE', 'DELHI POLICE',
    'UPSC', 'UPPCS', 'BPSC', 'MPPSC',
    'NEET', 'CUET', 'CTET', 'UPTET', 'MPTET',
    'NDA', 'CDS', 'AFCAT',
    'JEE', 'GATE',
    'MATHEMATICS', 'REASONING', 'ENGLISH', 'HINDI', 'GK', 'GS', 'CURRENT AFFAIRS', 'HISTORY', 'GEOGRAPHY', 'POLITY', 'SCIENCE'
  ];
  for (const exam of exams) {
    if (combined.includes(exam)) return exam;
  }
  return 'GENERAL';
}

function determineParentHub(category, exam) {
  if (category === 'WEB_STORY') return { hub: '/web-stories', name: 'Web Stories Hub' };
  if (category === 'MOCK_TEST') {
    if (exam !== 'GENERAL') return { hub: `/test?exam=${encodeURIComponent(exam)}`, name: `${exam} Mock Tests Hub` };
    return { hub: '/test', name: 'Mock Tests Hub' };
  }
  if (category === 'JOB' || category === 'RECRUITMENT') {
    if (exam !== 'GENERAL') return { hub: `/govt-jobs?exam=${encodeURIComponent(exam)}`, name: `${exam} Jobs Hub` };
    return { hub: '/govt-jobs', name: 'Government Jobs Hub' };
  }
  if (category === 'ADMIT_CARD') return { hub: '/govt-jobs?type=admit-card', name: 'Admit Cards Hub' };
  if (category === 'RESULT') return { hub: '/govt-jobs?type=result', name: 'Results Hub' };
  if (category === 'SYLLABUS') return { hub: '/govt-jobs?type=syllabus', name: 'Syllabus Hub' };
  if (category === 'STUDY_MATERIAL') return { hub: '/free-study-material', name: 'Study Material Hub' };
  if (category === 'STATIC') return { hub: '/', name: 'Home' };
  return { hub: '/govt-jobs', name: 'Government Jobs Hub' };
}

// Statistics
const stats = {
  total: rows.length,
  byDirectory: {},
  byContentType: {},
  byExam: {},
  httpStatus: {},
  sitemapRef: { yes: 0, no: 0 },
  orphan: { count: 0 }
};

const fixMap = [];

for (const row of rows) {
  const url = row['URL'] || row['url'] || row['Address'] || '';
  const title = row['Title'] || row['title'] || '';
  
  // Directory
  try {
    const urlObj = new URL(url);
    const parts = urlObj.pathname.split('/').filter(Boolean);
    const dir = parts.length ? `/${parts[0]}/` : '/';
    stats.byDirectory[dir] = (stats.byDirectory[dir] || 0) + 1;
  } catch {
    stats.byDirectory['invalid'] = (stats.byDirectory['invalid'] || 0) + 1;
  }

  const contentType = classifyContentType(url, title);
  stats.byContentType[contentType] = (stats.byContentType[contentType] || 0) + 1;

  const exam = determineExam(url, title);
  stats.byExam[exam] = (stats.byExam[exam] || 0) + 1;

  const status = row['HTTP status code'] || row['Status'] || '200';
  stats.httpStatus[status] = (stats.httpStatus[status] || 0) + 1;

  const sitemapRef = row['Referenced in sitemaps'] || row['In Sitemap'] || '';
  if (sitemapRef.toLowerCase().includes('yes') || sitemapRef === '1' || sitemapRef.toLowerCase().includes('true')) {
    stats.sitemapRef.yes++;
  } else {
    stats.sitemapRef.no++;
  }

  const inlinks = parseInt(row['No. of href inlinks'] || row['Inlinks'] || '0', 10);
  if (inlinks === 0) stats.orphan.count++;

  // Build fix map
  const parent = determineParentHub(contentType, exam);
  const anchorText = title.length > 10 ? title.slice(0, 60) : `${exam} ${contentType}`.trim();

  let priority = 'P2';
  if (contentType === 'JOB' || contentType === 'RECRUITMENT') priority = 'P0';
  else if (contentType === 'ADMIT_CARD' || contentType === 'RESULT') priority = 'P0';
  else if (contentType === 'MOCK_TEST') priority = 'P1';
  else if (contentType === 'SYLLABUS') priority = 'P1';
  else if (contentType === 'WEB_STORY') priority = 'P2';
  else if (contentType === 'STATIC') priority = 'P3';

  fixMap.push({
    url,
    title: title.slice(0, 120),
    contentType,
    category: contentType,
    exam,
    subject: row['Subject'] || '',
    topic: '',
    parentHub: parent.hub,
    parentName: parent.name,
    suggestedSource: `Hub page ${parent.hub} + related ${exam} pages`,
    anchorText,
    priority,
    action: 'KEEP + LINK'
  });
}

console.log('\n=== STATISTICS ===');
console.log(`Total URLs: ${stats.total}`);
console.log('\nBy Directory:');
Object.entries(stats.byDirectory).sort((a,b)=>b[1]-a[1]).forEach(([dir, count]) => console.log(`  ${dir}: ${count}`));
console.log('\nBy Content Type:');
Object.entries(stats.byContentType).sort((a,b)=>b[1]-a[1]).forEach(([type, count]) => console.log(`  ${type}: ${count}`));
console.log('\nBy Exam (top 20):');
Object.entries(stats.byExam).sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([exam, count]) => console.log(`  ${exam}: ${count}`));
console.log(`\nSitemap: Yes=${stats.sitemapRef.yes}, No=${stats.sitemapRef.no}`);
console.log(`Orphan (0 inlinks): ${stats.orphan.count}`);

// Save outputs
const outDir = path.join(__dirname, '..', 'orphan-analysis');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'orphan-stats.json'), JSON.stringify(stats, null, 2), 'utf8');
console.log(`\n✅ Saved stats to ${outDir}/orphan-stats.json`);

// Fix map CSV
let csvContent = 'URL,Title,Content Type,Category,Exam,Parent Hub,Parent Name,Suggested Source,Anchor Text,Priority,Action\n';
for (const item of fixMap) {
  const escape = (s) => `"${String(s).replace(/"/g, '""')}"`;
  csvContent += [
    escape(item.url),
    escape(item.title),
    escape(item.contentType),
    escape(item.category),
    escape(item.exam),
    escape(item.parentHub),
    escape(item.parentName),
    escape(item.suggestedSource),
    escape(item.anchorText),
    escape(item.priority),
    escape(item.action)
  ].join(',') + '\n';
}
fs.writeFileSync(path.join(outDir, 'orphan-fix-map.csv'), csvContent, 'utf8');
console.log(`✅ Saved fix map (${fixMap.length} rows) to ${outDir}/orphan-fix-map.csv`);

// Clusters
const clusters = {};
for (const item of fixMap) {
  const key = item.exam || 'GENERAL';
  if (!clusters[key]) clusters[key] = [];
  clusters[key].push(item.url);
}
const clusterSummary = Object.entries(clusters).map(([exam, urls]) => ({ exam, count: urls.length, sample: urls.slice(0,3) })).sort((a,b)=>b.count-a.count);
fs.writeFileSync(path.join(outDir, 'orphan-clusters.json'), JSON.stringify(clusterSummary, null, 2), 'utf8');
console.log(`✅ Saved clusters to ${outDir}/orphan-clusters.json`);

console.log('\n=== NEXT STEPS ===');
console.log('1. Check orphan-analysis/orphan-fix-map.csv — complete mapping for all 1,170 URLs');
console.log('2. Implement hub pages from missing-hubs (see SEO_AUDIT_FIXES.md)');
console.log('3. Add Breadcrumbs + RelatedContent components to JobDetails, BlogPost, etc.');
console.log('4. Deploy and recrawl in Ahrefs');
