"use client";

import { useState } from "react";

interface BoutonAbonnementProps {
  priceId: string;
  label: string;
}

export default function BoutonAbonnement({
  priceId,
  label,
}: BoutonAbonnementProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });

      const { url, error } = await res.json();
      if (error) throw new Error(error);
      if (url) window.location.href = url;
    } catch (err) {
      console.error("Checkout error:", err);
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
        padding: "15px 28px",
        fontSize: "1rem",
        fontWeight: 700,
        fontFamily: "'Cinzel', serif",
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: "#fff",
        background: loading
          ? "linear-gradient(135deg, #b45309, #92400e)"
          : "linear-gradient(135deg, #f97316, #ea580c)",
        border: "none",
        borderRadius: "13px",
        cursor: loading ? "not-allowed" : "pointer",
        boxShadow: "0 0 24px rgba(249, 115, 22, 0.25)",
        transition: "all 0.25s ease",
        width: "100%",
        opacity: loading ? 0.7 : 1,
      }}
      onMouseEnter={(e) => {
        if (!loading)
          (e.currentTarget.style.filter = "brightness(1.15)");
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = "none";
      }}
    >
      {loading && (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          style={{ animation: "spin 0.8s linear infinite" }}
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="3"
          />
          <path
            d="M12 2a10 10 0 0 1 10 10"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      )}
      {loading ? "Redirection…" : label}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </button>
  );
}
