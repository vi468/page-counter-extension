#!/usr/bin/env bash
# Бамп версии расширения: manifest.json + коммит + тег + push.
#
# Usage: scripts/release.sh <new-version>
# Пример: scripts/release.sh 0.2.0
#
# Что делает:
#  1. Проверяет, что рабочее дерево чистое
#  2. Проверяет, что CHANGELOG.md содержит секцию для новой версии
#  3. Обновляет version в manifest.json
#  4. Коммитит, ставит тег vX.Y.Z, пушит и тег и ветку

set -euo pipefail

NEW_VERSION="${1:-}"
if [[ -z "$NEW_VERSION" ]]; then
  echo "Usage: $0 <new-version>   # e.g. 0.2.0" >&2
  exit 1
fi

if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be X.Y.Z (got '$NEW_VERSION')" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# 1. Чистое дерево
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree not clean. Commit or stash changes first." >&2
  git status --short
  exit 1
fi

# 2. CHANGELOG содержит секцию
if ! grep -qE "^## \[${NEW_VERSION}\]" CHANGELOG.md; then
  echo "Error: CHANGELOG.md must contain '## [${NEW_VERSION}]' section." >&2
  echo "Add release notes before running release.sh." >&2
  exit 1
fi

# 3. Обновить manifest.json
CURRENT_VERSION="$(grep -E '"version"\s*:' manifest.json | head -1 | sed -E 's/.*"version"\s*:\s*"([^"]+)".*/\1/')"
echo "Bumping $CURRENT_VERSION -> $NEW_VERSION"

# Заменяем только первое вхождение "version" в файле
python3 - "$NEW_VERSION" <<'PY'
import json, sys, pathlib
new = sys.argv[1]
p = pathlib.Path("manifest.json")
data = json.loads(p.read_text())
data["version"] = new
p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
PY

# 4. Commit, tag, push
git add manifest.json
git commit -m "chore: release v${NEW_VERSION}"
git tag "v${NEW_VERSION}"
git push origin HEAD
git push origin "v${NEW_VERSION}"

echo
echo "✓ Released v${NEW_VERSION}"
echo "  Create GitHub Release: gh release create v${NEW_VERSION} --generate-notes"
