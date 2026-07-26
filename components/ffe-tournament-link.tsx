"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleAlert, Info, Link2 } from "lucide-react";
import { FFE_TOURNAMENT_URL_ERROR, normalizeFfeTournamentUrl } from "@/lib/ffe-url";
import { Card } from "./ui";

export function FfeTournamentLinkCard() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const openReport = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const normalized = normalizeFfeTournamentUrl(input);
      setError("");
      router.push(`/tournoi/${normalized.ref}`);
    } catch {
      setError(FFE_TOURNAMENT_URL_ERROR);
    }
  };

  return <section className="ffe-link-section" aria-labelledby="ffe-link-title">
    <div className="search-divider"><span>ou</span></div>
    <Card className="ffe-link-card">
      <div className="ffe-link-copy">
        <span className="ffe-link-icon"><Link2/></span>
        <div>
          <p className="eyebrow">Vous avez déjà le lien FFE du tournoi ?</p>
          <h2 id="ffe-link-title">Lien du tournoi FFE</h2>
          <p>Collez le lien de la fiche du tournoi publié sur le site de la Fédération Française des Échecs.</p>
        </div>
      </div>
      <form onSubmit={openReport} noValidate>
        <label htmlFor="ffe-tournament-url">Lien du tournoi FFE</label>
        <div className="ffe-link-controls">
          <input
            id="ffe-tournament-url"
            type="url"
            inputMode="url"
            autoComplete="url"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              if (error) setError("");
            }}
            aria-invalid={!!error}
            aria-describedby={error ? "ffe-link-error" : "ffe-link-help"}
            placeholder="https://echecs.asso.fr/FicheTournoi.aspx?Ref=IDENTIFIANT_DU_TOURNOI"
          />
          <button className="button primary" type="submit">Voir le rapport<ArrowRight/></button>
        </div>
        <p className="field-help" id="ffe-link-help"><Info/>Le rapport partagé s’ouvrira directement ou sera préparé automatiquement.</p>
        {error && <p className="field-error" id="ffe-link-error" role="alert"><CircleAlert/>{error}</p>}
      </form>
    </Card>
  </section>;
}
