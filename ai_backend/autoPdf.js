require("dotenv").config();
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const puppeteer = require("puppeteer");

// 🔥 STEP 1: Firebase Initialization
if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    const config = {
        projectId: "studymaterial-406ad",
        storageBucket: "studymaterial-406ad.firebasestorage.app"
    };

    if (serviceAccountVar && serviceAccountVar !== "undefined") {
        try {
            const serviceAccount = JSON.parse(serviceAccountVar);
            admin.initializeApp({
                ...config,
                credential: admin.credential.cert(serviceAccount)
            });
        } catch (e) {
            console.error("❌ JSON Parse Error:", e.message);
            admin.initializeApp(config);
        }
    } else {
        admin.initializeApp(config);
    }
}

const db = admin.firestore();
const bucket = admin.storage().bucket("studymaterial-406ad.firebasestorage.app");

// ✅ API Key Check
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("❌ CRITICAL: GEMINI_API_KEY is missing!");
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);

// 📄 PDF GENERATOR ENGINE
async function generateSyllabusPDF(postData) {
    console.log(`📄 PDF Generation Started for: ${postData.title}`);

    try {
        // 1. AI से सिलेबस जनरेट करना
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
        const prompt = `Act as an expert Sarkari Job Educator. Write a detailed Exam Pattern and Syllabus for "${postData.title}". Output STRICTLY in clean HTML. Use <table> for Exam Pattern and <ul> for syllabus. No markdown.`;
        
        const aiResult = await model.generateContent(prompt);
        let syllabusHTML = aiResult.response.text().replace(/```html|```/g, "").trim();

        if (!syllabusHTML) throw new Error("AI failed to generate syllabus.");

        // 2. HTML डिज़ाइन
        const fullHTML = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: sans-serif; padding: 40px; color: #333; line-height: 1.6; }
                .header { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 20px; }
                h1 { color: #2563eb; font-size: 30px; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { border: 1px solid #ccc; padding: 12px; text-align: left; }
                th { background-color: #eff6ff; }
                .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>StudyGyaan: ${postData.title}</h1>
                <p>India's Fastest Update Portal | www.studygyaan.in</p>
            </div>
            ${syllabusHTML}
            <div class="footer">
                <p>Downloaded from www.studygyaan.in | Join Telegram: @studygyaan_official</p>
            </div>
        </body>
        </html>`;

        // 3. Puppeteer PDF Logic
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

        // 4. Upload to Firebase
        const fileName = `syllabus/${postData.title.replace(/[^a-zA-Z0-9]/g, "_")}_Syllabus.pdf`;
        const file = bucket.file(fileName);
        
        await file.save(pdfBuffer, { 
            metadata: { contentType: 'application/pdf' }, 
            public: true 
        });

        const downloadURL = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        console.log(`✅ PDF Success: ${downloadURL}`);
        return downloadURL;

    } catch (error) {
        console.error("❌ Auto-PDF Error:", error.message);
        return null;
    }
}

// 🚀 रन टेस्ट (टेस्टिंग के लिए)
async function runTest() {
    await generateSyllabusPDF({ title: "Railway_Group_D_2026" });
}
runTest();

module.exports = { generateSyllabusPDF };
