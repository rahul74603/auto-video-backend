const { google } = require('googleapis');
const fs = require('fs');
const readline = require('readline');
require('dotenv').config();

// 🚨 SECURITY: अब हम सीधे Environment Variable से क्रेडेंशियल उठाएंगे
const credentialsJSON = process.env.GMAIL_CREDENTIALS;
const TOKEN_PATH = './token.json';

const SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.force-ssl'
];

if (!credentialsJSON) {
    console.log('❌ Error: GMAIL_CREDENTIALS Environment Variable नहीं मिला!');
    console.log('कृपया अपनी .env फाइल में GMAIL_CREDENTIALS नाम से अपनी JSON पेस्ट करें।');
    
}

// क्रेडेंशियल को पार्स करके ऑथराइज करें
authorize(JSON.parse(credentialsJSON));

function authorize(credentials) {
    const config = credentials.installed || credentials.web;
    const { client_secret, client_id, redirect_uris } = config;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent select_account' // Refresh Token और सही चैनल चुनने के लिए
    });

    console.log('\n🌐 1. इस लिंक को कॉपी करें और अपने ब्राउज़र में खोलें:');
    console.log(authUrl);
    console.log('\n');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question('🔑 2. ब्राउज़र से मिला "Code" यहाँ पेस्ट करें और Enter दबाएँ: ', (code) => {
        rl.close();
        oAuth2Client.getToken(decodeURIComponent(code), (err, token) => {
            if (err) return console.error('❌ Token Error:', err);
            oAuth2Client.setCredentials(token);
            
            // टोकन को फाइल में सेव करें और कंसोल में भी दिखाएं
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
            console.log('\n✅ Token बन गया! नीचे दिए गए JSON को कॉपी करें और GitHub Secrets में डाल दें:\n');
            console.log(JSON.stringify(token, null, 2));
        });
    });
}