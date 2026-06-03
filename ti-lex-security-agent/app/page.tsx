// ============================================================================
// app/page.tsx
// Page d'accueil — redirige vers l'agent de sécurité
// ============================================================================
import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold">
        ti-lex <span className="text-tilex-orange">Sécurité</span>
      </h1>
      <p className="max-w-xl text-gray-600">
        Agent de cybersécurité défensive. Produit du Québec, conforme Loi 25.
        Chaque scan requiert un SOW signé et autorisé.
      </p>
      <Link
        href="/agents/security"
        className="rounded-lg bg-tilex-orange px-6 py-3 font-medium text-white transition hover:opacity-90"
      >
        Ouvrir l&apos;agent de sécurité →
      </Link>
    </main>
  );
}
