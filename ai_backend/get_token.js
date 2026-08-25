const { google } = require('googleapis');
const fs = require('fs');
const readline = require('readline');
const crypto = require('crypto');

/*
|--------------------------------------------------------------------------
| Configuration
|--------------------------------------------------------------------------
*/

const TOKEN_PATH = './token.json';
const CREDENTIALS_PATH = './credentials.json';

/*
|--------------------------------------------------------------------------
| YouTube OAuth Scopes
|--------------------------------------------------------------------------
|
| Existing production permissions:
| - youtube.upload       -> upload/manage YouTube videos
| - youtube              -> manage YouTube account
| - youtube.force-ssl    -> manage videos/comments/captions etc.
|
| Growth engine permission:
| - yt-analytics.readonly -> read YouTube Analytics reports
|
| DO NOT add monetary scope unless revenue analytics is actually required.
|--------------------------------------------------------------------------
*/

const SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.force-ssl',
    'https://www.googleapis.com/auth/yt-analytics.readonly'
];

/*
|--------------------------------------------------------------------------
| Required Scopes
|--------------------------------------------------------------------------
*/

const REQUIRED_SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.force-ssl',
    'https://www.googleapis.com/auth/yt-analytics.readonly'
];

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function normalizeScopes(scopeValue) {
    if (!scopeValue) return [];

    if (Array.isArray(scopeValue)) {
        return scopeValue;
    }

    return String(scopeValue)
        .split(/\s+/)
        .map(scope => scope.trim())
        .filter(Boolean);
}

function getMissingScopes(grantedScopes) {
    return REQUIRED_SCOPES.filter(
        requiredScope => !grantedScopes.includes(requiredScope)
    );
}

function printGrantedScopes(grantedScopes) {
    console.log('\n==================================================');
    console.log('🔐 GRANTED YOUTUBE PERMISSIONS');
    console.log('==================================================\n');

    REQUIRED_SCOPES.forEach(scope => {
        const granted = grantedScopes.includes(scope);

        console.log(
            `${granted ? '✅' : '❌'} ${scope}`
        );
    });

    console.log('\n==================================================\n');
}

/*
|--------------------------------------------------------------------------
| Validate local files
|--------------------------------------------------------------------------
*/

if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('\n❌ Error: credentials.json नहीं मिली!\n');

    console.error(
        'कृपया ai_backend फोल्डर में credentials.json रखें।'
    );

    console.error(
        'इसमें Google Cloud OAuth Client Secret JSON होना चाहिए।\n'
    );

    process.exit(1);
}

/*
|--------------------------------------------------------------------------
| Read credentials
|--------------------------------------------------------------------------
*/

let credentialsJSON;

try {
    credentialsJSON = fs.readFileSync(
        CREDENTIALS_PATH,
        'utf8'
    );
} catch (error) {
    console.error('\n❌ credentials.json पढ़ी नहीं जा सकी।');
    console.error(error.message);
    process.exit(1);
}

let credentials;

try {
    credentials = JSON.parse(credentialsJSON);
} catch (error) {
    console.error('\n❌ credentials.json valid JSON नहीं है।');
    console.error(error.message);
    process.exit(1);
}

/*
|--------------------------------------------------------------------------
| Start OAuth
|--------------------------------------------------------------------------
*/

authorize(credentials);

function authorize(credentials) {
    const config = credentials.installed || credentials.web;

    if (!config) {
        console.error(
            '\n❌ credentials.json में "installed" या "web" OAuth configuration नहीं मिली।'
        );

        process.exit(1);
    }

    const {
        client_secret,
        client_id,
        redirect_uris
    } = config;

    if (!client_id || !client_secret) {
        console.error(
            '\n❌ client_id या client_secret missing है।'
        );

        process.exit(1);
    }

    if (!redirect_uris || !redirect_uris.length) {
        console.error(
            '\n❌ redirect_uris नहीं मिली।'
        );

        process.exit(1);
    }

    const redirectUri = redirect_uris[0];

    const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirectUri
    );

    /*
    |--------------------------------------------------------------------------
    | OAuth State
    |--------------------------------------------------------------------------
    |
    | State token helps protect the OAuth flow from unexpected callbacks.
    |
    */

    const state = crypto.randomBytes(24).toString('hex');

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',

        /*
        |--------------------------------------------------------------------------
        | Important
        |--------------------------------------------------------------------------
        |
        | Include previously granted scopes and request the complete set.
        |
        | This ensures the newly requested Analytics permission is included
        | while preserving the existing YouTube permissions.
        |
        */

        include_granted_scopes: true,

        scope: SCOPES,

        /*
        |--------------------------------------------------------------------------
        | Force consent
        |--------------------------------------------------------------------------
        |
        | Important when adding a new permission to an existing authorization.
        |
        */

        prompt: 'consent select_account',

        state
    });

    console.log('\n');
    console.log('==================================================');
    console.log('🚀 YOUTUBE OAUTH AUTHORIZATION');
    console.log('==================================================');

    console.log('\n🌐 STEP 1');
    console.log(
        'नीचे दिया गया पूरा URL browser में खोलें:\n'
    );

    console.log(authUrl);

    console.log('\n');
    console.log('==================================================');

    console.log('\n⚠️ IMPORTANT');
    console.log(
        'उसी Google account को select करें जिस YouTube channel पर आपका'
    );

    console.log(
        'auto-video system videos upload करता है।'
    );

    console.log('\n');
    console.log(
        'Google permission screen पर सभी requested permissions को Allow करें।'
    );

    console.log('\n');
    console.log('==================================================\n');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question(
        '🔑 STEP 2 — Browser से authorization code यहाँ paste करें और Enter दबाएँ:\n> ',
        async (code) => {
            rl.close();

            try {
                const cleanCode = decodeURIComponent(
                    code.trim()
                );

                if (!cleanCode) {
                    throw new Error(
                        'Authorization code खाली है।'
                    );
                }

                /*
                |--------------------------------------------------------------------------
                | Exchange authorization code for tokens
                |--------------------------------------------------------------------------
                */

                const { tokens } = await oAuth2Client.getToken(
                    cleanCode
                );

                if (!tokens) {
                    throw new Error(
                        'Google ने token response नहीं दिया।'
                    );
                }

                oAuth2Client.setCredentials(tokens);

                /*
                |--------------------------------------------------------------------------
                | Determine granted scopes
                |--------------------------------------------------------------------------
                */

                const grantedScopes = normalizeScopes(
                    tokens.scope
                );

                printGrantedScopes(grantedScopes);

                /*
                |--------------------------------------------------------------------------
                | Check missing permissions
                |--------------------------------------------------------------------------
                */

                const missingScopes = getMissingScopes(
                    grantedScopes
                );

                if (missingScopes.length > 0) {
                    console.error(
                        '\n⚠️ WARNING: कुछ required permissions grant नहीं हुईं:\n'
                    );

                    missingScopes.forEach(scope => {
                        console.error(`❌ ${scope}`);
                    });

                    console.error(
                        '\nGoogle authorization दोबारा करनी पड़ सकती है।'
                    );

                    console.error(
                        'जब तक Analytics permission grant नहीं होती,'
                    );

                    console.error(
                        'YouTube Analytics features काम नहीं करेंगी।\n'
                    );
                } else {
                    console.log(
                        '\n🎉 सभी required YouTube permissions successfully granted हैं!'
                    );
                }

                /*
                |--------------------------------------------------------------------------
                | Save token locally
                |--------------------------------------------------------------------------
                |
                | IMPORTANT:
                | token.json को GitHub में commit मत करना।
                |
                */

                fs.writeFileSync(
                    TOKEN_PATH,
                    JSON.stringify(tokens, null, 2),
                    {
                        encoding: 'utf8',
                        mode: 0o600
                    }
                );

                console.log('\n==================================================');
                console.log('✅ TOKEN CREATED SUCCESSFULLY');
                console.log('==================================================');

                console.log(
                    `\n📁 Token saved to:\n${TOKEN_PATH}`
                );

                /*
                |--------------------------------------------------------------------------
                | Show token JSON
                |--------------------------------------------------------------------------
                |
                | The user needs this to update GitHub YOUTUBE_TOKEN.
                |
                */

                console.log(
                    '\n📋 नीचे का पूरा JSON GitHub Secret YOUTUBE_TOKEN में डालें:\n'
                );

                console.log(
                    JSON.stringify(tokens, null, 2)
                );

                console.log('\n==================================================');
                console.log('⚠️ SECURITY WARNING');
                console.log('==================================================');

                console.log(
                    '\nइस JSON को किसी को share मत करें।'
                );

                console.log(
                    'इसे GitHub repository में file के रूप में commit मत करें।'
                );

                console.log(
                    'इसे public chat/GitHub issue में paste मत करें।'
                );

                console.log('\n==================================================\n');

            } catch (error) {
                console.error('\n❌ TOKEN ERROR\n');

                if (error.response?.data) {
                    console.error(
                        JSON.stringify(
                            error.response.data,
                            null,
                            2
                        )
                    );
                } else {
                    console.error(
                        error.message
                    );
                }

                console.error(
                    '\nAuthorization process complete नहीं हुआ।'
                );

                process.exitCode = 1;
            }
        }
    );
}
