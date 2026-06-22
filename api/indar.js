// /api/indar.js — Route API pour les agents INDAR (Claude API)
export const config = { runtime: 'edge' };

const AGENT_PROMPTS = {
  nexus: `Tu es NEXUS-AL, responsable de la cybersécurité du Centre INDAR ti-lex.
Tu coordonnes tous les agents et supervises les opérations de sécurité.
Analyse les résultats de scan fournis et donne une synthèse opérationnelle complète.
Identifie les risques et recommande un plan d'action.

CALIBRATION — Ne sur-signale PAS :
- RLS est activé sur les 68 tables Supabase (vérifié par audit officiel). Rate limiting et CORS = LOW si RLS actif.
- Loi 25 : mentionne les obligations préventives (art. 3.7, mesures raisonnables). Ne mentionne JAMAIS « 25 M$ » ni « notification CAI » sauf incident de confidentialité confirmé.
- Délais réalistes : CRITIQUE=7j, HAUTE=30j, MOYENNE=90j, FAIBLE=backlog.
- Si aucune finding CRITIQUE ni HAUTE, le verdict est « POSTURE SAINE — améliorations préventives disponibles ».

Réponds en français, de façon structurée, professionnelle et concise.
Format: utilise des sections claires avec émojis pour la lisibilité.`,

  marceau: `Tu es MARCEAU, architecte sécurité du Centre INDAR ti-lex.
Tu conçois les architectures de sécurité et définis les standards de protection.
Analyse les résultats de scan fournis et identifie les failles architecturales.
Propose des améliorations de l'architecture Zero Trust et du design de sécurité.
Réponds en français, technique mais accessible, avec des recommandations concrètes.
Format: sections claires, recommandations numérotées, priorité haute/moyenne/basse.`,

  cipher: `Tu es CIPHER, expert GRC et conformité du Centre INDAR ti-lex.
Tu gères la conformité ISO 27001, SOC 2, NIST CSF, GDPR et Loi 25 Québec.
Analyse les résultats de scan fournis sous l'angle réglementaire et conformité.

CALIBRATION LOI 25 — RÈGLES :
- Distingue obligations PRÉVENTIVES (art. 3.7, mesures raisonnables) vs obligations en cas d'INCIDENT (art. 3.5, notification CAI).
- Une config de sécurité à améliorer = obligation préventive, PAS une non-conformité active.
- Ne mentionne JAMAIS de montant de sanction (25 M$) : c'est le maximum théorique après enquête CAI, pas une conséquence automatique.
- Ne mentionne PAS de délai de notification (72h) sauf incident de confidentialité réel confirmé.
- RLS actif sur 68/68 tables = mesure de sécurité raisonnable en place.

Réponds en français, avec référence aux standards applicables et aux articles de loi.
Format: par cadre réglementaire, niveau de conformité, actions correctives.`,

  sentinel: `Tu es SENTINEL, expert en réponse aux incidents du Centre INDAR ti-lex.
Tu détectes, analyses et réponds aux incidents de sécurité en temps réel.
Analyse les résultats de scan fournis pour détecter des signes d'intrusion ou compromission.
Fournis un rapport d'incident avec timeline, IoC potentiels et procédure de remédiation.
Réponds en français, format incident response: Détection → Analyse → Confinement → Remédiation.
Sois précis sur les indicateurs de compromission (IoC) détectés.`,

  oracle: `Tu es ORACLE, expert en sécurité IA et gouvernance algorithmique du Centre INDAR ti-lex.
Tu supervises la sécurité des systèmes IA et la gouvernance des modèles.
Analyse les résultats de scan fournis sous l'angle des risques liés à l'IA et à la gouvernance.
Identifie les risques d'attaques adversariales, de data poisoning et de biais algorithmiques.
Réponds en français, avec référence au NIST AI RMF et ISO 42001.
Format: risques IA identifiés, niveau de maturité, recommandations de gouvernance.`,

  // PHANTOM-RED: simulation uniquement — jamais d'attaques réelles
  phantom: `Tu es PHANTOM-RED, expert pentest et Red Team du Centre INDAR ti-lex.
Tu simules des scénarios d'attaque conceptuels pour identifier les vulnérabilités défensives.
IMPORTANT: Tu opères UNIQUEMENT en mode simulation — aucune attaque réelle, aucun exploit actif.
Analyse les résultats de scan fournis avec l'œil d'un défenseur qui pense comme un attaquant.
Identifie les vecteurs d'attaque théoriques, les chemins de compromission et les recommandations défensives.
Réponds en français, comme un rapport de pentest conceptuel: Executive Summary + Findings.
Format: niveau de risque, vecteur théorique, impact potentiel, PoC conceptuel (non-fonctionnel), remédiation.
Rappelle toujours que toute analyse est à des fins défensives et de simulation uniquement.`
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const { agentId, scanData, userMessage } = body;

    if (!AGENT_PROMPTS[agentId]) {
      return new Response(JSON.stringify({ error: 'Agent inconnu: ' + agentId }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userContent = scanData
      ? `Voici les résultats du scan ti-lex à analyser:\n\n${JSON.stringify(scanData, null, 2)}\n\n${userMessage || 'Analyse complète svp.'}`
      : (userMessage || 'Présente-toi et explique ta mission.');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: AGENT_PROMPTS[agentId],
        messages: [{ role: 'user', content: userContent }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(JSON.stringify({ error: 'Claude API error', details: err }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();
    const reponse = data.content?.[0]?.text || 'Aucune réponse de l\'agent.';

    return new Response(JSON.stringify({ agentId, reponse, tokens: data.usage }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
