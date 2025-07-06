#!/bin/bash

echo "Setting up Fitbit Sync..."

# Check if .env exists in backend
if [ ! -f "backend/.env" ]; then
    echo "Creating backend/.env from template..."
    cp backend/.env.example backend/.env
    echo "Please edit backend/.env with your Fitbit API credentials"
fi

# Install dependencies
echo "Installing dependencies..."
npm install

echo "Setup complete!"
echo ""
echo "Quick start:"
echo "  npm run dev   - Start server (backend + frontend)"
echo ""
echo "Access at: https://localhost:8080 (or http://localhost:8080)"
echo ""
echo "Don't forget to add your Fitbit API credentials to backend/.env"
