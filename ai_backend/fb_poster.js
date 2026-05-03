const PAGE_ID = process.env.FB_PAGE_ID;
const PAGE_TOKEN = process.env.FB_PAGE_TOKEN;

async function postToFacebook(message, linkUrl) {
    if (!PAGE_ID || !PAGE_TOKEN) {
        console.error("Error: FB_PAGE_ID ya FB_PAGE_TOKEN set nahi hai.");
        return;
    }

    const url = `https://graph.facebook.com/v19.0/${PAGE_ID}/feed`;
    const payload = {
        message: message,
        link: linkUrl,
        access_token: PAGE_TOKEN
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.id) {
            console.log("Post successful! Post ID: " + data.id);
        } else {
            console.error("Post failed: ", data);
        }
    } catch (error) {
        console.error("Error: ", error);
    }
}

// Test karne ke liye
const message = "StudyGyaan par naya update aaya hai! Abhi check karein.";
const linkUrl = "https://studygyaan.in";

postToFacebook(message, linkUrl);