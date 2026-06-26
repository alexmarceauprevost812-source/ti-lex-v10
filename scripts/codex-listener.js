// codex-listener.js
// Lance dans le terminal Codex : node scripts/codex-listener.js
// Surveille la table codex_queue et écrit les fichiers reçus sur disque.

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const DOSSIER_INSTRUCTIONS = path.resolve('codex-instructions')
fs.mkdirSync(DOSSIER_INSTRUCTIONS, { recursive: true })

async function traiterInstruction(item) {
  console.log(`\n📋 Nouvelle instruction : ${item.titre}`)

  const cheminMD = path.join(
    DOSSIER_INSTRUCTIONS,
    `${item.id.slice(0, 8)}-${item.titre.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_àâäéèêëïîôùûüç]/gi, '')}.md`
  )
  fs.writeFileSync(cheminMD, item.instruction, 'utf8')
  console.log(`📄 Instruction écrite : ${cheminMD}`)

  if (Array.isArray(item.fichiers) && item.fichiers.length > 0) {
    for (const f of item.fichiers) {
      const chemin = path.resolve(f.chemin)
      fs.mkdirSync(path.dirname(chemin), { recursive: true })
      fs.writeFileSync(chemin, f.contenu, 'utf8')
      console.log(`📁 Fichier injecté : ${f.chemin}`)
    }
  }

  console.log(`\n👉 Claude Code : lire "${cheminMD}" et implémenter.`)
  console.log(`   Ensuite : npm run deploy\n`)
}

async function poll() {
  try {
    const { data, error } = await supabase
      .from('codex_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)

    if (error) { console.error('Erreur poll:', error.message); return }
    if (!data || data.length === 0) return

    const item = data[0]
    await supabase.from('codex_queue').update({ status: 'processing' }).eq('id', item.id)

    try {
      await traiterInstruction(item)
      await supabase.from('codex_queue').update({
        status: 'done',
        traite_le: new Date().toISOString()
      }).eq('id', item.id)
    } catch (err) {
      await supabase.from('codex_queue').update({
        status: 'error',
        log_erreur: err.message
      }).eq('id', item.id)
      console.error('❌ Erreur traitement:', err.message)
    }
  } catch (err) {
    console.error('Erreur inattendue:', err.message)
  }
}

console.log('🤖 Codex Listener démarré — polling toutes les 5 secondes...')
setInterval(poll, 5000)
poll()
