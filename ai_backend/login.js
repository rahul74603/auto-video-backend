const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];
const TOKEN_PATH = 'token.json';

fs.readFile('credentials.json', (err, content) => {
    if (err) return console.log('❌ Error loading credentials file:', err);
    authorize(JSON.parse(content));
});

function authorize(credentials) {
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
    console.log('🔗 इस लिंक को ब्राउज़र में खोलो और लॉगिन करो: \n', authUrl);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('🔑 वहाँ से मिला "Authorization Code" यहाँ पेस्ट करो: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('❌ Error retrieving access token', err);
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) return console.error(err);
                console.log('✅ मुबारक हो! token.json बन गई है।');
            });
        });
    });
}