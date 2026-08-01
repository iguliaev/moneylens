#!/bin/bash
set -euo pipefail

if [ -z "${RELEASE_VERSION:-}" ]; then
  echo "Usage: RELEASE_VERSION=vX.Y.Z $0" >&2
  exit 1
fi

if ! [[ "$RELEASE_VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "RELEASE_VERSION must look like vX.Y.Z (got: $RELEASE_VERSION)" >&2
  exit 1
fi

REPO_URL="https://github.com/iguliaev/moneylens.git"

TMP_DIR="$(mktemp -d -t moneylens-release-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Cloning fresh copy of the repo into $TMP_DIR"
git clone "$REPO_URL" "$TMP_DIR"
cd "$TMP_DIR"

echo "Step 1 — Review what will be released"
git checkout main && git pull origin main
git fetch origin release:release
git log release..main --oneline

echo "Step 2 — Open a PR from main into release"
gh pr create --base release --head main --title "release: $RELEASE_VERSION" --body "Production release $RELEASE_VERSION"

echo "Merging release PR"
gh pr merge --merge --subject "release: $RELEASE_VERSION"

echo "Step 3 — Tag the release"
git checkout release && git pull origin release
git tag "$RELEASE_VERSION"
git push origin "$RELEASE_VERSION"

echo "Step 4 — Create a GitHub Release"
gh release create "$RELEASE_VERSION" --title "$RELEASE_VERSION" --generate-notes --target release

echo "Step 5 — Sync main"
gh pr create --base main --head release --title "chore: sync release back to main" --body "Post-release sync"
gh pr merge --merge

echo "Release $RELEASE_VERSION complete"
