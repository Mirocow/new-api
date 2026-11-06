#!/bin/bash
set -e

GL_USER="mirocow"
GL_TOKEN="glpat-SPc6k1nEh_wxVmNLmLD2Fm86MQp1OjEwCA.01.0y1r3wqhx"
GL_HOST="192.168.1.2"
GL_BASE="ai/routes/new-api"

cd "/Volumes/Storage/Projects/Dockers/AI Projects/new-api"

REMOTE="http://${GL_USER}:${GL_TOKEN}@${GL_HOST}/${GL_BASE}.git"
git remote set-url origin "${REMOTE}"
git push -u origin main