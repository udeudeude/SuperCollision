#!/usr/bin/env bash
# Publish a compiled, tested Sounds + LibriVox PR as a disposable Pages preview.
# Never touch the production pages-build ref. The checkout already contains the
# staged, browser-tested files and the compiled WebAssembly runtime.
set -euo pipefail

if [ "$#" -ne 4 ]; then
  echo "Usage: publish_sounds_preview.sh SITE_DIR SOURCE_BRANCH SOURCE_SHA PR_NUMBER" >&2
  exit 2
fi
site=$1
source_branch=$2
source_sha=$3
pr_number=$4
if ! [[ $source_sha =~ ^[[:xdigit:]]{40}$ && $pr_number =~ ^[1-9][0-9]*$ && $source_branch =~ ^[a-zA-Z0-9._/-]+$ ]]; then
  echo "Refusing invalid preview identifiers" >&2
  exit 2
fi

cd "$site"
if ! git rev-parse --is-inside-work-tree | grep -qx true; then
  echo "Preview needs a Git checkout" >&2
  exit 2
fi
if [ ! -f runtime/sclang/sclang.js ] || [ ! -f runtime/scsynth/scsynth.js ]; then
  echo "Refusing a preview without the compiled SuperCollider runtime" >&2
  exit 2
fi

source_head=$(git ls-remote --heads origin "refs/heads/$source_branch" | awk '{print $1}')
if [ "$source_head" != "$source_sha" ]; then
  echo "Source branch has moved or disappeared; skip stale preview for $source_sha"
  exit 0
fi
pages_head=$(git ls-remote --heads origin refs/heads/pages-build | awk '{print $1}')
if [ -z "$pages_head" ] || [ "$(git rev-parse HEAD)" != "$pages_head" ]; then
  echo "Production base advanced after staging; refusing a stale compiled preview" >&2
  exit 1
fi

# Only stage the exact release payload. The Code page, service worker, compiled
# engine, and user storage remain inherited and untouched from pages-build.
git add -- sounds.html sounds-lab.html sounds-*.mjs \
  librivox-explorer.html librivox-explorer.css librivox-*.mjs lab-offline-assets.json
while IFS= read -r changed; do
  case "$changed" in
    sounds.html|sounds-lab.html|sounds-*.mjs|librivox-explorer.html|librivox-explorer.css|librivox-*.mjs|lab-offline-assets.json) ;;
    *) echo "Refusing unexpected staged path: $changed" >&2; exit 1 ;;
  esac
done < <(git diff --cached --name-only)
if [ -n "$(git diff --name-only)" ]; then
  echo "Refusing unexpected unstaged changes to the compiled site" >&2
  exit 1
fi
if git diff --cached --quiet; then
  echo "Production already has the tested Sounds assets; no preview differences"
  exit 0
fi

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
preview_branch="pages-preview-sounds-pr-$pr_number"
preview_ref="refs/heads/$preview_branch"
git switch -c "$preview_branch"
git commit -m "Preview Sounds + LibriVox PR #$pr_number at $source_sha"

# Protect other runs. Only replace this PR's disposable preview branch, and
# only when its remote head is exactly the one we observed.
old_preview_head=$(git ls-remote --heads origin "$preview_ref" | awk '{print $1}')
latest_source=$(git ls-remote --heads origin "refs/heads/$source_branch" | awk '{print $1}')
latest_pages=$(git ls-remote --heads origin refs/heads/pages-build | awk '{print $1}')
if [ "$latest_source" != "$source_sha" ] || [ "$latest_pages" != "$pages_head" ]; then
  echo "Source or production changed while preparing preview; no branch updated" >&2
  exit 1
fi
git push --force-with-lease="$preview_ref:$old_preview_head" origin "HEAD:$preview_ref"
echo "Published isolated compiled preview branch: $preview_branch"
