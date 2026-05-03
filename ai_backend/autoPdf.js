require("dotenv").config();
const admin = require("firebase-admin");
const puppeteer = require("puppeteer");
const { GoogleGenerativeAI } = require("@google/generative-ai"); // ✅ Free SDK

// 🔥 STEP 1: Firebase Initialization with Secrets
if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    const config = {
        projectId: "studymaterial-406ad",
        storageBucket: "studymaterial-406ad.firebasestorage.app" // ✅ सही बकेट नेम
    };

    if (serviceAccountVar && serviceAccountVar !== "undefined") {
        try {
            const serviceAccount = JSON.parse(serviceAccountVar);
            admin.initializeApp({
                ...config,
                credential: admin.credential.cert(serviceAccount)
            });
        } catch (e) {
            console.error("❌ JSON Parse Error in autoPdf:", e.message);
            admin.initializeApp(config);
        }
    } else {
        admin.initializeApp(config);
    }
}

const db = admin.firestore();
// ✅ सीधा बकेट का नाम पास किया गया है ताकि क्रैश न हो
const bucket = admin.storage().bucket("studymaterial-406ad.firebasestorage.app");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * @param {Object} postData - The job/exam data from Firestore
 * @returns {Promise<string|null>} - The public URL of the generated PDF
 */
async function generateSyllabusPDF(postData) {
    console.log(`📄 PDF Generation Started for: ${postData.title}`);

    try {
        // 1. ✅ AI से सिलेबस लिखवाना (Free Gemini API)
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash-lite",
            generationConfig: { responseMimeType: "text/plain" }
        });

        const prompt = `
        Act as an expert Sarkari Job Educator. Write a detailed Exam Pattern and Syllabus for "${postData.title}".
        Requirements:
        1. Give the output STRICTLY in HTML format (only the body content, no <html> or <head> tags).
        2. Use <h2> and <h3> for headings.
        3. Create a clean HTML <table> for the Exam Pattern (Subjects, Questions, Marks, Time).
        4. Use bullet points <ul> and <li> for the detailed syllabus of each subject.
        5. Do NOT include markdown formatting like \`\`\`html. Just return pure HTML code.
        `;

        const aiResult = await model.generateContent(prompt);
        let syllabusHTML = aiResult.response.text(); 
        
        // एक्स्ट्रा क्लीनिंग अगर AI ```html जोड़ दे
        syllabusHTML = syllabusHTML.replace(/```html|```/g, "").trim();

        if (!syllabusHTML) throw new Error("AI failed to generate syllabus.");

        // 2. ✅ StudyGyaan की ब्रांडिंग के साथ HTML डिज़ाइन
        const fullHTML = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; line-height: 1.6; }
                .header { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
                .header h1 { color: #2563eb; margin: 0; font-size: 36px; text-transform: uppercase; font-weight: 900; }
                .header p { color: #64748b; font-size: 14px; margin-top: 5px; font-weight: bold; }
                h2 { color: #1e40af; border-bottom: 2px dashed #bfdbfe; padding-bottom: 8px; margin-top: 30px; }
                h3 { color: #3b82f6; margin-top: 20px; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
                th, td { border: 1px solid #cbd5e1; padding: 12px; text-align: left; }
                th { background-color: #eff6ff; color: #1e40af; font-weight: bold; }
                tr:nth-child(even) { background-color: #f8fafc; }
                ul { margin-top: 10px; }
                li { margin-bottom: 8px; }
                .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; }
                .watermark { position: fixed; top: 40%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 80px; color: rgba(37, 99, 235, 0.05); z-index: -1; font-weight: 900; white-space: nowrap; }
            </style>
        </head>
        <body>
            <div class="watermark">StudyGyaan.in</div>
            <div class="header">
                <h1>StudyGyaan.in</h1>
                <p>India's Fastest Update Portal for Sarkari Jobs</p>
                <h2 style="color: #0f172a; border: none; margin-top: 10px;">${postData.title} - Complete Syllabus & Pattern</h2>
            </div>
            <div class="content">
                ${syllabusHTML}
            </div>
            <div class="footer">
                <p>⚠️ Disclaimer: This syllabus is for reference purposes based on official notifications.</p>
                <p><strong>Downloaded from www.studygyaan.in</strong> | Join our Telegram: @studygyaan_official</p>
            </div>
        </body>
        </html>
        `;

        // 3. ✅ Puppeteer से PDF जनरेट करना
        const browser = await puppeteer.launch({ 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        await page.setContent(fullHTML, { waitUntil: 'networkidle0' });
        
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
        });
        await browser.close();

        // 4. ✅ Firebase Storage में अपलोड
        const fileName = `syllabus/${postData.title.replace(/[^a-zA-Z0-9]/g, "_")}_Syllabus.pdf`;
        const file = bucket.file(fileName);
        
        await file.save(pdfBuffer, {
            metadata: { contentType: 'application/pdf' },
            public: true 
        });

        const downloadURL = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        console.log(`✅ PDF Generated & Uploaded! Link: ${downloadURL}`);

        return downloadURL;

    } catch (error) {
        console.error("❌ Auto-PDF Error:", error.message);
        return null;
    }
}

// ✅ Export (fast_track_updates.js के लिए)
module.exports = { generateSyllabusPDF };
