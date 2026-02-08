# RV Sales CRM

## Overview
RV Sales CRM is a dealership management application for tracking customer leads, inventory, and intelligent AI-powered matching with automatic email and SMS notifications. Built with Expo (React Native for Web), tRPC, Express, PostgreSQL with Drizzle ORM, Twilio SMS, and SendGrid email.

## Core Feature: AI Matching & Auto-Notification
When a new unit is added to inventory, the AI matching engine automatically:
1. Scans ALL active leads for matching preferences (model, year, make, features, price, etc.)
2. Scores each lead 0-100 based on how well they match
3. Creates match records for qualifying leads (based on sensitivity setting)
4. Sends email notifications via SendGrid with rich HTML templates
5. Sends SMS notifications to customers via Twilio with personalized messages
6. Tracks notification status and follow-up through the sales pipeline

## Project Architecture

### Frontend (Expo Metro on Port 8081)
- **Framework**: Expo SDK 52 with expo-router (file-based routing)
- **Styling**: NativeWind (TailwindCSS for React Native)
- **API Client**: tRPC React Query (v10) using relative URL `/api/trpc`
- **State Management**: TanStack React Query v4
- **Directory**: `app/` (routes), `components/`, `hooks/`, `lib/`

### Backend (Express on Port 5000)
- **Framework**: Express.js with tRPC adapter
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Session-based with bcrypt password hashing
- **SMS**: Twilio integration via Replit connector
- **Matching**: `server/matching-engine.ts` - AI scoring engine
- **Proxy**: Express proxies non-API requests to Expo Metro (port 8081) via http-proxy-middleware
- **Directory**: `server/`

### Unified Port Architecture
- Express listens on port 5000 (the only externally accessible port)
- Express handles `/api/trpc` and `/api/health` directly
- All other requests are proxied to Expo Metro dev server on port 8081
- tRPC client uses relative URL `/api/trpc` (same origin)

### Key Files
- `server/matching-engine.ts` - AI matching logic with scoring algorithm
- `server/twilio.ts` - Twilio SMS integration via Replit connector
- `server/routers.ts` - tRPC API endpoints
- `server/db.ts` - Database queries
- `shared/schema.ts` - Drizzle PostgreSQL schema

### Key Routes
- `/` - Redirect to login or dashboard
- `/login` - Dealership login
- `/(tabs)` - Tab navigation (Dashboard, Leads, Inventory, Matches, Settings)

### Matching Algorithm
- Model/make name matching (word overlap analysis): up to 65 points
- Year matching (exact, close, range): up to 20 points
- Price/budget matching: up to 10 points
- Length, bed type, brand preferences: up to 20 points
- Notes keyword analysis: up to 3 points
- Sensitivity thresholds: strict (50+), moderate (30+), loose (15+)

### Security
- Multi-tenant data isolation: All CRUD operations check dealership ownership
- Session-based auth with httpOnly cookies
- bcrypt password hashing

### Test Credentials
- Username: `test123`
- Password: `test123`

## Scripts
- `npm run dev` - Start both Express backend (port 5000) and Expo frontend (port 8081)
- `npm run db:push` - Push schema changes to database

## Recent Changes
- 2026-02-07: Added SendGrid email notifications
  - Created server/sendgrid.ts using Replit SendGrid connector
  - Matching engine now sends email AND SMS when matches found (email first, then SMS)
  - Rich HTML email template with unit details, pricing, match reasons
  - Retry function handles both email and SMS channels
  - Email notifications enabled by default in dealership preferences
  - Server-side consent tracking with IP, timestamp, user agent for compliance
  - Phone numbers normalized to E.164 format on opt-in
- 2026-02-06: Twilio SMS fully operational
  - Fixed Twilio auth: connector provides Auth Token in api_key field, not SK-prefixed API Key
  - Uses Account SID + Auth Token authentication (auto-detects SK vs token format)
  - Credentials cached for performance, 555 test numbers skipped automatically
  - Successfully sending live SMS notifications to real phone numbers
- 2026-02-06: AI Matching & SMS Notification System
  - Built AI matching engine that scores leads against inventory
  - Integrated Twilio SMS via Replit connector for automatic customer notifications
  - Auto-matching triggers when new inventory is created
  - Added Matches tab with full notification tracking and status management
  - Updated Dashboard with match stats, sold counts, and recent matches
  - Enhanced lead form with phone (for SMS), preferred year fields
  - Manual "Run Full Match Scan" button for rescanning all inventory
  - Match status pipeline: pending -> notified -> contacted -> sold/dismissed
- 2026-02-06: Fixed critical issues
  - Changed architecture to unified port 5000 (Express proxies to Expo)
  - Fixed tRPC client to use relative URL instead of hardcoded localhost
  - Added dealership ownership checks to all getById/update/delete operations
- 2026-02-06: Full project setup from design specs
  - Converted MySQL schema to PostgreSQL
  - Created Expo web app with login, dashboard, leads, inventory, and settings screens
  - Created Express + tRPC backend with session auth
  - Database seeded with test dealership
