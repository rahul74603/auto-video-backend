// ============================================
// 📚 STUDYGYAAN PREMIUM CONTENT GENERATOR
// Version: 3.0 | Date: July 2026
// Author: StudyGyaan.in
// ============================================

require("dotenv").config();
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// ============================================
// 🔥 FIREBASE INITIALIZE
// ============================================
if (!admin.apps.length) {
  const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
  if (serviceAccountVar) {
    try {
      const serviceAccount = JSON.parse(serviceAccountVar);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: "studymaterial-406ad"
      });
      console.log("✅ Firebase initialized with Secrets");
    } catch (e) {
      admin.initializeApp();
      console.log("⚠️ Firebase initialized with Default (SA parse failed)");
    }
  } else {
    admin.initializeApp();
    console.log("✅ Firebase initialized with Default Auth");
  }
}

const db = admin.firestore();

// ============================================
// 🧩 VERTEX AI AGENT BUILDER (₹91,785 credit) — premium sets ko ground karne ke liye
// ============================================
// Is credit ka asli SKU Vertex AI Search / Agent Builder hai. Har premium set
// generate karte waqt hum Vertex AI Search se relevant source retrieve karte
// hain (billing = credit consume) aur usi se prompt ground karte hain —
// hallucination kam, quality behtar. Vertex configured na ho to gracefully skip
// (existing Gemini path bilkul waisa hi chalta hai).
const vvertex = require("./vertex/vertex_client");
const vvrag = require("./vertex/vertex_rag");
const vvledger = require("./vertex/vertex_credit_ledger");

/**
 * Topic ke liye Vertex AI Search se grounded source context retrieve karo.
 * @returns {Promise<{context:string, usedVertex:boolean, sourcesCount:number}>}
 */
async function retrieveGroundedContext(topic, exam) {
  if (!vvertex.isConfigured()) return { context: "", usedVertex: false, sourcesCount: 0 };
  try {
    const query = `${exam} ${topic} syllabus previous year questions answer`;
    const r = await vvrag.search({ query, pageSize: 6, returnExtractive: true });
    await vvledger.recordSpend("search", { ok: true, note: `premium set grounding: ${topic}` });
    const sources = (r.answers || []).map((a) => a.snippet || a.extractiveAnswer).filter(Boolean).slice(0, 6);
    if (!sources.length) return { context: "", usedVertex: false, sourcesCount: 0 };
    const context =
      "\n\n=== GROUNDED SOURCE MATERIAL (Vertex AI Search) — bas isi se facts lo, bahar ka mat likho ===\n" +
      sources.map((s, i) => `[${i + 1}] ${s}`).join("\n\n") +
      "\n=== END GROUNDED SOURCE ===";
    return { context, usedVertex: true, sourcesCount: sources.length };
  } catch (e) {
    console.warn("Vertex grounding retrieve failed (non-fatal):", e.message);
    return { context: "", usedVertex: false, sourcesCount: 0 };
  }
}

// ============================================
// 🏷️ STUDYGYAAN BRANDING CONSTANTS
// ============================================
const BRAND = {
  name: "StudyGyaan",
  website: "studygyaan.in",
  fullUrl: "https://studygyaan.in",
  contact: "6263396446",
  email: "contact@studygyaan.in",
  whatsapp: "https://wa.me/916263396446",
  copyright: `© ${new Date().getFullYear()} StudyGyaan.in | All Rights Reserved`,
  tagline: "India's Most Trusted Free Study Material Platform"
};

// ============================================
// 🎨 HTML BRANDING COMPONENTS
// ============================================
function getBrandingHTML() {
  return `
<div style="
  background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 50%, #4f46e5 100%);
  color: white;
  padding: 18px 24px;
  border-radius: 16px;
  margin-bottom: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  box-shadow: 0 4px 15px rgba(30, 58, 138, 0.3);
">
  <div>
    <div style="font-size: 22px; font-weight: 900; letter-spacing: 1px; text-shadow: 1px 1px 2px rgba(0,0,0,0.2);">
      📚 ${BRAND.name}.in
    </div>
    <div style="font-size: 11px; opacity: 0.85; margin-top: 4px; letter-spacing: 0.5px;">
      ${BRAND.tagline}
    </div>
  </div>
  <div style="text-align: right; font-size: 12px; opacity: 0.9; line-height: 1.6;">
    <div>📞 ${BRAND.contact}</div>
    <div>✉️ ${BRAND.email}</div>
    <div>🌐 ${BRAND.website}</div>
  </div>
</div>`;
}

function getFooterHTML(topic, exam, setNumber) {
  return `
<div style="
  background: linear-gradient(to bottom, #f8fafc, #f1f5f9);
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 20px 24px;
  margin-top: 28px;
  text-align: center;
  font-size: 12px;
  color: #64748b;
">
  <div style="font-weight: 900; color: #1e3a8a; font-size: 16px; margin-bottom: 8px;">
    📚 ${BRAND.name}.in
  </div>
  <div style="margin-bottom: 6px; font-weight: 600; color: #475569;">
    ${topic} - Practice Set ${setNumber} | ${exam} Preparation
  </div>
  <div style="margin-bottom: 8px; color: #64748b;">
    📞 ${BRAND.contact} &nbsp;|&nbsp; ✉️ ${BRAND.email} &nbsp;|&nbsp; 🌐 ${BRAND.website}
  </div>
  <div style="
    display: flex;
    justify-content: center;
    gap: 12px;
    margin: 12px 0;
    flex-wrap: wrap;
  ">
    <span style="background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600;">📱 Free App Download</span>
    <span style="background: #dcfce7; color: #166534; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600;">📝 Daily Practice Sets</span>
    <span style="background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600;">🎯 Free Mock Tests</span>
  </div>
  <div style="
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid #e2e8f0;
    font-size: 10px;
    color: #94a3b8;
  ">
    ${BRAND.copyright} | Unauthorized reproduction prohibited.
  </div>
</div>`;
}

function getWatermarkHTML() {
  return `
<div style="
  position: relative;
  text-align: center;
  margin: 8px 0;
  padding: 6px;
  opacity: 0.15;
  font-size: 28px;
  font-weight: 900;
  color: #1e3a8a;
  letter-spacing: 4px;
  pointer-events: none;
  user-select: none;
">
  ${BRAND.name}.in
</div>`;
}

// ============================================
// 🔍 SEO METADATA GENERATOR (Full SEO)
// ============================================
function generateSEO(topic, exam, subject, setNumber, subjectType) {
  // URL Slug
  const slug = `${exam}-${subject}-${topic}-practice-set-${setNumber}`
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 100);

  // Meta Title (60 chars optimized)
  const metaTitle = `${topic} MCQ Practice Set ${setNumber} | ${exam} 2026 | ${BRAND.name}`;

  // Meta Description (155 chars optimized)
  const metaDescription = `${exam} 2026 के लिए ${topic} के ${setNumber} MCQ Practice Set। ` +
    `25 Questions with Answers, Formula & Solutions। Hindi + English। ${BRAND.website}`;

  // Focus Keywords
  const keywords = [
    topic,
    `${topic} questions`,
    `${topic} mcq`,
    `${topic} mcq in hindi`,
    `${exam} ${topic}`,
    `${topic} practice set`,
    `${topic} quiz`,
    `${exam} preparation 2026`,
    `${topic} notes in hindi`,
    `${topic} formula`,
    `${topic} tricks`,
    `${topic} pdf`,
    `${topic} ${exam} previous year`,
    `${BRAND.name} ${topic}`,
    `free study material ${exam}`,
    `${exam} mock test`,
    `${topic} questions with answers`,
    `${subject} ${exam} preparation`
  ];

  // H2 Tags for internal SEO
  const h2Tags = [
    `${topic} - Important Concepts & Formulas`,
    `${topic} Practice Questions for ${exam}`,
    `${topic} Step-by-Step Solutions`,
    `${topic} Tips & Tricks for ${exam}`,
    `${topic} Previous Year Pattern Questions`
  ];

  // Open Graph
  const ogTitle = `${topic} - ${exam} Practice Set ${setNumber} | ${BRAND.name}`;
  const ogDescription = `Free ${topic} MCQ Practice Set for ${exam}. 25 Questions with detailed solutions in Hindi & English.`;

  // JSON-LD Schema (Google Rich Results)
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Quiz",
    "name": metaTitle,
    "description": metaDescription,
    "url": `${BRAND.fullUrl}/notes/${slug}`,
    "provider": {
      "@type": "Organization",
      "name": BRAND.name,
      "url": BRAND.fullUrl,
      "logo": `${BRAND.fullUrl}/logo.png`,
      "contactPoint": {
        "@type": "ContactPoint",
        "telephone": `+91${BRAND.contact}`,
        "email": BRAND.email,
        "contactType": "customer service"
      },
      "sameAs": [
        "https://www.youtube.com/@StudyGyaan",
        "https://www.facebook.com/StudyGyaan",
        "https://t.me/StudyGyaan"
      ]
    },
    "educationalLevel": "competitive exam",
    "about": {
      "@type": "Thing",
      "name": topic
    },
    "teaches": subject,
    "assesses": topic,
    "numberOfQuestions": 25,
    "educationalAlignment": {
      "@type": "AlignmentObject",
      "targetName": exam,
      "educationalFramework": "Indian Competitive Exams"
    },
    "inLanguage": ["hi", "en"],
    "audience": {
      "@type": "EducationalAudience",
      "educationalRole": "student",
      "audienceType": `${exam} aspirants`
    },
    "keywords": keywords.join(", "),
    "dateCreated": new Date().toISOString(),
    "dateModified": new Date().toISOString(),
    "creator": {
      "@type": "Organization",
      "name": BRAND.name
    },
    "license": `${BRAND.fullUrl}/terms`,
    "isAccessibleForFree": true,
    "hasPart": {
      "@type": "WebPageElement",
      "cssSelector": ".practice-questions",
      "name": `${topic} Questions`
    }
  });

  // Canonical URL
  const canonicalUrl = `${BRAND.fullUrl}/notes/${slug}`;

  // Breadcrumb Schema
  const breadcrumbSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": BRAND.fullUrl
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": exam,
        "item": `${BRAND.fullUrl}/exam/${exam.toLowerCase().replace(/\s+/g, '-')}`
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": subject,
        "item": `${BRAND.fullUrl}/subject/${subject.toLowerCase().replace(/\s+/g, '-')}`
      },
      {
        "@type": "ListItem",
        "position": 4,
        "name": `${topic} Set ${setNumber}`,
        "item": canonicalUrl
      }
    ]
  });

  // FAQ Schema (for Google FAQ rich results)
  const faqSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": `${topic} ${exam} में कितने questions आते हैं?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `${exam} में ${topic} से typically 3-5 questions पूछे जाते हैं। इस practice set में 25 questions हैं जो exam pattern के अनुसार हैं।`
        }
      },
      {
        "@type": "Question",
        "name": `${topic} की preparation कैसे करें?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `${topic} की तैयारी के लिए ${BRAND.name}.in पर free practice sets, formulas और tricks उपलब्ध हैं। रोज़ 1 practice set solve करें।`
        }
      }
    ]
  });

  return {
    metaTitle,
    metaDescription,
    keywords,
    h2Tags,
    ogTitle,
    ogDescription,
    schema,
    breadcrumbSchema,
    faqSchema,
    slug,
    canonicalUrl
  };
}

// ============================================
// 🧠 DETECT SUBJECT TYPE (Enhanced)
// ============================================
function detectSubjectType(topic, subject) {
  const mathKeywords = [
    "math", "mathematics", "गणित", "algebra", "geometry",
    "trigonometry", "arithmetic", "percentage", "profit", "loss",
    "speed", "distance", "time", "ratio", "proportion", "average",
    "number system", "simplification", "mensuration", "hcf", "lcm",
    "data interpretation", "statistics", "probability", "permutation",
    "combination", "interest", "simple interest", "compound interest",
    "work", "pipe", "cistern", "boat", "stream", "train", "age",
    "mixture", "alligation", "discount", "height", "trigonometry",
    "coordinate", "quadratic", "linear equation", "surds", "indices"
  ];

  const reasoningKeywords = [
    "reasoning", "तर्क", "analogy", "series", "coding", "decoding",
    "blood relation", "direction", "puzzle", "syllogism", "ranking",
    "seating", "arrangement", "classification", "logical", "venn diagram",
    "inequality", "statement", "assumption", "conclusion", "assertion",
    "calendar", "clock", "mirror image", "water image", "embedded",
    "figure", "pattern", "dice", "cube", "counting", "missing number",
    "paper cutting", "paper folding", "matrix", "order ranking",
    "alphabet", "word formation", "mathematical operations"
  ];

  const combined = `${topic} ${subject}`.toLowerCase();
  if (mathKeywords.some(k => combined.includes(k))) return "math";
  if (reasoningKeywords.some(k => combined.includes(k))) return "reasoning";
  return "gk";
}

// ============================================
// 🎯 MASTER PROMPT BUILDER
// ============================================
function buildPrompt(topic, exam, subject, subjectType, currentSet, previousContent) {
  const isMathOrReasoning = subjectType === "math" || subjectType === "reasoning";
  const isReasoning = subjectType === "reasoning";
  const isMath = subjectType === "math";

  // Subject specific instructions
  let subjectInstructions = '';

  if (isMath) {
    subjectInstructions = `
📐 MATH SPECIFIC RULES:
━━━━━━━━━━━━━━━━━━━━━━━━
- हर question में calculation involved हो
- Formula clearly mention करो
- Step-by-step solution दो (max 5 steps)
- Numbers realistic हों (exam level)
- Shortcut trick भी बताओ (अगर available हो)
- Units (km/h, m/s, Rs., %, etc.) correct हों
- Decimal answers avoid करो (clean numbers दो)
- Difficulty: 30% Easy, 40% Medium, 30% Hard`;
  }

  if (isReasoning) {
    subjectInstructions = `
🧠 REASONING SPECIFIC RULES:
━━━━━━━━━━━━━━━━━━━━━━━━
- Questions clear + crisp (max 40 words)
- NO complex/circular logic
- Explanation max 80 words (STRICT!)
- Use clear step-by-step approach
- Pattern/Rule clearly explain करो

For Blood Relations:
  → Use symbols: Father(♂), Mother(♀), Son(♂), Daughter(♀)
  → Max 3-4 people in one question
  → Relationships direct हों (no 4-5 layers deep)
  → Solution: Draw family tree → Find relation

For Series/Pattern:
  → Pattern clearly visible हो
  → Rule simple and one-step
  → Common patterns: +2, ×2, squares, cubes, alternate

For Coding-Decoding:
  → One clear rule per question
  → Alphabetical shift, reverse, mirror etc.
  → Example: A=Z, B=Y (mirror coding)

For Direction:
  → Max 4-5 turns
  → Final direction + distance clearly state करो
  → Use: N/S/E/W format

For Syllogism:
  → 2 statements, 2 conclusions format
  → Use Venn diagram logic in explanation`;
  }

  return `
You are a PREMIUM Question Paper Setter for ${BRAND.name}.in
Your content quality should match TOP coaching institutes like Kiran, Paramount, Pinnacle.

═══════════════════════════════════════════════
📋 ASSIGNMENT
═══════════════════════════════════════════════
Topic: "${topic}"
Subject: ${subject}
Exam: ${exam}
Set Number: ${currentSet}
Subject Type: ${subjectType.toUpperCase()}

═══════════════════════════════════════════════
🎯 QUALITY STANDARDS (CRITICAL!)
═══════════════════════════════════════════════

1️⃣ QUESTION QUALITY:
   ✅ Real ${exam} exam pattern
   ✅ Clear, unambiguous language
   ✅ Max 40 words per question
   ✅ No trick questions with multiple possible answers
   ✅ Each question tests a DIFFERENT concept
   ✅ Progressive difficulty: Q1-8 Easy, Q9-18 Medium, Q19-25 Hard

2️⃣ OPTION QUALITY:
   ✅ All 4 options must be plausible
   ✅ No obviously wrong options
   ✅ Options in logical order (ascending for numbers)
   ✅ SMART FORMAT:
      - Numerical (23, 45, 60%) → Single language only
      - Text (Delhi, Father) → Both English / हिंदी
      - Mixed (5 boys) → Both English / हिंदी

3️⃣ EXPLANATION QUALITY:
   ✅ MAXIMUM 80 words (STRICT LIMIT!)
   ✅ 3-5 clear bullet steps
   ✅ Start with "Given:" or "दिया:" 
   ✅ End with clear answer statement
   ✅ NO rambling, NO repetition
   ✅ NO "let me reconsider" or "wait"
   ✅ Direct → Logical → Answer

4️⃣ BILINGUAL FORMAT:
   ✅ Question: English first, then Hindi (italic)
   ✅ Options: Smart (numbers=single, text=both)
   ✅ Explanation: English bullet points + Hindi translation
   ✅ Hindi in proper Devanagari Unicode

${subjectInstructions}

═══════════════════════════════════════════════
🎨 EXACT HTML TEMPLATE
═══════════════════════════════════════════════

Generate EXACTLY this HTML structure:

${isMathOrReasoning ? `
<!-- ════════ SECTION 1: FORMULAS/RULES ════════ -->
<div style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border:2px solid #3b82f6;border-radius:16px;padding:24px;margin-bottom:24px;">
<h2 style="color:#1d4ed8;font-size:20px;font-weight:900;margin:0 0 16px 0;padding-bottom:10px;border-bottom:2px solid #93c5fd;display:flex;align-items:center;gap:8px;">
  ${isMath ? '📐 Important Formulas / महत्वपूर्ण सूत्र' : '🎯 Key Rules & Tricks / मुख्य नियम और ट्रिक्स'}
</h2>
<div style="display:grid;gap:12px;">

  <div style="background:white;border-radius:10px;padding:14px;border-left:4px solid #3b82f6;">
    <div style="font-weight:800;color:#1e40af;font-size:14px;margin-bottom:4px;">
      📌 [Rule/Formula Name] / [नियम/सूत्र का नाम]
    </div>
    <div style="font-size:14px;color:#334155;margin-bottom:4px;">
      [Formula or Rule in English]
    </div>
    <div style="font-size:13px;color:#64748b;font-style:italic;">
      [सूत्र या नियम हिंदी में]
    </div>
    <div style="font-size:12px;color:#059669;margin-top:4px;">
      💡 Trick: [Short trick to remember] / [याद रखने का तरीका]
    </div>
  </div>

  [Add 4-5 more formulas/rules in same format]

</div>
</div>
` : ''}

<!-- ════════ SECTION 2: QUESTIONS ════════ -->
<div style="margin-bottom:24px;">
<h2 style="background:linear-gradient(135deg,#1e3a8a,#4f46e5,#7c3aed);color:white;padding:16px 24px;border-radius:14px;margin:0 0 20px 0;font-size:20px;font-weight:900;display:flex;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(30,58,138,0.3);">
  📝 Practice Questions / अभ्यास प्रश्न
  <span style="margin-left:auto;font-size:13px;opacity:0.85;font-weight:500;">Set ${currentSet} | 25 Qs</span>
</h2>

<!-- ★ QUESTION CARD (Repeat for Q.1 to Q.25) ★ -->
<div style="background:white;border:1px solid #e2e8f0;border-radius:14px;padding:20px;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,0.04);transition:all 0.2s;">

  <!-- Question Header -->
  <div style="display:flex;gap:12px;margin-bottom:14px;align-items:flex-start;">
    <span style="background:linear-gradient(135deg,#1e3a8a,#3730a3);color:white;padding:8px 14px;border-radius:10px;font-weight:900;font-size:14px;min-width:48px;text-align:center;box-shadow:0 2px 6px rgba(30,58,138,0.3);">Q.1</span>
    <div style="flex:1;">
      <p style="margin:0 0 6px 0;font-weight:700;color:#1f2937;font-size:15px;line-height:1.5;">
        [Clear question in English - max 40 words]
      </p>
      <p style="margin:0;color:#6b7280;font-size:13px;font-style:italic;line-height:1.4;">
        [स्पष्ट प्रश्न हिंदी में]
      </p>
    </div>
  </div>

  <!-- Options Grid -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0;">
    <div style="padding:11px 14px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;font-size:14px;cursor:pointer;">
      <b style="color:#1e3a8a;margin-right:6px;">A)</b> [Option A]
    </div>
    <div style="padding:11px 14px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;font-size:14px;cursor:pointer;">
      <b style="color:#1e3a8a;margin-right:6px;">B)</b> [Option B]
    </div>
    <div style="padding:11px 14px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;font-size:14px;cursor:pointer;">
      <b style="color:#1e3a8a;margin-right:6px;">C)</b> [Option C]
    </div>
    <div style="padding:11px 14px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;font-size:14px;cursor:pointer;">
      <b style="color:#1e3a8a;margin-right:6px;">D)</b> [Option D]
    </div>
  </div>

  <!-- Answer & Explanation Box -->
  <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-left:4px solid #22c55e;padding:14px 16px;border-radius:0 10px 10px 0;margin-top:12px;">
    <p style="margin:0 0 8px 0;font-size:14px;font-weight:900;color:#15803d;display:flex;align-items:center;gap:6px;">
      ✅ Answer: [B] / उत्तर: [B]
    </p>
    <div style="font-size:13px;color:#166534;line-height:1.6;">
      <b>Solution:</b><br>
      • Step 1: [First clear step]<br>
      • Step 2: [Second step]<br>
      • Step 3: [Final answer with conclusion]
    </div>
    <div style="font-size:13px;color:#166534;font-style:italic;line-height:1.6;margin-top:6px;padding-top:6px;border-top:1px dashed #86efac;">
      <b>हल:</b><br>
      • चरण 1: [पहला चरण]<br>
      • चरण 2: [दूसरा चरण]<br>
      • चरण 3: [अंतिम उत्तर]
    </div>
  </div>

</div>
<!-- ★ END QUESTION CARD - Repeat Q.2 to Q.25 ★ -->

</div>

${isMathOrReasoning ? `
<!-- ════════ SECTION 3: QUICK REVISION ════════ -->
<div style="background:linear-gradient(135deg,#fefce8,#fef3c7);border:2px solid #f59e0b;border-radius:16px;padding:24px;margin-top:24px;">
<h2 style="color:#92400e;font-size:20px;font-weight:900;margin:0 0 16px 0;padding-bottom:10px;border-bottom:2px solid #fbbf24;display:flex;align-items:center;gap:8px;">
  ⚡ Quick Revision Points / त्वरित पुनरावलोकन
</h2>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;">
  <div style="background:white;padding:10px 14px;border-radius:8px;border-left:3px solid #f59e0b;">
    ✅ [Key point 1 English] / [मुख्य बिंदु 1 हिंदी]
  </div>
  <div style="background:white;padding:10px 14px;border-radius:8px;border-left:3px solid #f59e0b;">
    ✅ [Key point 2 English] / [मुख्य बिंदु 2 हिंदी]
  </div>
  [Add 6-8 revision points total]
</div>
</div>

<!-- ════════ SECTION 4: COMMON MISTAKES ════════ -->
<div style="background:linear-gradient(135deg,#fef2f2,#fee2e2);border:2px solid #ef4444;border-radius:16px;padding:24px;margin-top:20px;">
<h2 style="color:#991b1b;font-size:18px;font-weight:900;margin:0 0 14px 0;display:flex;align-items:center;gap:8px;">
  ⚠️ Common Mistakes / सामान्य गलतियाँ
</h2>
<div style="font-size:13px;line-height:1.8;">
  <p style="margin:6px 0;">❌ [Mistake 1] → ✅ [Correct approach] / [गलती] → [सही तरीका]</p>
  <p style="margin:6px 0;">❌ [Mistake 2] → ✅ [Correct approach] / [गलती] → [सही तरीका]</p>
  <p style="margin:6px 0;">❌ [Mistake 3] → ✅ [Correct approach] / [गलती] → [सही तरीका]</p>
</div>
</div>

<!-- ════════ SECTION 5: EXAM TIPS ════════ -->
<div style="background:linear-gradient(135deg,#f0f9ff,#e0f2fe);border:2px solid #0ea5e9;border-radius:16px;padding:24px;margin-top:20px;">
<h2 style="color:#0c4a6e;font-size:18px;font-weight:900;margin:0 0 14px 0;display:flex;align-items:center;gap:8px;">
  🎯 Exam Tips for ${exam} / परीक्षा टिप्स
</h2>
<div style="font-size:13px;line-height:1.8;">
  <p style="margin:6px 0;">💡 [Tip 1 for ${topic}] / [टिप 1]</p>
  <p style="margin:6px 0;">💡 [Tip 2 for ${topic}] / [टिप 2]</p>
  <p style="margin:6px 0;">💡 [Time management tip] / [समय प्रबंधन टिप]</p>
  <p style="margin:6px 0;">💡 [Accuracy tip] / [सटीकता टिप]</p>
</div>
</div>
` : ''}

═══════════════════════════════════════════════
🚫 STRICT AVOID LIST
═══════════════════════════════════════════════

NEVER DO THESE:
❌ Explanations longer than 80 words
❌ Circular logic or backtracking
❌ "Let me reconsider" or "Wait, actually"
❌ Multiple possible answers
❌ Ambiguous questions
❌ Copy-paste style repetitive content
❌ Wrong Hindi translations
❌ Mixed up answer keys
❌ Incomplete explanations
❌ Questions without clear answers

═══════════════════════════════════════════════
✅ FINAL CHECKLIST (Verify before output)
═══════════════════════════════════════════════

Before generating, verify EACH question:
☑️ Question is clear and unambiguous
☑️ Only ONE correct answer exists
☑️ All 4 options are distinct and plausible
☑️ Explanation is under 80 words
☑️ Steps are logical (no backtracking)
☑️ Hindi translation is accurate
☑️ No concept repetition with other questions
☑️ Matches ${exam} difficulty level
☑️ HTML tags are properly closed

═══════════════════════════════════════════════
📊 PREVIOUS SETS (DO NOT REPEAT)
═══════════════════════════════════════════════
${previousContent ? previousContent.substring(0, 2000) : "No previous content - this is the first set"}

═══════════════════════════════════════════════
📤 OUTPUT FORMAT
═══════════════════════════════════════════════

Return EXACTLY in this format (no deviation):

FILE_NAME:
${topic} - ${exam} Practice Set ${currentSet}

SEO_TITLE:
${topic} MCQ Practice Set ${currentSet} | ${exam} 2026 | ${BRAND.name}

CONTENT_HTML:
[Only clean inner HTML - no DOCTYPE, html, head, body tags]
[Follow the EXACT template structure above]
[All 25 questions with proper formatting]
`;
}

// ============================================
// 🤖 GEMINI API CALL (Direct REST - No SDK)
// ============================================
async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured in secrets");
  }

  console.log(`🔑 API Key: length=${apiKey.length}, prefix=${apiKey.substring(0, 6)}...`);

  // Try models in order of preference
  const modelsToTry = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-flash-latest"
  ];

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      console.log(`🤖 Trying model: ${model}`);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.65,
            maxOutputTokens: 32000,
            topP: 0.95,
            topK: 40
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ]
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`❌ Model ${model} failed (${response.status}):`, errText.substring(0, 150));
        lastError = new Error(`${model}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text || text.length < 500) {
        console.warn(`⚠️ Model ${model}: Response too short (${text?.length || 0} chars)`);
        lastError = new Error(`${model}: Response too short`);
        continue;
      }

      console.log(`✅ Model ${model} succeeded (${text.length} chars)`);
      return { text, model };

    } catch (err) {
      console.warn(`❌ Model ${model} exception:`, err.message);
      lastError = err;
    }
  }

  throw new Error(`All models failed. Last: ${lastError?.message}`);
}

// ============================================
// 🚀 MAIN CLOUD FUNCTION
// ============================================
exports.generatePremiumNote = onRequest(
  {
    cors: true,
    timeoutSeconds: 540,
    memory: "2GiB",
    secrets: ["SERVICE_ACCOUNT_JSON", "GEMINI_API_KEY"]
  },
  async (req, res) => {

    // CORS
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");

    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, error: "Method Not Allowed" });
    }

    const startTime = Date.now();

    // Parse Body
    let body = req.body || {};
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    // Extract params
    const topic      = body.topic;
    const packId     = body.packId;
    const folderId   = body.folderId || null;
    const currentSet = Number(body.setNumber) || 1;
    const exam       = body.exam || "SSC CGL";
    const subject    = body.subject || topic;

    // Validation
    if (!topic || !packId) {
      return res.status(400).json({
        success: false,
        error: "topic and packId are required"
      });
    }

    if (topic.length < 2 || topic.length > 200) {
      return res.status(400).json({
        success: false,
        error: "topic must be 2-200 characters"
      });
    }

    console.log(`\n${"═".repeat(50)}`);
    console.log(`📚 GENERATING: "${topic}" | ${exam} | Set ${currentSet}`);
    console.log(`📦 Pack: ${packId} | Folder: ${folderId || 'root'}`);
    console.log(`${"═".repeat(50)}\n`);

    try {
      // ===== STEP 1: FETCH PREVIOUS CONTENT =====
      console.log("📊 Step 1: Fetching previous sets...");

      const previousSnapshot = await db
        .collection("courses")
        .doc(packId)
        .collection("content")
        .where("topic", "==", topic)
        .orderBy("createdAt", "desc")
        .limit(5)
        .get();

      let previousContent = "";
      let existingSets = 0;

      previousSnapshot.forEach(docSnap => {
        existingSets++;
        const data = docSnap.data();
        if (data.content) {
          // Extract just question texts for anti-duplicate
          const questions = data.content.match(/Q\.\d+[\s\S]*?(?=Q\.\d+|$)/g) || [];
          questions.forEach(q => {
            const qText = q.replace(/<[^>]*>/g, '').substring(0, 100);
            previousContent += qText + "\n";
          });
        }
      });

      console.log(`📊 Found ${existingSets} existing sets for "${topic}"`);

      // ===== STEP 2: DETECT SUBJECT TYPE =====
      const subjectType = detectSubjectType(topic, subject);
      console.log(`📊 Step 2: Subject type = ${subjectType}`);

      // ===== STEP 3: BUILD PROMPT =====
      console.log("📝 Step 3: Building prompt...");
      const prompt = buildPrompt(
        topic, exam, subject,
        subjectType, currentSet, previousContent
      );

      // ===== STEP 4: GROUND + CALL GEMINI =====
      console.log("🤖 Step 4: Grounding via Vertex AI Search (₹91,785 credit) + generating...");
      // Har premium set pe Vertex AI Search retrieval → credit consume + grounded prompt.
      const { context: groundedContext, usedVertex, sourcesCount } = await retrieveGroundedContext(topic, exam);
      if (usedVertex) console.log(`🧩 Vertex grounding: ${sourcesCount} source(s) retrieved (credit consumed)`);
      const finalPrompt = usedVertex ? prompt + groundedContext : prompt;
      const { text: aiResponse, model: usedModel } = await callGemini(finalPrompt);

      // ===== STEP 5: EXTRACT CONTENT =====
      console.log("📄 Step 5: Extracting content...");

      const fileNameMatch = aiResponse.match(/FILE_NAME:\s*(.*)/);
      const seoTitleMatch = aiResponse.match(/SEO_TITLE:\s*(.*)/);
      const contentMatch  = aiResponse.match(/CONTENT_HTML:\s*([\s\S]*)/);

      if (!contentMatch) {
        console.error("❌ No CONTENT_HTML found. Response preview:");
        console.error(aiResponse.substring(0, 500));
        throw new Error("AI response format invalid - no CONTENT_HTML found");
      }

      const fileName = fileNameMatch
        ? fileNameMatch[1].trim()
        : `${topic} - ${exam} Practice Set ${currentSet}`;

      let contentHTML = contentMatch[1].trim();

      // ===== STEP 6: CLEAN HTML =====
      console.log("🧹 Step 6: Cleaning HTML...");

      contentHTML = contentHTML
        .replace(/^```html\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .replace(/<!DOCTYPE[^>]*>/gi, "")
        .replace(/<html[^>]*>/gi, "")
        .replace(/<\/html>/gi, "")
        .replace(/<body[^>]*>/gi, "")
        .replace(/<\/body>/gi, "")
        .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
        .replace(/FILE_NAME:.*$/gm, "")
        .replace(/SEO_TITLE:.*$/gm, "")
        .replace(/CONTENT_HTML:/g, "")
        .trim();

      // Validate content length
      if (contentHTML.length < 2000) {
        console.warn(`⚠️ Content short: ${contentHTML.length} chars`);
        throw new Error(`Content too short (${contentHTML.length} chars). Minimum 2000 required.`);
      }

      console.log(`✅ Content length: ${contentHTML.length} chars`);

      // ===== STEP 7: ADD BRANDING + WATERMARK =====
      console.log("🎨 Step 7: Adding branding...");

      const brandingTop = getBrandingHTML();
      const watermark = getWatermarkHTML();
      const brandingBottom = getFooterHTML(topic, exam, currentSet);

      // Insert watermark after every 8 questions approximately
      const finalHTML = `${brandingTop}\n${contentHTML}\n${watermark}\n${brandingBottom}`;

      // ===== STEP 8: GENERATE SEO =====
      console.log("🔍 Step 8: Generating SEO data...");

      const seo = generateSEO(topic, exam, subject, currentSet, subjectType);

      // ===== STEP 9: SAVE TO FIRESTORE =====
      console.log("💾 Step 9: Saving to Firestore...");

      const generationTime = Date.now() - startTime;

      const docData = {
        // Content
        title: fileName,
        type: "article",
        content: finalHTML,
        parentId: folderId,
        setNumber: currentSet,
        topic: topic,
        exam: exam,
        subject: subject,
        subjectType: subjectType,

        // SEO (Full)
        seoTitle: seo.metaTitle,
        seoDescription: seo.metaDescription,
        seoKeywords: seo.keywords,
        seoH2Tags: seo.h2Tags,
        seoOgTitle: seo.ogTitle,
        seoOgDescription: seo.ogDescription,
        seoSchema: seo.schema,
        seoBreadcrumbSchema: seo.breadcrumbSchema,
        seoFaqSchema: seo.faqSchema,
        seoSlug: seo.slug,
        seoCanonicalUrl: seo.canonicalUrl,

        // AI Metadata
        aiProvider: usedVertex ? "vertex-rag+gemini" : "gemini",
        aiModel: usedModel,
        vertexGrounded: usedVertex,
        generationTime: generationTime,
        contentLength: finalHTML.length,
        questionCount: 25,

        // Branding
        branding: {
          website: BRAND.website,
          contact: BRAND.contact,
          email: BRAND.email,
          watermark: BRAND.name
        },

        // Timestamps
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "published"
      };

      const docRef = await db
        .collection("courses")
        .doc(packId)
        .collection("content")
        .add(docData);

      // ===== STEP 10: LOG GENERATION =====
      console.log("📊 Step 10: Logging generation...");

      try {
        await db.collection("generation_logs").add({
          topic, exam, subject, subjectType,
          setNumber: currentSet,
          packId, folderId,
          docId: docRef.id,
          model: usedModel,
          generationTime,
          contentLength: finalHTML.length,
          success: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (logErr) {
        console.warn("⚠️ Log save failed:", logErr.message);
      }

      // ===== DONE =====
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`\n${"═".repeat(50)}`);
      console.log(`✅ SUCCESS!`);
      console.log(`📄 Doc: ${docRef.id}`);
      console.log(`🤖 Model: ${usedModel}`);
      console.log(`📊 Subject: ${subjectType}`);
      console.log(`📏 Length: ${finalHTML.length} chars`);
      console.log(`⏱️ Time: ${totalTime}s`);
      console.log(`${"═".repeat(50)}\n`);

      return res.json({
        success: true,
        id: docRef.id,
        provider: usedVertex ? "vertex-rag+gemini" : "gemini",
        model: usedModel,
        vertexGrounded: usedVertex,
        sourcesCount: sourcesCount,
        subjectType: subjectType,
        generationTime: totalTime + "s",
        contentLength: finalHTML.length,
        existingSets: existingSets,
        seo: {
          title: seo.metaTitle,
          description: seo.metaDescription,
          slug: seo.slug,
          url: seo.canonicalUrl,
          keywords: seo.keywords.length
        },
        message: "Premium Note Generated Successfully! 🎉"
      });

    } catch (err) {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

      console.error(`\n${"═".repeat(50)}`);
      console.error(`🔥 ERROR after ${totalTime}s`);
      console.error(`Error: ${err.message}`);
      console.error(`${"═".repeat(50)}\n`);

      // Log error
      try {
        await db.collection("generation_logs").add({
          topic, exam: body.exam, subject: body.subject,
          setNumber: Number(body.setNumber) || 1,
          packId, error: err.message,
          generationTime: Date.now() - startTime,
          success: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (logErr) {
        // Silent fail for logging
      }

      return res.status(500).json({
        success: false,
        error: err.message,
        time: totalTime + "s"
      });
    }
  }
);