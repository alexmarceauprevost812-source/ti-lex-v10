// ================================================================
// usage-tracking.ts — ti-lex v10
// À intégrer dans tes Edge Functions Supabase (agent-chat, etc.)
// ================================================================
//
// DEUX RPC disponibles dans Supabase :
//   check_quota(p_user_id)           → vérifier AVANT d'appeler Anthropic
//   track_message_usage(...)         → incrémenter APRÈS réponse réussie
//
// ================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
interface QuotaStatus {
  allowed: boolean
  plan: string
  used_today: number
  limit_day: number
  used_month: number
  limit_month: number
  quota_day_ok?: boolean
  quota_month_ok?: boolean
  tokens_total?: number
  tokens_thinking?: number
}

// ----------------------------------------------------------------
// ÉTAPE 1 — Vérifier le quota AVANT d'appeler Anthropic
// ----------------------------------------------------------------
export async function checkQuota(userId: string): Promise<QuotaStatus> {
  const { data, error } = await supabase.rpc('check_quota', {
    p_user_id: userId,
  })

  if (error) {
    console.error('[ti-lex] check_quota error:', error)
    return { allowed: true, plan: 'unknown', used_today: 0, limit_day: 0, used_month: 0, limit_month: 0 }
  }

  return data as QuotaStatus
}

// ----------------------------------------------------------------
// ÉTAPE 2 — Tracker l'usage APRÈS réponse Anthropic réussie
// ----------------------------------------------------------------
export async function trackUsage(
  userId: string,
  tokensTotal: number,
  tokensThinking: number = 0,
  model: string = 'claude-sonnet-4-6'
): Promise<QuotaStatus> {
  const { data, error } = await supabase.rpc('track_message_usage', {
    p_user_id:         userId,
    p_tokens_total:    tokensTotal,
    p_tokens_thinking: tokensThinking,
    p_model:           model,
  })

  if (error) {
    console.error('[ti-lex] track_message_usage error:', error)
    return { allowed: true, plan: 'unknown', used_today: 0, limit_day: 0, used_month: 0, limit_month: 0 }
  }

  return data as QuotaStatus
}

// ----------------------------------------------------------------
// EXEMPLE COMPLET — Intégration dans un handler Edge Function
// ----------------------------------------------------------------
export async function handleAgentChat(req: Request): Promise<Response> {
  const { messages, userId, agentId, model = 'claude-sonnet-4-6' } = await req.json()

  // ── ÉTAPE 1 : Vérifier quota avant d'appeler Anthropic ──────
  const quota = await checkQuota(userId)

  if (!quota.allowed) {
    const reason = !quota.quota_day_ok
      ? `Limite journalière atteinte (${quota.used_today}/${quota.limit_day} messages)`
      : `Limite mensuelle atteinte (${quota.used_month}/${quota.limit_month} messages)`

    return new Response(
      JSON.stringify({
        error: 'quota_exceeded',
        message: reason,
        plan: quota.plan,
        used_today: quota.used_today,
        limit_day: quota.limit_day,
        used_month: quota.used_month,
        limit_month: quota.limit_month,
      }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ── ÉTAPE 2 : Appeler l'API Anthropic ───────────────────────
  let anthropicResponse: Response
  try {
    anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8096,
        messages,
      }),
    })
  } catch (err) {
    console.error('[ti-lex] Anthropic API error:', err)
    return new Response(
      JSON.stringify({ error: 'api_error', message: 'Erreur de connexion à Claude.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const anthropicData = await anthropicResponse.json()

  if (!anthropicResponse.ok) {
    return new Response(
      JSON.stringify({ error: 'anthropic_error', details: anthropicData }),
      { status: anthropicResponse.status, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ── ÉTAPE 3 : Tracker l'usage après succès ──────────────────
  const tokensTotal    = anthropicData.usage?.input_tokens + anthropicData.usage?.output_tokens || 0
  const tokensThinking = 0

  const usageResult = await trackUsage(userId, tokensTotal, tokensThinking, model)

  // ── ÉTAPE 4 : Retourner la réponse au frontend ───────────────
  return new Response(
    JSON.stringify({
      content: anthropicData.content,
      usage: {
        tokens_this_message: tokensTotal,
        used_today:   usageResult.used_today,
        limit_day:    usageResult.limit_day,
        used_month:   usageResult.used_month,
        limit_month:  usageResult.limit_month,
        plan:         usageResult.plan,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
