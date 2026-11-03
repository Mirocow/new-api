#!/bin/bash
set -e
echo "=== Pushing new-api:latest to Nexus ==="
docker push 192.168.1.132:8181/new-api:latest 2>&1
echo "=== Pushing new-api:v1.0.0-rc.50-dev-b614391cc to Nexus ==="
docker push 192.168.1.132:8181/new-api:v1.0.0-rc.50-dev-b614391cc 2>&1
echo "=== DONE ==="
