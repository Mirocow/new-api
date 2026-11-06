#!/bin/bash
set -e

NEXUS_REGISTRY="192.168.1.132:8181"
NEXUS_USER="admin"
NEXUS_PASS="password"
IMAGE_NAME="new-api"
VERSION=$(cat VERSION)

cd "$(dirname "$0")/.."

echo "Building Docker image..."
docker build -t ${NEXUS_REGISTRY}/${IMAGE_NAME}:${VERSION} -t ${NEXUS_REGISTRY}/${IMAGE_NAME}:latest .

echo "Logging into Nexus..."
echo ${NEXUS_PASS} | docker login ${NEXUS_REGISTRY} -u ${NEXUS_USER} --password-stdin

echo "Pushing image..."
docker push ${NEXUS_REGISTRY}/${IMAGE_NAME}:${VERSION}
docker push ${NEXUS_REGISTRY}/${IMAGE_NAME}:latest

echo "Done!"