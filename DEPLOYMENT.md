# RV Sales CRM - Deployment Guide

## Prerequisites

1. **EAS CLI installed**: `npm install -g eas-cli`
2. **Expo account**: Create at https://expo.dev
3. **Apple Developer account** (for iOS): https://developer.apple.com
4. **Google Play Developer account** (for Android): https://play.google.com/console

---

## Step 1: Initialize EAS Project

```bash
cd C:\dev\lotlink\RV-Sales-Mini-CRM

# Login to Expo
eas login

# Initialize EAS (this generates your project ID)
eas init

# After running, update eas.json with your real credentials
```

---

## Step 2: Deploy Backend API

### Option A: Railway (Recommended - Easiest)

1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub repo"
3. Connect your GitHub repository
4. Add environment variables in Railway dashboard:
   - `DATABASE_URL` - Your PostgreSQL connection string
   - `NODE_ENV=production`
   - `TWILIO_ACCOUNT_SID` (if using SMS)
   - `TWILIO_AUTH_TOKEN` (if using SMS)
   - `TWILIO_PHONE_NUMBER` (if using SMS)
   - `SENDGRID_API_KEY` (if using email)
   - `SENDGRID_FROM_EMAIL` (if using email)
5. Railway will auto-detect the `railway.json` config
6. Copy your deployed URL (e.g., `https://rv-sales-crm.up.railway.app`)

### Option B: Render

1. Go to https://render.com
2. Click "New" → "Blueprint"
3. Connect your GitHub repository
4. Render will use the `render.yaml` configuration
5. Set environment variables in dashboard

### Option C: Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login and deploy
fly auth login
fly launch
fly secrets set DATABASE_URL="your-postgres-url"
fly deploy
```

---

## Step 3: Update App Configuration

After deploying your backend, update `eas.json`:

```json
{
  "build": {
    "production": {
      "env": {
        "API_URL": "https://your-deployed-api.railway.app"
      }
    }
  }
}
```

---

## Step 4: Configure App Store Credentials

### iOS (Apple App Store)

1. Get your Apple Team ID from https://developer.apple.com/account
2. Create an App in App Store Connect: https://appstoreconnect.apple.com
3. Get your ASC App ID from the app's URL
4. Update `eas.json` submit section:

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "your-email@example.com",
      "ascAppId": "1234567890",
      "appleTeamId": "ABCD1234"
    }
  }
}
```

### Android (Google Play Store)

1. Create a service account in Google Cloud Console
2. Download the JSON key file
3. Enable Google Play API
4. Add service account to Google Play Console
5. Save key file as `google-service-account.json` in project root

---

## Step 5: Build and Submit

### Build for Production

```bash
# Build iOS
npm run build:ios

# Build Android
npm run build:android

# Build both
npm run build:all
```

### Submit to Stores

```bash
# Submit iOS to App Store Connect
npm run submit:ios

# Submit Android to Google Play
npm run submit:android
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| NODE_ENV | Yes | Set to `production` |
| PORT | No | Server port (default: 5000) |
| TWILIO_ACCOUNT_SID | For SMS | Twilio account SID |
| TWILIO_AUTH_TOKEN | For SMS | Twilio auth token |
| TWILIO_PHONE_NUMBER | For SMS | Twilio phone number |
| SENDGRID_API_KEY | For email | SendGrid API key |
| SENDGRID_FROM_EMAIL | For email | Sender email address |

---

## Troubleshooting

### "projectId not found"
Run `eas init` to generate a project ID.

### iOS build fails with signing error
Run `eas credentials` to configure iOS signing.

### Android build fails with keystore error
Run `eas credentials` to generate or configure keystore.

### API not connecting from mobile app
1. Check API_URL is set correctly in eas.json
2. Ensure backend is deployed and accessible
3. Check CORS settings allow your app's origin
