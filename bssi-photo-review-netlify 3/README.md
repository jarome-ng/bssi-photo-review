# BSSI2026 Photo Review Tool

Photo review tool with Dropbox browsing and direct Flickr upload.

## Features

- 📦 **Dropbox Integration** - Browse photos directly from Dropbox
- 📷 **Flickr Upload** - Direct upload with albums and tags
- ⌨️ **Keyboard-Driven** - Fast review workflow
- 📊 **Progress Tracking** - See selected/rejected counts

## Setup

### 1. Create a Dropbox App

1. Go to https://www.dropbox.com/developers/apps
2. Click "Create app"
3. Choose "Scoped access" → "Full Dropbox"
4. Name your app (e.g., "BSSI Photo Review")
5. In the app settings:
   - Add your Netlify URL to "Redirect URIs" (e.g., `https://your-site.netlify.app`)
   - Copy the "App key"

### 2. Update the Code

Edit `index.html` line ~25:
```javascript
const DROPBOX_CLIENT_ID = 'YOUR_DROPBOX_APP_KEY';
```

### 3. Deploy to Netlify

**Option A: Netlify CLI**
```bash
npm install -g netlify-cli
netlify deploy --prod
```

**Option B: GitHub**
1. Push this folder to GitHub
2. Connect repo to Netlify
3. Deploy

### 4. Set Environment Variables (Netlify Dashboard)

Go to Site Settings → Environment Variables:
```
FLICKR_API_KEY = cb881d5c33ce59c4413f8f1c6efad187
FLICKR_API_SECRET = 37d4b3d41b52db5d
```

### 5. Update Dropbox Redirect URI

After deploying, go back to Dropbox app settings and add your live Netlify URL to "Redirect URIs".

## Usage

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| ← | Previous photo |
| → | Next photo |
| Space | Skip (next) |
| X | Reject |
| Enter | Select (requires session) |

### Workflow

1. **Connect Dropbox** - Click button, authorize
2. **Navigate** to your event photos folder
3. **Review photos** - Use keyboard shortcuts
4. **Assign session + stage** before selecting
5. **Connect Flickr** - Click button, authorize
6. **Upload** - Click "Upload to Flickr"

### Flickr Output

For each selected photo:
- **Album**: `BSSI2026 | {Session Name}`
- **Description**: `Photo credit: Black Swan Summit India 2026`
- **Tags**: `BSSI2026-{Stage}` (e.g., `BSSI2026-MainStage`)

## File Structure

```
bssi-photo-review-netlify/
├── index.html              # Main app
├── netlify.toml            # Netlify config
├── package.json            # Dependencies
└── netlify/functions/
    ├── flickr-auth.js      # Start Flickr OAuth
    ├── flickr-callback.js  # Handle OAuth callback
    └── flickr-upload.js    # Upload photos to Flickr
```

## Configuration

Edit `index.html` to customize:

```javascript
const EVENT_CODE = 'BSSI2026';
const PHOTO_CREDIT = 'Photo credit: Black Swan Summit India 2026';

let sessions = [
    'Opening Keynote',
    'Panel Discussion',
    // Add your sessions...
];
```

## Troubleshooting

### Dropbox "Invalid redirect URI"
- Make sure your Netlify URL is added to Dropbox app's Redirect URIs
- Include the full URL with `https://`

### Flickr upload fails
- Check Netlify function logs
- Verify environment variables are set correctly
- Make sure you've authorized with "write" permissions

### Photos not loading
- Dropbox token may have expired - disconnect and reconnect
- Check browser console for errors
