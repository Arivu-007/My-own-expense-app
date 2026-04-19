#!/bin/bash
# ExpenseFlow Android APK Builder
# Run this in Terminal from your Desktop/Expense folder

echo "📦 Step 1: Installing Capacitor..."
npm install

echo "➕ Step 2: Adding Android platform..."
npx cap add android

echo "🔄 Step 3: Syncing web assets to Android..."
npx cap sync android

echo "✅ Done! Android project created at: $(pwd)/android"
echo ""
echo "Next: Run build_apk.sh to generate the APK"
