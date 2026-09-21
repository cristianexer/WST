#!/usr/bin/env bash
set -euo pipefail

# Build locally, then publish only the generated site. No custom GitHub Actions build is required.
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
npm test
npm run build
source_commit="$(git rev-parse --short HEAD)"
publish_dir="$(mktemp -d "${TMPDIR:-/tmp}/wst-pages.XXXXXX")"
rmdir "$publish_dir"
cleanup() {
  git worktree remove --force "$publish_dir" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if git ls-remote --exit-code --heads origin gh-pages >/dev/null 2>&1; then
  git fetch origin gh-pages
  git worktree add --detach "$publish_dir" FETCH_HEAD
else
  git worktree add --detach "$publish_dir" HEAD
  git -C "$publish_dir" switch --orphan gh-pages
fi
rsync -a --delete --exclude=.git --exclude=CNAME "$repo_root/dist/" "$publish_dir/"
touch "$publish_dir/.nojekyll"
git -C "$publish_dir" add --all
if ! git -C "$publish_dir" diff --cached --quiet; then
  git -C "$publish_dir" commit -m "Publish WST build from ${source_commit}"
fi
git -C "$publish_dir" push origin HEAD:refs/heads/gh-pages
