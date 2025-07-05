# Fitbit Sync

Fitbit Sync is a full-stack application for collecting, synchronizing, and visualizing your Fitbit health data. It is designed for personal use, with a focus on privacy, automation, and integration with iOS Shortcuts. The project is organized as a monorepo with a modular architecture.

## Overview

- **Backend:** Node.js/Express API server with JWT authentication, Fitbit OAuth, and SQLite database for secure data storage and background sync jobs.
- **Frontend:** Modern JavaScript web app for visualizing your health data, managing syncs, and interacting with Fitbit and iOS Shortcuts.
- **Shared:** Common utilities, constants, and type definitions used by both backend and frontend.

## Features

- Secure authentication using JWT and session cookies
- Automatic background sync with Fitbit (configurable schedule)
- Manual sync and data management from the web dashboard
- iOS Shortcuts integration for automating data pulls and notifications
- HealthKit-compatible data export
- Rate limit monitoring and error handling
- Modular, extensible codebase with clear separation of concerns

## Getting Started

### Prerequisites
- Node.js (v16 or newer)
- npm
- Fitbit developer account and API credentials

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/fitbit-sync.git
   cd fitbit-sync
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables:
   - Copy `.env.example` to `.env` in the `backend/` directory and fill in your Fitbit API credentials and secrets.
4. Start the application:
   ```bash
   npm run dev
   ```
   This will start both the backend server and serve the frontend dashboard.

## Project Structure

- `backend/` — Express API server, authentication, database, and sync logic
- `frontend/` — Static web app (HTML, CSS, JS) for dashboard and controls
- `shared/` — Utilities, constants, and type definitions shared across the project

## Usage

- Access the dashboard at [https://localhost](https://localhost) (or your configured domain)
- Log in and connect your Fitbit account via OAuth
- View, filter, and manage your health data
- Trigger manual syncs or use iOS Shortcuts for automation

## Security & Privacy

- All data is stored locally in SQLite and never shared externally
- OAuth tokens and sensitive data are protected by secure cookies and environment variables
- HTTPS is required for all communication (self-signed certificates for development)
