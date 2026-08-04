const { google } = require('googleapis');
const fs = require('fs');
const readline = require('readline');

const TOKEN_PATH = './token.json';
const CREDENTIALS_PATH = './credentials.json';

const SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.force-ssl'
];

if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.log('❌ Error: credentials.json फाइल नहीं मिली!');
    console.log('कृपया ai_backend फोल्डर में credentials.json नाम की एक नई फाइल बनाएं और उसमें अपना Google Cloud का Client Secret JSON पेस्ट करें।');
    process.exit(1);
}

const credentialsJSON = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
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
        oAuth2Client.getToken(decodeURIComponent(code.trim()), (err, token) => {
            if (err) return console.error('❌ Token Error:', err);
            oAuth2Client.setCredentials(token);
            
            // टोकन को फाइल में सेव करें और कंसोल में भी दिखाएं
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
            console.log('\n✅ Token बन गया! नीचे दिए गए JSON को कॉपी करें और GitHub Secrets में YOUTUBE_TOKEN की जगह डाल दें:\n');
            console.log(JSON.stringify(token, null, 2));
        });
    });
}