#!/bin/bash

# ------------------------------
# Publishing Script
# ------------------------------

set -euo pipefail
trap 'echo -e "\033[0;31m❌ Error at line $LINENO\033[0m"' ERR

# --- Step 1: Define branches ---
MAIN_BRANCH="main"

# --- Color Definitions ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

# --- Logging Helper ---
log() {
    local COLOR=$1
    shift
    echo -e "${!COLOR}$*${RESET}"
}

# --- Git Branch Switch & Pull Helper ---
git_switch_and_pull() {
    local BRANCH=$1
    log BLUE "→ Switching to $BRANCH branch..."
    git switch "$BRANCH" > /dev/null 2>&1
    git pull origin "$BRANCH" > /dev/null 2>&1
}

# === Previous checks ===
for cmd in git npm node; do
    command -v $cmd >/dev/null 2>&1 || {
        echo -e "${RED}❌ Required command '$cmd' not found. Exiting.${RESET}"
        exit 1
    }
done

# --- Step 2: Ask for the version bump type ---
log BOLD "Select the type of version bump:"
select BUMP_TYPE in patch minor major cancel; do
    case $BUMP_TYPE in
        patch|minor|major)
            log GREEN "→ Selected: $BUMP_TYPE"
            break
            ;;
        cancel)
            log RED "❌ Operation cancelled."
            exit 0
            ;;
        *)
            log YELLOW "Invalid option. Please choose 1 (patch), 2 (minor), 3 (major), or 4 (cancel)."
            ;;
    esac
done

# --- Step 3: Switch to main branch and pull ---
git_switch_and_pull "$MAIN_BRANCH"

# --- Step 4: Bump version using npm ---
CURRENT_VERSION=$(node -p "require('./package.json').version")
npm version "$BUMP_TYPE" --no-git-tag-version --silent > /dev/null 2>&1
NEW_VERSION=$(node -p "require('./package.json').version")
log GREEN "→ Bumped version: $CURRENT_VERSION → $NEW_VERSION"

# --- Step 5: Update lockfile ---
log BLUE "→ Running npm install..."
npm install > /dev/null 2>&1

# --- Step 6: Commit and push version bump ---
log GREEN "→ Commit version: $NEW_VERSION"
git add package.json package-lock.json > /dev/null 2>&1
git commit -m "v$NEW_VERSION" > /dev/null 2>&1
git push origin "$MAIN_BRANCH" > /dev/null 2>&1

# --- Step 7: Tag and push ---
log GREEN "→ Tagging version: v$NEW_VERSION"
git tag "v$NEW_VERSION" > /dev/null 2>&1
git push origin "v$NEW_VERSION" > /dev/null 2>&1

# --- Step 8: Publish package ---
log BLUE "→ Publishing package..."
npm publish

# --- Done ---
log GREEN "✅ Publishing complete. Version: v$NEW_VERSION"