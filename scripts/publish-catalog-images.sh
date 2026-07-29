#!/bin/zsh

set -u
set -o pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export GIT_TERMINAL_PROMPT=0

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"

NPM_BIN="/opt/homebrew/bin/npm"
GIT_BIN="/usr/bin/git"
CURL_BIN="/usr/bin/curl"

SITE_BASE_URL="https://www.ordstats.net"
MAX_DEPLOY_ATTEMPTS=60
DEPLOY_RETRY_SECONDS=10

cd "$PROJECT_DIR" || exit 1

echo
echo "Downloading missing collection images…"

"$NPM_BIN" run catalog:images -- --download-only
download_exit_code=$?

if [ "$download_exit_code" -ne 0 ]; then
  echo "ERROR: collection image download failed."
  exit "$download_exit_code"
fi

new_images=()

while IFS= read -r image_path; do
  [ -n "$image_path" ] || continue

  extension="${image_path##*.}"

  case "$extension" in
    webp|png|jpg|jpeg|gif|avif|svg)
      new_images+=("$image_path")
      ;;
    *)
      echo \
        "Ignoring unsupported untracked file: " \
        "$image_path"
      ;;
  esac
done < <(
  "$GIT_BIN" ls-files \
    --others \
    --exclude-standard \
    -- public/collection-images
)

if [ "${#new_images[@]}" -eq 0 ]; then
  echo "No new collection image needs deployment."
  echo "Publishing existing local image URLs to Supabase…"

  "$NPM_BIN" run catalog:images -- --publish-local
  exit $?
fi

echo
echo "New collection images:"
printf '  %s\n' "${new_images[@]}"

if ! "$GIT_BIN" diff --cached --quiet --; then
  echo
  echo \
    "ERROR: Git already contains staged changes. " \
    "Automatic image publication was cancelled."
  exit 1
fi

branch="$("$GIT_BIN" branch --show-current)"

if [ "$branch" != "main" ]; then
  echo
  echo \
    "ERROR: current Git branch is '$branch', " \
    "not 'main'."
  exit 1
fi

echo
echo "Checking synchronization with origin/main…"

if ! "$GIT_BIN" fetch --quiet origin main; then
  echo "ERROR: unable to contact GitHub."
  exit 1
fi

counts="$(
  "$GIT_BIN" rev-list \
    --left-right \
    --count \
    origin/main...HEAD
)"

read -r behind ahead <<< "$counts"

if [ "$behind" != "0" ] || [ "$ahead" != "0" ]; then
  echo
  echo \
    "ERROR: local main is not aligned with " \
    "origin/main."
  echo "Behind: $behind"
  echo "Ahead:  $ahead"
  echo \
    "The new image files remain local and " \
    "uncommitted."
  exit 1
fi

echo
echo "Creating an image-only commit…"

if ! "$GIT_BIN" add -- "${new_images[@]}"; then
  echo "ERROR: unable to stage new image files."
  exit 1
fi

if ! "$GIT_BIN" commit \
  -m "Add images for newly ranked collections"
then
  "$GIT_BIN" reset -- "${new_images[@]}" \
    >/dev/null 2>&1 || true

  echo "ERROR: unable to create the image commit."
  exit 1
fi

commit_hash="$("$GIT_BIN" rev-parse --short HEAD)"

echo
echo "Pushing commit $commit_hash to origin/main…"

if ! "$GIT_BIN" push origin main; then
  echo
  echo \
    "ERROR: Git push failed. Restoring the " \
    "pre-commit state so the next run can retry."

  "$GIT_BIN" reset --mixed HEAD~1
  exit 1
fi

echo
echo "Waiting for the images to be available on Vercel…"

for image_path in "${new_images[@]}"; do
  relative_path="${image_path#public/}"
  image_url="$SITE_BASE_URL/$relative_path"

  ready=0
  attempt=1

  while [ "$attempt" -le "$MAX_DEPLOY_ATTEMPTS" ]; do
    if "$CURL_BIN" \
      --fail \
      --silent \
      --location \
      --max-time 20 \
      --output /dev/null \
      "${image_url}?deploy=${commit_hash}"
    then
      ready=1
      break
    fi

    echo \
      "Waiting for ${relative_path} " \
      "($attempt/$MAX_DEPLOY_ATTEMPTS)…"

    sleep "$DEPLOY_RETRY_SECONDS"
    attempt=$((attempt + 1))
  done

  if [ "$ready" -ne 1 ]; then
    echo
    echo \
      "ERROR: image is still unavailable after " \
      "waiting for the Vercel deployment:"
    echo "$image_url"
    echo
    echo \
      "Supabase was not updated with the new " \
      "local image URLs."
    exit 1
  fi

  echo "Available: $image_url"
done

echo
echo "Publishing local image URLs to Supabase…"

"$NPM_BIN" run catalog:images -- --publish-local
publish_exit_code=$?

if [ "$publish_exit_code" -ne 0 ]; then
  echo \
    "ERROR: images were deployed, but Supabase " \
    "publication failed."
  exit "$publish_exit_code"
fi

echo
echo "Collection images successfully deployed and published."
