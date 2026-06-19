#!/bin/bash
# push-securise.sh
# Usage: bash scripts/push-securise.sh "message de commit" [branche]

MESSAGE=${1:-"feat: mise à jour via ti-lex + Codex"}
BRANCHE=${2:-"main"}

echo ""
echo "🚀 PUSH SÉCURISÉ — ti-lex"
echo "========================="
echo "Branche : $BRANCHE"
echo "Message : $MESSAGE"
echo ""

# 1. Scanner d'abord
bash scripts/scan-avant-deploy.sh
if [ $? -ne 0 ]; then
  echo ""
  echo "🛑 Push annulé — Corriger les erreurs d'abord."
  exit 1
fi

# 2. Git add + commit + push
echo ""
echo "📦 Commit en cours..."
git add -A
DIFF=$(git diff --cached --stat)
if [ -z "$DIFF" ]; then
  echo "⚠️  Rien à committer — workspace propre."
else
  echo "$DIFF"
  git commit -m "$MESSAGE"
fi

echo ""
echo "📤 Push vers GitHub ($BRANCHE)..."
git push origin "$BRANCHE"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Push réussi!"
  echo "🌐 Vercel déploiement en cours automatiquement..."
  echo "========================="
else
  echo ""
  echo "❌ Erreur de push. Vérifier connexion GitHub."
  exit 1
fi
