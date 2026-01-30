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
    const callbackUrl = event.queryStringParameters?.callback || 
        `${process.env.URL}/.netlify/functions/flickr-callback`;

    try {
        // Step 1: Get request token
        const requestData = {
            url: 'https://www.flickr.com/services/oauth/request_token',
            method: 'POST',
            data: { oauth_callback: callbackUrl }
        };

        const authHeader = oauth.toHeader(oauth.authorize(requestData));
        
        const response = await fetch(requestData.url, {
            method: 'POST',
            headers: authHeader
        });

        const text = await response.text();
        const params = new URLSearchParams(text);
        
        const oauthToken = params.get('oauth_token');
        const oauthTokenSecret = params.get('oauth_token_secret');

        if (!oauthToken) {
            throw new Error('Failed to get request token: ' + text);
        }

        // Store token secret temporarily (in production, use a proper session store)
        // For simplicity, we'll pass it through the callback URL
        const authUrl = `https://www.flickr.com/services/oauth/authorize?oauth_token=${oauthToken}&perms=write`;

        return {
            statusCode: 302,
            headers: {
                Location: authUrl,
                'Set-Cookie': `flickr_token_secret=${oauthTokenSecret}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
            }
        };
    } catch (error) {
        console.error('Flickr auth error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
