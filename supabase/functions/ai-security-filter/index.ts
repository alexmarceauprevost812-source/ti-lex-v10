import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getIdentifier, tooManyRequests } from "../_shared/rate-limit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

let _cors: Record<string, string>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ..._cors, "Content-Type": "application/json" },
  });
}

const SECRET_PATTERNS: Array<{ pattern: RegExp; name: string; severity: string }> = [
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, name: "openai_api_key", severity: "critical" },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, name: "github_pat", severity: "critical" },
  { pattern: /gho_[a-zA-Z0-9]{36}/g, name: "github_oauth", severity: "critical" },
  { pattern: /ghu_[a-zA-Z0-9]{36}/g, name: "github_user_token", severity: "critical" },
  { pattern: /glpat-[a-zA-Z0-9\-_]{20}/g, name: "gitlab_pat", severity: "critical" },
  { pattern: /AKIA[0-9A-Z]{16}/g, name: "aws_access_key", severity: "critical" },
  { pattern: /xoxb-[0-9]{11}-[0-9]{11}-[a-zA-Z0-9]{24}/g, name: "slack_bot_token", severity: "critical" },
  { pattern: /sk-ant-[a-zA-Z0-9\-_]{40,}/g, name: "anthropic_key", severity: "critical" },
  { pattern: /\b(?:\d[ -]?){13,16}\b/g, name: "credit_card", severity: "critical" },
  { pattern: /[A-Z_]{3,}=[a-zA-Z0-9\-_./]{8,}/g, name: "env_variable", severity: "high" },
  { pattern: /password\s*[:=]\s*['"]?[^\s'"]{6,}/gi, name: "password_in_text", severity: "critical" },
  { pattern: /passwd\s*[:=]\s*['"]?[^\s'"]{6,}/gi, name: "passwd_in_text", severity: "critical" },
  { pattern: /private[_\s]?key\s*[:=]/gi, name: "private_key_label", severity: "critical" },
];

const ILLEGAL_GROUPS: Array<{ keywords: string[]; category: string; severity: string }> = [
  {
    keywords: ["sql injection", "xss attack", "ddos", "botnet", "ransomware", "keylogger", "rootkit", "zero-day exploit", "reverse shell", "privilege escalation"],
    category: "cyberattack", severity: "critical",
  },
  {
    keywords: ["synthèse de drogue", "drug synthesis", "fabriquer de la drogue", "how to make meth", "crystal meth", "cook heroin", "fentanyl synthesis"],
    category: "drug_synthesis", severity: "critical",
  },
  {
    keywords: ["fabriquer une bombe", "make a bomb", "improvised explosive", "weapon instructions", "make a gun untraceable", "ghost gun"],
    category: "weapons", severity: "critical",
  },
  {
    keywords: ["child porn", "cp links", "csam", "underage sexual", "minor sexual"],
    category: "csam", severity: "critical",
  },
  {
    keywords: ["carding", "card dumps", "stolen credit cards", "fake id generator", "money laundering steps", "phishing kit", "scam page template"],
    category: "financial_fraud", severity: "critical",
  },
  {
    keywords: ["dox someone", "doxxing", "find someone home address", "stalking tools", "how to stalk", "revenge porn"],
    category: "harassment", severity: "high",
  },
];

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |previous |above |your )?instructions/gi,
  /forget (everything|all instructions|your system prompt)/gi,
  /you are now (DAN|jailbreak|unrestricted|evil|without rules)/gi,
  /act as (if you have no|an unrestricted|a jailbroken|DAN)/gi,
  /\[system\].*override/gi,
  /bypass (your|all|safety|content) (filter|restriction|limit|policy)/gi,
  /pretend (you have no|there are no|without any) (rules|limits|restrictions|guidelines)/gi,
  /disregard (your|all|previous) (training|guidelines|instructions|ethics)/gi,
];

const SECURITY_SYSTEM_PROMPT = `Tu es l'assistant IA de ti-lex, une plateforme québécoise de développement.

## RÈGLES DE SÉCURITÉ ABSOLUES

### Protection des secrets
- Ne jamais révéler, répéter ou confirmer des clés API, tokens, mots de passe ou variables d'environnement
- Si tu détectes un secret dans la conversation, masque-le avec [REDACTED]
- Ne jamais aider à extraire des credentials d'un système

### Activités interdites
- Ne jamais aider à créer des malwares, virus, ransomwares ou outils de hacking offensif
- Ne jamais fournir d'instructions pour synthétiser des drogues ou des explosifs
- Ne jamais générer du contenu sexuel impliquant des mineurs
- Ne jamais aider à la fraude financière, au harcèlement ou au doxxing

### Ce que tu peux faire
- Aider au développement logiciel légitime, incluant la sécurité défensive
- Expliquer comment les attaques fonctionnent à des fins éducatives (sans code exploitable)
- Discuter de cryptographie, sécurité et bonnes pratiques

Tu opères au Québec, Canada. Respecte les lois canadiennes et québécoises.`;

function checkSecrets(text: string): { found: boolean; pattern?: string; severity?: string } {
  for (const { pattern, name, severity } of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    if (regex.test(text)) return { found: true, pattern: name, severity };
  }
  return { found: false };
}

function checkIllegal(text: string): { found: boolean; category?: string; severity?: string } {
  const lower = text.toLowerCase();
  for (const { keywords, category, severity } of ILLEGAL_GROUPS) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return { found: true, category, severity };
    }
  }
  return { found: false };
}

function checkInjection(text: string): { found: boolean; pattern?: string } {
  for (const p of INJECTION_PATTERNS) {
    const regex = new RegExp(p.source, p.flags);
    if (regex.test(text)) return { found: true, pattern: p.source };
  }
  return { found: false };
}

function redactSecrets(text: string): string {
  let out = text;
  for (const { pattern } of SECRET_PATTERNS) {
    out = out.replace(new RegExp(pattern.source, pattern.flags), "[🔒 REDACTED]");
  }
  return out;
}

async function logViolation(
  sb: ReturnType<typeof createClient>,
  data: {
    user_id?: string;
    session_id?: string;
    violation_type: string;
    violation_category: string;
    severity: string;
    original_input?: string;
    trigger_pattern?: string;
    ip_address?: string;
    user_agent?: string;
  },
) {
  try {
    await sb.from("security_logs").insert({
      ...data,
      original_input: data.original_input?.slice(0, 500),
    });
  } catch (e) {
    console.error("[ai-security-filter] log failed:", e);
  }
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  _cors = corsHeaders(req);
  if (req.method !== "POST") return json({ error: "POST uniquement" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Non autorisé" }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return json({ error: "Session invalide" }, 401);

  const rl = await checkRateLimit(getIdentifier(req, user.id), {
    prefix: "ai-security-filter",
    max: 15,
    windowSec: 60,
  });
  if (!rl.allowed) return tooManyRequests(rl, _cors);

  let body: {
    messages: Array<{ role: string; content: string }>;
    system?: string;
    model?: string;
    max_tokens?: number;
    session_id?: string;
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON invalide" }, 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: "messages requis" }, 400);
  }

  const ipAddress = req.headers.get("x-forwarded-for") || "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";
  const userId = user.id;
  const lastUserMsg = body.messages.filter((m) => m.role === "user").slice(-1)[0]?.content || "";

  // Phase 1A: Prompt injection
  const injCheck = checkInjection(lastUserMsg);
  if (injCheck.found) {
    await logViolation(sb, {
      user_id: userId,
      session_id: body.session_id,
      violation_type: "input_blocked",
      violation_category: "prompt_injection",
      severity: "high",
      original_input: lastUserMsg,
      trigger_pattern: injCheck.pattern,
      ip_address: ipAddress,
      user_agent: userAgent,
    });
    return json({
      blocked: true,
      reason: "prompt_injection",
      message: "🛡️ Tentative de manipulation de l'IA détectée et bloquée.",
    }, 403);
  }

  // Phase 1B: Illegal content
  const illCheck = checkIllegal(lastUserMsg);
  if (illCheck.found) {
    await logViolation(sb, {
      user_id: userId,
      session_id: body.session_id,
      violation_type: "input_blocked",
      violation_category: illCheck.category!,
      severity: illCheck.severity!,
      original_input: lastUserMsg,
      trigger_pattern: illCheck.category,
      ip_address: ipAddress,
      user_agent: userAgent,
    });
    return json({
      blocked: true,
      reason: "illegal_content",
      category: illCheck.category,
      message: `🚫 Cette demande ne peut pas être traitée par ti-lex (${illCheck.category}).`,
    }, 403);
  }

  // Phase 1C: Secrets in input → redact before sending to model
  const secretCheck = checkSecrets(lastUserMsg);
  if (secretCheck.found) {
    await logViolation(sb, {
      user_id: userId,
      session_id: body.session_id,
      violation_type: "input_blocked",
      violation_category: "secrets",
      severity: secretCheck.severity!,
      original_input: lastUserMsg,
      trigger_pattern: secretCheck.pattern,
      ip_address: ipAddress,
      user_agent: userAgent,
    });
    body.messages = body.messages.map((msg) => ({
      ...msg,
      content: msg.role === "user" ? redactSecrets(msg.content) : msg.content,
    }));
  }

  // Phase 2: Call Anthropic with security system prompt
  const systemPrompt = SECURITY_SYSTEM_PROMPT +
    (body.system ? `\n\n## Instructions additionnelles\n${body.system}` : "");

  let aiRes: Response;
  try {
    aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: body.model || "claude-sonnet-4-6",
        max_tokens: Math.min(body.max_tokens || 4096, 8192),
        system: systemPrompt,
        messages: body.messages,
      }),
    });
  } catch (e) {
    return json({ error: "Impossible de joindre le service IA", details: String(e) }, 502);
  }

  const aiData = await aiRes.json();
  if (!aiRes.ok) {
    return json({ error: "Erreur service IA", details: aiData }, aiRes.status);
  }

  // Phase 3: Check outputs
  const outputText = aiData.content
    ?.filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("") || "";

  // 3A: Secrets in output → redact
  const outSecretCheck = checkSecrets(outputText);
  if (outSecretCheck.found) {
    await logViolation(sb, {
      user_id: userId,
      session_id: body.session_id,
      violation_type: "output_blocked",
      violation_category: "secrets",
      severity: outSecretCheck.severity!,
      original_input: outputText.slice(0, 200),
      trigger_pattern: outSecretCheck.pattern,
      ip_address: ipAddress,
      user_agent: userAgent,
    });
    if (aiData.content) {
      aiData.content = aiData.content.map((block: { type: string; text?: string }) => {
        if (block.type === "text" && block.text) {
          return { ...block, text: redactSecrets(block.text) };
        }
        return block;
      });
    }
    aiData._security_warning = "Des informations sensibles ont été masquées automatiquement.";
  }

  // 3B: Illegal content in output
  const outIllegalCheck = checkIllegal(outputText);
  if (outIllegalCheck.found) {
    await logViolation(sb, {
      user_id: userId,
      session_id: body.session_id,
      violation_type: "output_blocked",
      violation_category: outIllegalCheck.category!,
      severity: outIllegalCheck.severity!,
      original_input: outputText.slice(0, 200),
      ip_address: ipAddress,
      user_agent: userAgent,
    });
    return json({
      blocked: true,
      reason: "unsafe_output",
      message: "🛡️ La réponse générée contenait du contenu non autorisé et a été bloquée.",
    }, 403);
  }

  return json(aiData);
});
