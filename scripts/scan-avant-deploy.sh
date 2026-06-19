#!/bin/bash
# scan-avant-deploy.sh
# Vérifie le code avant de pousser sur GitHub
# Usage: bash scripts/scan-avant-deploy.sh

echo ""
echo "🔍 SCAN PRÉ-DÉPLOIEMENT — ti-lex"
echo "================================="
ERREURS=0

# --- 1. Vérification syntaxe JavaScript ---
echo ""
echo "📜 Vérification JavaScript..."
for f in $(find . -name "*.js" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/scripts/*"); do
  RESULTAT=$(node --check "$f" 2>&1)
  if [ $? -ne 0 ]; then
    echo "  ❌ Erreur JS dans : $f"
    echo "     $RESULTAT"
    ERREURS=$((ERREURS+1))
  else
    echo "  ✅ OK : $f"
  fi
done

# --- 2. Vérification HTML (balises non fermées basique) ---
echo ""
echo "📄 Vérification HTML..."
for f in $(find . -name "*.html" -not -path "*/node_modules/*" -not -path "*/.git/*"); do
  if [ ! -s "$f" ]; then
    echo "  ⚠️  Fichier HTML vide : $f"
    ERREURS=$((ERREURS+1))
    continue
  fi
  if ! grep -q "<html" "$f"; then
    echo "  ❌ Pas de balise <html> dans : $f"
    ERREURS=$((ERREURS+1))
  else
    echo "  ✅ OK : $f"
  fi
done

# --- 3. Vérification CSS (accolades équilibrées) ---
echo ""
echo "🎨 Vérification CSS..."
for f in $(find . -name "*.css" -not -path "*/node_modules/*" -not -path "*/.git/*"); do
  OPEN=$(grep -o '{' "$f" | wc -l)
  CLOSE=$(grep -o '}' "$f" | wc -l)
  if [ "$OPEN" != "$CLOSE" ]; then
    echo "  ❌ Accolades déséquilibrées dans : $f (ouvertes: $OPEN / fermées: $CLOSE)"
    ERREURS=$((ERREURS+1))
  else
    echo "  ✅ OK : $f"
  fi
done

# --- 4. Vérification clés Supabase exposées ---
echo ""
echo "🔑 Vérification clés Supabase dans le code..."
if grep -rn "SUPABASE_SERVICE_ROLE_KEY" . --include="*.js" --include="*.html" \
   --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=scripts \
   --exclude-dir=supabase 2>/dev/null | grep -v "process.env\|import.meta.env\|Deno.env" | grep -q "eyJ"; then
  echo "  ❌ ATTENTION : Clé service_role exposée en dur dans le code!"
  ERREURS=$((ERREURS+1))
else
  echo "  ✅ Aucune clé service_role exposée détectée"
fi

# --- Résultat final ---
echo ""
echo "================================="
if [ $ERREURS -eq 0 ]; then
  echo "✅ SCAN RÉUSSI — Code propre — Prêt pour GitHub"
  echo "================================="
  exit 0
else
  echo "❌ SCAN ÉCHOUÉ — $ERREURS erreur(s) trouvée(s)"
  echo "   Corriger avant de pousser sur GitHub."
  echo "================================="
  exit 1
fi
