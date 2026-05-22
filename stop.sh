#!/bin/bash
# CyberControl — Stop All Services
echo "🛑 Stopping all services..."
pkill -f "node dist/index" 2>/dev/null
pkill -f "node index.js" 2>/dev/null
pkill -f "vite" 2>/dev/null
echo "Done."
