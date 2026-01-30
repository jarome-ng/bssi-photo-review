const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const fetch = require('node-fetch');
const FormData = require('form-data');
const busboy = require('busboy');

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

// Parse multipart form data
function parseMultipart(event) {
    return new Promise((resolve, reject) => {
        const fields = {};
        const files = [];
        
        const bb = busboy({ 
            headers: { 
                'content-type': event.headers['content-type'] || event.headers['Content-Type']
            }
        });

        bb.on('file', (name, file, info) => {
            const chunks = [];
            file.on('data', (chunk) => chunks.push(chunk));
            file.on('end', () => {
                files.push({
                    name,
                    filename: info.filename,
                    mimeType: info.mimeType,
                    buffer: Buffer.concat(chunks)
                });
            });
        });

        bb.on('field', (name, value) => {
            fields[name] = value;
        });

        bb.on('finish', () => resolve({ fields, files }));
        bb.on('error', reject);

        const body = event.isBase64Encoded 
            ? Buffer.from(event.body, 'base64')
            : Buffer.from(event.body);
        
        bb.end(body);
    });
}

// Create albums cache
const albumsCache = {};

async function getOrCreateAlbum(albumName, primaryPhotoId, token, tokenSecret) {
    // Check cache first
    if (albumsCache[albumName]) {
        return albumsCache[albumName];
    }

    const userToken = { key: token, secret: tokenSecret };

    // Get existing photosets
    const listRequest = {
        url: 'https://api.flickr.com/services/rest/',
        method: 'GET',
        data: {
            method: 'flickr.photosets.getList',
            api_key: FLICKR_API_KEY,
            format: 'json',
            nojsoncallback: 1
        }
    };

    const listAuth = oauth.authorize(listRequest, userToken);
    const listUrl = new URL(listRequest.url);
    Object.entries({ ...listRequest.data, ...listAuth }).forEach(([k, v]) => {
        listUrl.searchParams.append(k, v);
    });

    const listResponse = await fetch(listUrl.toString());
    const listData = await listResponse.json();

    if (listData.photosets?.photoset) {
        const existing = listData.photosets.photoset.find(ps => ps.title._content === albumName);
        if (existing) {
            albumsCache[albumName] = existing.id;
            return existing.id;
        }
    }

    // Create new album
    const createRequest = {
        url: 'https://api.flickr.com/services/rest/',
        method: 'POST',
        data: {
            method: 'flickr.photosets.create',
            api_key: FLICKR_API_KEY,
            title: albumName,
            primary_photo_id: primaryPhotoId,
            format: 'json',
            nojsoncallback: 1
        }
    };

    const createAuth = oauth.authorize(createRequest, userToken);
    const createParams = new URLSearchParams({ ...createRequest.data, ...createAuth });

    const createResponse = await fetch(createRequest.url, {
        method: 'POST',
        body: createParams
    });
    const createData = await createResponse.json();

    if (createData.photoset?.id) {
        albumsCache[albumName] = createData.photoset.id;
        return createData.photoset.id;
    }

    throw new Error('Failed to create album: ' + JSON.stringify(createData));
}

async function addPhotoToAlbum(photosetId, photoId, token, tokenSecret) {
    const userToken = { key: token, secret: tokenSecret };

    const request = {
        url: 'https://api.flickr.com/services/rest/',
        method: 'POST',
        data: {
            method: 'flickr.photosets.addPhoto',
            api_key: FLICKR_API_KEY,
            photoset_id: photosetId,
            photo_id: photoId,
            format: 'json',
            nojsoncallback: 1
        }
    };

    const auth = oauth.authorize(request, userToken);
    const params = new URLSearchParams({ ...request.data, ...auth });

    const response = await fetch(request.url, {
        method: 'POST',
        body: params
    });
    
    return response.json();
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method not allowed' };
    }

    try {
        const { fields, files } = await parseMultipart(event);
        
        const token = fields.token || event.headers['x-flickr-token'];
        const tokenSecret = fields.token_secret || event.headers['x-flickr-token-secret'];
        
        if (!token || !tokenSecret) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Missing Flickr authentication' })
            };
        }

        const file = files[0];
        if (!file) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'No file uploaded' })
            };
        }

        const title = fields.title || file.filename;
        const description = fields.description || '';
        const tags = fields.tags || '';
        const albumName = fields.album || '';

        // Upload to Flickr
        const uploadUrl = 'https://up.flickr.com/services/upload/';
        const userToken = { key: token, secret: tokenSecret };

        const uploadData = {
            title,
            description,
            tags,
            is_public: 1
        };

        const uploadAuth = oauth.authorize({
            url: uploadUrl,
            method: 'POST',
            data: uploadData
        }, userToken);

        const form = new FormData();
        Object.entries({ ...uploadData, ...uploadAuth }).forEach(([key, value]) => {
            form.append(key, value);
        });
        form.append('photo', file.buffer, {
            filename: file.filename,
            contentType: file.mimeType
        });

        const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            body: form
        });

        const uploadText = await uploadResponse.text();
        
        // Parse XML response
        const photoIdMatch = uploadText.match(/<photoid>(\d+)<\/photoid>/);
        if (!photoIdMatch) {
            throw new Error('Upload failed: ' + uploadText);
        }
        
        const photoId = photoIdMatch[1];

        // Add to album if specified
        let albumId = null;
        if (albumName) {
            try {
                albumId = await getOrCreateAlbum(albumName, photoId, token, tokenSecret);
                if (albumId && !albumsCache[albumName + '_primary']) {
                    albumsCache[albumName + '_primary'] = true;
                } else if (albumId) {
                    await addPhotoToAlbum(albumId, photoId, token, tokenSecret);
                }
            } catch (albumError) {
                console.error('Album error:', albumError);
                // Don't fail the whole upload for album issues
            }
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                photoId,
                albumId,
                url: `https://www.flickr.com/photos/${photoId}`
            })
        };
    } catch (error) {
        console.error('Upload error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
