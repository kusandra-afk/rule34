#!/data/data/com.termux/files/usr/bin/bash

cd "$(dirname "$0")"

echo "Updating Termux..."
pkg update -y || echo "Update failed, continuing..."
pkg upgrade -y || echo "Upgrade failed, continuing..."
pkg install python rust binutils make cmake clang -y || echo "Package installation failed, continuing..."

python -m pip install --upgrade pip > /dev/null 2>&1
echo "Installing dependencies..."
python -m pip install -r requirements.txt > /dev/null 2>&1

echo "Done."
echo "Starting server..."
python server.py
