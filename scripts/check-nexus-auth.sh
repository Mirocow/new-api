#!/bin/bash
# Check if Docker already has auth for Nexus registry
CONFIG="${HOME}/.docker/config.json"
if [ -f "$CONFIG" ]; then
  AUTH=$(python3 -c "
import json
with open('$CONFIG') as f:
    d = json.load(f)
auths = d.get('auths', {})
if '192.168.1.132:8181' in auths:
    print('AUTH_EXISTS')
else:
    print('NO_AUTH')
" 2>/dev/null)
  echo "$AUTH"
else
  echo "NO_CONFIG"
fi
