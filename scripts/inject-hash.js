// scripts/inject-hash.js
// Remplace __BUILD_HASH__ dans tous les fichiers HTML par un hash unique.
// Lancé automatiquement avant chaque deploy (voir package.json).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BUILD_HASH = crypto
  .createHash('md5')
  .update(Date.now().toString() + Math.random().toString())
  .digest('hex')
  .slice(0, 8);

const HTML_DIRS = ['.', 'public', 'pages'];

let count = 0;
HTML_DIRS.forEach(function(dir) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir)
    .filter(function(f) { return f.endsWith('.html'); })
    .forEach(function(file) {
      var fullPath = path.join(dir, file);
      var content = fs.readFileSync(fullPath, 'utf8');
      var updated = content.replace(/__BUILD_HASH__/g, BUILD_HASH);
      if (updated !== content) {
        fs.writeFileSync(fullPath, updated);
        count++;
        console.log('[inject-hash] ✅ ' + fullPath + ' → ?v=' + BUILD_HASH);
      }
    });
});

console.log('[inject-hash] Hash ' + BUILD_HASH + ' injecté dans ' + count + ' fichier(s).');
