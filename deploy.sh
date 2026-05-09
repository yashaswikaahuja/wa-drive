#!/bin/bash
set -e
VERSION=$1
if [ -z "$VERSION" ]; then
  # Auto-increment patch from manifest
  CURRENT=$(python3 -c "import json; print(json.load(open('/opt/cybercontrol-hub/extension/manifest.json'))['version'])")
  MAJOR=$(echo $CURRENT | cut -d. -f1)
  MINOR=$(echo $CURRENT | cut -d. -f2)
  VERSION="$MAJOR.$((MINOR + 1))"
fi

EXT=/opt/cybercontrol-hub/extension

echo "Deploying v$VERSION..."

# Update all version strings in one place
sed -i "s/\"version\": \"[0-9.]*\"/\"version\": \"$VERSION\"/" $EXT/manifest.json
sed -i "s/CURRENT_VERSION = '[0-9.]*'/CURRENT_VERSION = '$VERSION'/" $EXT/popup.js
sed -i "s/background.js loaded v[0-9.]*/background.js loaded v$VERSION/" $EXT/background.js
sed -i "s/v[0-9.]* fillFormFieldsSequential/v$VERSION fillFormFieldsSequential/" $EXT/autofill/executor.js

# Verify all updated
echo "manifest: $(python3 -c "import json; print(json.load(open('$EXT/manifest.json'))['version'])")"
echo "popup: $(grep 'CURRENT_VERSION' $EXT/popup.js | head -1)"
echo "background: $(head -1 $EXT/background.js)"
echo "executor: $(grep 'fillFormFieldsSequential started' $EXT/autofill/executor.js)"

# Syntax check
node --check $EXT/popup.js && node --check $EXT/background.js && node --check $EXT/autofill/executor.js && echo "syntax ok"

# Build zip
cd $EXT && zip -r ../extension.zip * --include='*.js' --include='*.html' --include='*.json' --include='*.png'

# Commit and push
cd /opt/cybercontrol-hub
git add extension/ extension.zip
git commit -m "v$VERSION: deploy"
git push
echo "Done: v$VERSION"
