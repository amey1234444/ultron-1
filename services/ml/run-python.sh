#!/bin/sh
# Run this service's Python, with the interpreter and library path it needs.
#
# Two things make a bare `python -m pytest` the wrong command here.
#
# `python` is not a command on a stock macOS with a Homebrew Python — only
# `python3` is — so the npm scripts that called it failed outright. Where it
# does exist it is usually the system interpreter, which has none of this
# service's pinned packages, so the tests would run against a different set of
# versions than the service itself does.
#
# LightGBM links against libomp, which Homebrew installs outside the dynamic
# loader's default search path. Without DYLD_LIBRARY_PATH the import fails at
# load time and every model-backed test errors before it starts.
#
# The virtualenv is preferred, python3 is the fallback, and `python` is last
# so this still works on a machine where that is the only name available.
set -e
dir=$(cd "$(dirname "$0")" && pwd)

if [ -x "$dir/.venv/bin/python" ]; then
  interpreter="$dir/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  interpreter=python3
else
  interpreter=python
fi

if [ -d /opt/homebrew/opt/libomp/lib ]; then
  DYLD_LIBRARY_PATH="/opt/homebrew/opt/libomp/lib${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
  export DYLD_LIBRARY_PATH
fi

exec "$interpreter" "$@"
