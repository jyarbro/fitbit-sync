# Fitbit Sync for iOS Shortcuts

A Node.js application that syncs Fitbit data and serves it to iOS Shortcuts with intelligent data processing and HealthKit integration.

## Features

- **Secure JWT Authentication** for personal use
- **Automatic Background Sync** every 5 minutes (8am-8pm) and hourly (8pm-8am)
- **Smart Data Processing**:
  - Steps consolidated into activity blocks (max 15 minutes, gaps of 10+ minutes)
  - Active calories with BMR subtraction
  - Detailed sleep stage tracking
  - Heart rate, SpO2, respiratory rate, and temperature data
- **iOS Shortcuts Integration** with message queue API
- **Rate Limit Monitoring** and automatic token refresh
- **HealthKit-Compatible** sample formats

## Supported Fitbit Data

Based on your `.scopes` file:
- ✅ Activity (steps, calories, distance)
- ✅ Heart Rate (continuous monitoring)
- ✅ Sleep (detailed stage analysis)
- ✅ Oxygen Saturation (SpO2)
- ✅ Respiratory Rate
- ✅ Temperature (skin temperature)

## Setup

### 1. Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required variables:
- `JWT_SECRET`: 32+ character secret for JWT signing
- `CLIENT_ID`: Your Fitbit app client ID
- `CLIENT_SECRET`: Your Fitbit app client secret
- `REDIRECT_URI`: Your callback URL (e.g., `https://yourdomain.com/auth/callback` or `https://localhost:8080/auth/callback` for local dev)

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Fitbit Scopes

Edit `.scopes` file to enable/disable data types:
```
activity
heartrate
sleep
oxygen_saturation
respiratory_rate
temperature
```

Comment out lines with `#` to disable specific scopes.

### 4. Generate a Self-Signed TLS Certificate (for local HTTPS)

Fitbit requires HTTPS for all redirect URIs (except for `localhost`). To use HTTPS locally:

```bash
openssl req -nodes -new -x509 -keyout server.key -out server.cert -days 365
```
- When prompted, you can use any values (for local dev).
- This will create `server.key` and `server.cert` in your project directory.

### 5. Start the Server (with HTTPS)

```bash
npm start
```
- The server will run at `https://localhost:8080` by default.
- The first time you visit, your browser will warn about the self-signed certificate. Accept the risk to proceed.

## OAuth Setup (One-time)

### 1. Start OAuth Flow
Visit:
```
https://localhost:8080/auth/start
```
This will automatically redirect you to Fitbit's authorization page.

### 2. Complete Authorization
1. Grant access to your Fitbit data on Fitbit's site
2. You will be redirected to `/auth/callback` on your server
3. Your personal JWT token will be displayed in the browser—copy and save it for API access

## iOS Shortcuts Integration

### API Endpoint
```
POST /api/sync
Authorization: Bearer <your_personal_jwt>
Content-Type: application/json

{
  "lastSyncTimestamp": "2025-01-04T10:00:00.000Z"
}
```

### Response Format
```json
{
  "samples": [
    {
      "type": "steps",
      "value": 1247,
      "datetime": "2025-01-04T09:30:00.000Z"
    },
    {
      "type": "activeCalories",
      "value": 45.2,
      "datetime": "2025-01-04T09:30:00.000Z"
    },
    {
      "type": "heartRate",
      "value": 78,
      "datetime": "2025-01-04T09:32:00.000Z"
    },
    {
      "type": "sleepAnalysis",
      "value": "deep",
      "datetime": "2025-01-04T01:49:00.000Z"
    }
  ],
  "newLastSyncTimestamp": "2025-01-04T14:35:00.000Z",
  "count": 4
}
```

### Sample Types

| Type               | HealthKit Property   | Datetime Meaning      |
|--------------------|---------------------|----------------------|
| `steps`            | Steps               | End time             |
| `activeCalories`   | Active Energy       | End time             |
| `heartRate`        | Heart Rate          | Measurement time     |
| `sleepAnalysis`    | Sleep Analysis      | End time             |
| `oxygenSaturation` | Oxygen Saturation   | Measurement time     |
| `respiratoryRate`  | Respiratory Rate    | Measurement time     |
| `bodyTemperature`  | Body Temperature    | Measurement time     |

### Sleep Analysis Values
- `"awake"` - Awake periods
- `"light"` - Light sleep
- `"deep"` - Deep sleep
- `"rem"` - REM sleep

## API Endpoints

### Public Endpoints
- `GET /` - API information
- `GET /health` - Health check
- `GET /auth/start` - Start OAuth flow
- `POST /auth/callback` - Complete OAuth flow

### Protected Endpoints (Require JWT)
- `POST /api/sync` - Get new samples since timestamp
- `POST /api/sync/trigger` - Manual sync trigger
- `GET /api/status` - Sync status and rate limits
- `GET /auth/token` - Generate new JWT token

## Data Processing Logic

### Steps Consolidation
- Groups consecutive minutes with steps > 0
- Ends blocks after 10+ minutes of inactivity
- Maximum block duration: 15 minutes
- Creates HealthKit samples with start/end times

### Active Calories Calculation
```
Daily BMR ÷ (24 × 60) = BMR per minute
Active Calories = Total Calories - BMR per minute
```

### Sleep Stage Processing
- Processes minute-by-minute sleep data
- Creates individual samples for each stage transition
- Handles short wake periods (≤3 minutes) as separate samples
- Provides detailed sleep analysis for HealthKit

## Background Sync Schedule

- **Active Hours**: Every 5 minutes (8am-8pm)
- **Sleep Hours**: Every hour (8pm-8am)
- **Daily Cleanup**: 3am (removes data older than 30 days)

## Security Features

- JWT authentication for API access
- Database files blocked from web access
- Rate limiting (100 requests per 15 minutes)
- Input validation for all endpoints
- Automatic token refresh before expiration
- CORS protection

## Troubleshooting

### Rate Limits
- Fitbit allows 150 requests per hour per user
- Check `/api/status` for current rate limit status
- App automatically monitors and adapts to rate limits

### Token Issues
- Tokens expire every 8 hours but are auto-refreshed
- If OAuth fails, restart the flow with `/auth/start`
- Generate new JWT with `/auth/token` if needed

### Sync Issues
- Check `/api/status` for last sync times
- Trigger manual sync with `/api/sync/trigger`
- Review server logs for detailed error information

## Development

### Local Testing
```bash
NODE_ENV=development npm start
```

### Manual Sync
```bash
curl -X POST http://localhost:80/api/sync/trigger \
  -H "Authorization: Bearer <your_jwt>"
```

### Check Status
```bash
curl -X GET http://localhost:80/api/status \
  -H "Authorization: Bearer <your_jwt>"
```

## Deployment

Designed for Digital Ocean App Platform:
1. Connect your GitHub repository
2. Set environment variables in the app settings
3. Deploy automatically on git push

The app runs autonomously, syncing data in the background and serving iOS Shortcuts on demand.
