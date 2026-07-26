"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, CircleAlert, ExternalLink, Search, UserRound } from "lucide-react";
import type { FfePlayerProfile, PlayerTournamentParticipation } from "@/lib/ffe-players/types";
import { Avatar, Card, EmptyState } from "./ui";
import { PlayerGlobalReportView } from "./player-global-report";

type SearchItem = FfePlayerProfile & { clubName?: string; indexedTournamentCount: number };
type SearchPayload = { items: SearchItem[]; pagination: { page: number; pageCount: number; total: number }; error?: string };

export function PlayerSearchPage() {
  const [query, setQuery] = useState("");
  const [payload, setPayload] = useState<SearchPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setPayload(null); setError(""); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/players/search?q=${encodeURIComponent(q)}&pageSize=20`, { signal: controller.signal });
        const body = await response.json() as SearchPayload;
        if (!response.ok) throw new Error(body.error ?? "Recherche indisponible");
        setPayload(body);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "Recherche indisponible");
      } finally { setLoading(false); }
    }, /^[A-Z]\d{5}$/i.test(q) ? 0 : 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  return <div className="plain-page players-page">
    <div className="page-heading">
      <span className="eyebrow"><UserRound/>Annuaire public FFE</span>
      <h1>Rechercher un joueur</h1>
      <p>Retrouvez un profil par nom, prénom ou numéro FFE, puis consultez les tournois déjà indexés.</p>
    </div>
    <Card className="player-search-card">
      <label className="catalog-main-search"><Search/><input autoFocus aria-label="Nom, prénom ou numéro FFE" placeholder="Nom, prénom ou numéro FFE…" value={query} onChange={(event) => setQuery(event.target.value)}/>{loading && <span className="spin">◌</span>}</label>
      <small>Exemples : DUPONT Marie · Marie Dupont · Code FFE. Trois caractères minimum pour un nom.</small>
    </Card>
    {error && <div className="notice warning"><CircleAlert/><p>{error}</p></div>}
    {payload?.items.length === 0 && <EmptyState title="Aucun joueur trouvé">Vérifiez l’orthographe ou utilisez le code FFE exact.</EmptyState>}
    <div className="player-search-results">{payload?.items.map((player) => <a href={`/joueurs/${player.ffeCode}`} className="player-search-result" key={player.ffeCode}>
      <Avatar name={player.displayName}/><div><h2>{player.displayName}</h2><p><strong>{player.ffeCode}</strong>{player.currentClubName ? ` · ${player.currentClubName}` : ""}</p><small>{player.category ?? "Catégorie non publiée"} · Elo {player.standardRating ?? "NC"} · {player.federation ?? "Fédération non publiée"} · {player.indexedTournamentCount} tournoi(s) indexé(s)</small></div><ArrowRight/>
    </a>)}</div>
    <p className="catalog-attribution">Source : Fédération Française des Échecs. EloScope est un service indépendant et n’est pas un service officiel de la FFE.</p>
  </div>;
}

type ProfilePayload = {
  profile: FfePlayerProfile;
  participations: PlayerTournamentParticipation[];
  pagination: { page: number; pageCount: number; total: number };
  coverage: {
    complete: boolean;
    from?: string;
    to?: string;
    indexedTournaments?: number;
    pendingTournaments?: number;
    failedTournaments?: number;
    running?: boolean;
  };
  error?: string;
};

export function PlayerProfilePage({ ffeCode }: { ffeCode: string }) {
  const [includeUnplayed, setIncludeUnplayed] = useState(false);
  const [ratingType, setRatingType] = useState("");
  const [payload, setPayload] = useState<ProfilePayload | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ includeUnplayed: String(includeUnplayed), ...(ratingType ? { ratingType } : {}) });
    fetch(`/api/players/${ffeCode}?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as ProfilePayload;
        if (!response.ok) throw new Error(body.error ?? "Profil indisponible");
        setPayload(body);
      })
      .catch((caught) => { if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "Profil indisponible"); });
    return () => controller.abort();
  }, [ffeCode, includeUnplayed, ratingType]);
  if (error) return <div className="narrow-page"><EmptyState title="Profil indisponible">{error}</EmptyState></div>;
  if (!payload) return <div className="narrow-page"><Card className="empty-state"><strong>Chargement du profil…</strong></Card></div>;
  const { profile } = payload;
  const pageUrl = typeof window === "undefined" ? `/joueurs/${profile.ffeCode}` : window.location.href;
  const mail = `mailto:mail@vincentvallet.com?subject=${encodeURIComponent(`EloScope — erreur ou homonymie ${profile.ffeCode}`)}&body=${encodeURIComponent(`Code FFE : ${profile.ffeCode}\nPage : ${pageUrl}\n\nCorrection demandée :`)}`;
  return <div className="plain-page players-page">
    <a className="back-link" href="/joueurs"><ArrowLeft/>Nouvelle recherche</a>
    <div className="player-profile-head"><Avatar name={profile.displayName}/><div><span className="status-pill">{profile.ffeCode}</span><h1>{profile.displayName}</h1><p>{profile.currentClubName ?? "Club non publié"} · {profile.federation ?? "Fédération non publiée"}</p></div></div>
    <div className="player-rating-grid">
      <Card><small>Elo standard</small><strong>{profile.standardRating ?? "NC"}</strong></Card><Card><small>Rapide</small><strong>{profile.rapidRating ?? "NC"}</strong></Card><Card><small>Blitz</small><strong>{profile.blitzRating ?? "NC"}</strong></Card><Card><small>Catégorie</small><strong>{profile.category ?? "—"}</strong></Card>
    </div>
    <div className="coverage-notice"><CircleAlert/><p>{payload.coverage.complete
      ? `Couverture automatique terminée${payload.coverage.from && payload.coverage.to ? ` pour la période ${payload.coverage.from} à ${payload.coverage.to}` : ""}.`
      : `L’index des participations est progressif${payload.coverage.from && payload.coverage.to ? ` pour la période ${payload.coverage.from} à ${payload.coverage.to}` : ""}${payload.coverage.indexedTournaments ? ` : ${payload.coverage.indexedTournaments} tournoi(s) traité(s)` : ""}. La liste peut être incomplète pendant le traitement historique.`}</p></div>
    <PlayerGlobalReportView ffeCode={profile.ffeCode}/>
    <div className="player-participation-toolbar"><h2>Tournois indexés ({payload.pagination.total})</h2><label>Cadence<select value={ratingType} onChange={(event) => setRatingType(event.target.value)}><option value="">Toutes</option><option value="standard">Lente</option><option value="rapid">Rapide</option><option value="blitz">Blitz</option></select></label><label className="checkbox"><input type="checkbox" checked={includeUnplayed} onChange={(event) => setIncludeUnplayed(event.target.checked)}/>Inclure les inscriptions sans partie jouée</label></div>
    {payload.participations.length === 0 ? <EmptyState title="Aucun tournoi indexé pour le moment">Le profil est reconnu, mais la couverture des participations n’a pas encore atteint ses tournois.</EmptyState> :
      <div className="participation-list">{payload.participations.map((item) => <Card className="participation-card" key={item.id}><div><span className="status-pill">{item.ratingType ?? "Cadence inconnue"}</span><h3>{item.tournamentTitle}</h3><p><CalendarDays/>{item.year ?? "Date non publiée"} · {item.playedRounds ?? 0} partie(s) jouée(s) · score {item.score ?? "—"}</p><small>Classement final : {item.finalRank ?? "—"} · Elo au tournoi : {item.playerRatingAtTournament ?? "NC"}</small></div><a className="button primary" href={`/tournoi/${item.tournamentRef}${item.reportEntryId ? `/joueurs/${item.reportEntryId}` : ""}`}>Voir le rapport<ArrowRight/></a></Card>)}</div>}
    <div className="profile-links"><a href={mail}>Signaler une erreur ou une homonymie</a>{profile.sourceUrl && <a href={profile.sourceUrl} target="_blank" rel="noreferrer">Fiche source FFE<ExternalLink/></a>}</div>
    <p className="catalog-attribution">Source : Fédération Française des Échecs. EloScope ne conserve ni adresse, ni téléphone, ni courriel personnel, ni date de naissance complète.</p>
  </div>;
}

export function PrivacyPage() {
  return <div className="narrow-page"><div className="page-heading"><h1>Données et confidentialité</h1><p>Comment EloScope utilise les données publiques de la FFE.</p></div><Card className="prose-card">
    <h2>Finalité et source</h2><p>La recherche aide à retrouver les participations publiées par la Fédération Française des Échecs et à ouvrir les rapports correspondants. EloScope est indépendant et n’est pas un service officiel de la FFE.</p>
    <h2>Données utilisées</h2><p>Seuls les identifiants sportifs, nom, prénom, club, catégorie, fédération, classements Elo et résultats de tournoi utiles sont traités. Aucune adresse, aucun téléphone, aucun courriel personnel et aucune date de naissance complète ne sont enregistrés.</p>
    <h2>Homonymes et corrections</h2><p>Deux codes FFE différents restent deux personnes distinctes. Les correspondances incertaines sont masquées par défaut. Pour demander une correction, écrivez à <a href="mailto:mail@vincentvallet.com">mail@vincentvallet.com</a>.</p>
  </Card></div>;
}
