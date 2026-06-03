// ============================================================================
// app/agents/security/page.tsx
// Page UI de l'Agent de Sécurité Défensive ti-lex
// ============================================================================
"use client";

import { useEffect, useState } from "react";
import {
  runSecurityScan,
  listAuthorizations,
  type Authorization,
  type ScanResult,
  type ScanType,
} from "@/lib/security-agent";

export default function SecurityAgentPage() {
  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [selectedAuth, setSelectedAuth] = useState<string>("");
  const [target, setTarget] = useState("");
  const [scanType, setScanType] = useState<ScanType>("web_scan");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAuthorizations().then(setAuthorizations);
  }, []);

  async function handleScan() {
    setError(null);
    setResult(null);
    setLoading(true);

    if (!selectedAuth) {
      setError("Choisis une autorisation (SOW) avant de lancer un scan.");
      setLoading(false);
      return;
    }

    if (!target.trim()) {
      setError("La cible est requise.");
      setLoading(false);
      return;
    }

    try {
      const res = await runSecurityScan({
        authorization_id: selectedAuth,
        target: target.trim(),
        scan_type: scanType,
      });

      if (!res.success) {
        setError(res.error ?? "Erreur inconnue");
      } else {
        setResult(res);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const activeAuthorizations = authorizations.filter((a) => a.status === "active");

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Agent de Sécurité Défensive</h1>
        <p className="text-sm text-gray-600">
          ti-lex · Produit du Québec · Conforme Loi 25
        </p>
      </header>

      {/* Bandeau légal — toujours visible */}
      <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
        <strong>⚠️ Rappel légal :</strong> cet agent ne peut scanner que des cibles
        couvertes par un SOW (Statement of Work) signé. Scanner une cible hors-scope
        est passible de 10 ans d'emprisonnement (art. 342.1 du Code criminel).
        L'agent refusera tout scan non autorisé.
      </div>

      {/* Formulaire de scan */}
      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Nouveau scan</h2>

        <div className="space-y-4">
          {/* Sélection autorisation */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Autorisation (SOW signé) *
            </label>
            <select
              className="w-full rounded border px-3 py-2"
              value={selectedAuth}
              onChange={(e) => setSelectedAuth(e.target.value)}
            >
              <option value="">— Choisir un SOW actif —</option>
              {activeAuthorizations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.client_name} (valide jusqu'au{" "}
                  {new Date(a.valid_until).toLocaleDateString("fr-CA")})
                </option>
              ))}
            </select>
            {activeAuthorizations.length === 0 && (
              <p className="mt-1 text-xs text-red-600">
                Aucune autorisation active. Crée un SOW avant de lancer un scan.
              </p>
            )}
          </div>

          {/* Cible */}
          <div>
            <label className="mb-1 block text-sm font-medium">Cible *</label>
            <input
              type="text"
              className="w-full rounded border px-3 py-2"
              placeholder="exemple.com ou https://api.exemple.com"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              La cible doit figurer dans l'allowlist du SOW sélectionné.
            </p>
          </div>

          {/* Type de scan */}
          <div>
            <label className="mb-1 block text-sm font-medium">Type de scan</label>
            <select
              className="w-full rounded border px-3 py-2"
              value={scanType}
              onChange={(e) => setScanType(e.target.value as ScanType)}
            >
              <option value="passive_recon">Reconnaissance passive (OSINT)</option>
              <option value="web_scan">Scan d'application web (OWASP ZAP + Nuclei)</option>
              <option value="vuln_scan">Scan de vulnérabilités infra (Nuclei)</option>
              <option value="config_audit">Audit de configuration</option>
              <option value="dark_web_monitor">Surveillance dark web / fuites</option>
              <option value="full_audit">Audit complet (tous modules)</option>
            </select>
          </div>

          <button
            onClick={handleScan}
            disabled={loading || activeAuthorizations.length === 0}
            className="rounded bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? "Scan en cours..." : "Lancer le scan"}
          </button>
        </div>
      </section>

      {/* Affichage d'erreur */}
      {error && (
        <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      {/* Résultats */}
      {result?.success && (
        <section className="mt-6 rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">
            Résultats du scan{" "}
            <span className="text-sm font-normal text-gray-500">
              ({result.model_used})
            </span>
          </h2>

          {/* Résumé exécutif */}
          <div className="mb-6 rounded-lg bg-blue-50 p-4">
            <h3 className="mb-2 font-medium">Résumé exécutif</h3>
            <p className="whitespace-pre-wrap text-sm">{result.executive_summary}</p>
          </div>

          {/* Compteurs */}
          <div className="mb-6 grid grid-cols-5 gap-2">
            {(["critical", "high", "medium", "low", "info"] as const).map((sev) => (
              <div
                key={sev}
                className={`rounded p-3 text-center ${severityBg(sev)}`}
              >
                <div className="text-2xl font-bold">
                  {result.severity_counts?.[sev] ?? 0}
                </div>
                <div className="text-xs uppercase">{sev}</div>
              </div>
            ))}
          </div>

          {/* Liste des findings */}
          <div className="space-y-3">
            {result.findings?.map((f, idx) => (
              <div key={idx} className="rounded-lg border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-medium">{f.title}</h3>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${severityBg(f.severity)}`}
                  >
                    {f.severity}
                  </span>
                </div>
                <p className="mb-2 text-sm text-gray-700">{f.description}</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <div className="text-xs font-medium uppercase text-gray-500">
                      Impact business
                    </div>
                    <div className="text-sm">{f.business_impact}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase text-gray-500">
                      Pertinence Loi 25
                    </div>
                    <div className="text-sm">{f.loi25_relevance}</div>
                  </div>
                </div>
                <div className="mt-3 border-t pt-3">
                  <div className="text-xs font-medium uppercase text-gray-500">
                    Remédiation ({f.remediation_effort})
                  </div>
                  <div className="text-sm">{f.remediation}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function severityBg(severity: string) {
  switch (severity) {
    case "critical":
      return "bg-red-600 text-white";
    case "high":
      return "bg-orange-500 text-white";
    case "medium":
      return "bg-yellow-400 text-gray-900";
    case "low":
      return "bg-blue-200 text-blue-900";
    case "info":
    default:
      return "bg-gray-200 text-gray-700";
  }
}
