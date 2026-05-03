require("dotenv").config();
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

// ✅ GitHub Secrets से Service Account JSON उठाना
if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    if (serviceAccountVar) {
        const serviceAccount = JSON.parse(serviceAccountVar);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: "studymaterial-406ad"
        });
    } else {
        admin.initializeApp();
    }
}
const db = admin.firestore();

// 🛠️ मास्टर फंक्शन
async function createStoryFromOldest(collectionName, storyType) {
    try {
        console.log(`Checking for pending ${collectionName} to create a story...`);

        const snapshot = await db.collection(collectionName)
            .where("isStoryCreated", "==", false)
            .orderBy("createdAt", "asc") 
            .limit(1)
            .get();

        if (snapshot.empty) {
            console.log(`No pending ${collectionName} found for stories.`);
            return null;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();

        let finalTitle = data.title || "New Update";
        if (storyType === 'mocktest' && !data.title) {
            finalTitle = data.testName || "New Mock Test";
        }

        // 🔥 मास्टर फिक्स: मॉक टेस्ट के लिए '/test/' लिंक
        const path = storyType === 'mocktest' ? 'test' : 'blog';
        const applyLink = `https://studygyaan.in/${path}/${doc.id}`;

        const storyRef = await db.collection("web_stories").add({
            title: finalTitle,
            coverImage: data.imageUrl || data.image || data.thumbnail || "https://studygyaan.in/og-image.jpg",
            applyLink: applyLink,
            organization: data.organization || "StudyGyaan",
            vacancies: data.vacancies || "Check Now",
            lastDate: data.lastDate || "Apply Fast",
            category: data.category || "Education",
            author: data.author || "Rahul Sir",
            storyType: storyType, 
            questions: data.totalQuestions || "50",
            duration: data.durationMinutes || "30",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await db.collection(collectionName).doc(doc.id).update({
            isStoryCreated: true
        });

        console.log(`✅ Story created for ${collectionName} ID: ${doc.id}`);
        return storyRef.id;

    } catch (error) {
        console.error(`❌ Error in auto-story for ${collectionName}:`, error.message);
    }
}

// ==========================================
// ⏰ शेड्यूलर: 12:00 PM (BLOG STORY)
// ==========================================
exports.scheduledBlogStoryNoon = onSchedule({
    schedule: "0 12 * * *", 
    timeZone: "Asia/Kolkata",
    memory: "512MiB",
    secrets: ["SERVICE_ACCOUNT_JSON"] // ✅ Secret access ensure kiya
}, async () => {
    await createStoryFromOldest('blogs', 'blog');
});

// ==========================================
// ⏰ शेड्यूलर: 9:00 PM (BLOG STORY)
// ==========================================
exports.scheduledBlogStoryNight = onSchedule({
    schedule: "0 21 * * *", 
    timeZone: "Asia/Kolkata",
    memory: "512MiB",
    secrets: ["SERVICE_ACCOUNT_JSON"] // ✅ Secret access ensure kiya
}, async () => {
    await createStoryFromOldest('blogs', 'blog');
});

// ==========================================
// ⏰ शेड्यूलर: सुबह 10:00 AM (MOCK TEST STORY)
// ==========================================
exports.scheduledMockStoryMorning = onSchedule({
    schedule: "0 10 * * *", 
    timeZone: "Asia/Kolkata",
    memory: "512MiB",
    secrets: ["SERVICE_ACCOUNT_JSON"] // ✅ Secret access ensure kiya
}, async () => {
    await createStoryFromOldest('mock_tests', 'mocktest'); 
});