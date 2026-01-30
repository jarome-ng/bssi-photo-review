const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const fetch = require('node-fetch');

const FLICKR_API_KEY = process.env.FLICKR_API_KEY || 'cb881d5c33ce59c4413f8f1c6efad187';
const FLICKR_API_SECRET = process.env.FLICKR_API_SECRET || '37d4b3d41b52db5d';

const oauth = OAuth({
    consumer: {
        key: FLICKR_API_KEY,
        secret: FLICKR_API_SECRET
    },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string, key) {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
    }
});

exports.handler = async (event) => {
    const { oauth_token, oauth_verifier } = event.queryStringParameters || {};
    
    // Get token secret from cookie
    const cookies = event.headers.cookie || '';
    const tokenSecretMatch = cookies.match(/flickr_token_secret=([^;]+)/);
    const oauthTokenSecret = tokenSecretMatch ? tokenSecretMatch[1] : '';

    if (!oauth_token || !oauth_verifier) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing oauth_token or oauth_verifier' })
        };
    }

    try {
        // Step 2: Exchange for access token
        const requestData = {
            url: 'https://www.flickr.com/services/oauth/access_token',
            method: 'POST',
            data: { oauth_verifier }
        };

        const token = {
            key: oauth_token,
            secret: oauthTokenSecret
        };

        const authHeader = oauth.toHeader(oauth.authorize(requestData, token));

        const response = await fetch(requestData.url, {
            method: 'POST',
            headers: authHeader
        });

        const text = await response.text();
        const params = new URLSearchParams(text);
        
        const accessToken = params.get('oauth_token');
        const accessTokenSecret = params.get('oauth_token_secret');
        const userId = params.get('user_nsid');
        const username = params.get('username');

        if (!accessToken) {
            throw new Error('Failed to get access token: ' + text);
        }

        // Return HTML that stores the token and closes the window
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Flickr Connected!</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: #0a0a0a;
            color: #fff;
        }
        .success {
            text-align: center;
        }
        .icon { font-size: 48px; margin-bottom: 16px; }
        h2 { color: #00ff88; }
    </style>
</head>
<body>
    <div class="success">
        <div class="icon">✓</div>
        <h2>Flickr Connected!</h2>
        <p>Welcome, ${username || 'User'}</p>
        <p>You can close this window.</p>
    </div>
    <script>
        // Store tokens
        localStorage.setItem('flickr_token', '${accessToken}');
        localStorage.setItem('flickr_token_secret', '${accessTokenSecret}');
        localStorage.setItem('flickr_user_id', '${userId}');
        localStorage.setItem('flickr_username', '${username}');
        
        // Notify parent window and close
        if (window.opener) {
            window.opener.postMessage({ type: 'flickr_auth_success' }, '*');
            setTimeout(() => window.close(), 2000);
        } else {
            // Redirect to main app
            setTimeout(() => window.location.href = '/', 2000);
        }
    </script>
</body>
</html>
        `;

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/html',
                'Set-Cookie': 'flickr_token_secret=; Path=/; HttpOnly; Max-Age=0'
            },
            body: html
        };
    } catch (error) {
        console.error('Flickr callback error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
