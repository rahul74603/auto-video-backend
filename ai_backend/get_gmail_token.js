const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');

const credentials = JSON.parse(fs.readFileSync('credentials.json'));
const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

// सिर्फ Gmail पढ़ने की परमिशन
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
console.log('\n🚀 ब्राउज़र में खोलें:\n', authUrl);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('\n👉 Code पेस्ट करें: ', (code) => {
  rl.close();
  oAuth2Client.getToken(code, (err, token) => {
    if (err) return console.error('❌ Error:', err);
    console.log('\n👇 नया GMAIL_TOKEN:\n\n', JSON.stringify(token));
  });
});