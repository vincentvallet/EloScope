"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { Activity, BarChart3, CalendarDays, Check, ExternalLink, RefreshCcw, Search, ShieldCheck, Swords, Trophy } from "lucide-react";
import { EChart } from "./echart";
import { Card, EmptyState } from "./ui";
import type { FideRatingType, PlayerGlobalReport, PlayerReportMetadata } from "@/lib/fide/types";

type Payload = { state: string; report?: PlayerGlobalReport | null; metadata?: PlayerReportMetadata; error?: string };
type Tab = "overview" | "ratings" | "events" | "games" | "compare" | "opponent";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Vue d’ensemble" },
  { id: "ratings", label: "Progression Elo" },
  { id: "events", label: "Tournois et compétitions" },
  { id: "games", label: "Parties classées" },
  { id: "compare", label: "Comparaison" },
  { id: "opponent", label: "Adversaire" },
];

export function PlayerGlobalReportView({ ffeCode }: { ffeCode: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [active, setActive] = useState<Tab>("overview");
  const [ratingType, setRatingType] = useState<FideRatingType>("standard");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [pollToken, setPollToken] = useState(0);
  const load = useCallback(async () => {
    const response = await fetch(`/api/players/${ffeCode}/global-report`);
    const body = await response.json() as Payload;
    setPayload(body);
    return body;
  }, [ffeCode]);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const body = await load();
        if (!cancelled && ["queued", "pending", "building", "partial"].includes(body.state)) timer = setTimeout(refresh, 2500);
      } catch {}
    };
    refresh();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [load, pollToken]);
  const generate = async () => {
    setGenerating(true); setError("");
    try {
      const response = await fetch(`/api/players/${ffeCode}/global-report/generate`, { method: "POST" });
      const body = await response.json() as Payload;
      if (!response.ok && body.state !== "error") throw new Error(body.error ?? "Génération indisponible");
      setPayload(body);
      if (["queued", "pending", "building"].includes(body.state)) setPollToken((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Génération indisponible");
    } finally { setGenerating(false); }
  };
  if (!payload?.report) {
    const progress = payload?.metadata?.progress ?? 0;
    return <Card className="global-report-launch">
      <div><span className="eyebrow"><ShieldCheck/>Données sportives officielles FFE + FIDE</span><h2>Rapport global du joueur</h2>
        <p>Classements mensuels, compétitions et statistiques de carrière, mis en cache pour tous les visiteurs.</p></div>
      {payload?.metadata && <div className="global-build-progress" role="status"><div><span style={{ width: `${progress}%` }}/></div><p>{payload.metadata.currentStep ?? "Préparation"} · {progress} %</p></div>}
      {error && <p className="form-error">{error}</p>}
      <button className="button primary" onClick={generate} disabled={generating}>
        <RefreshCcw className={generating ? "spin" : ""}/>{generating ? "Construction en cours…" : payload?.metadata ? "Reprendre la construction" : "Construire le rapport global"}
      </button>
      <small>Traitement progressif, une requête FIDE à la fois. Les données FFE restent disponibles si la FIDE répond lentement.</small>
    </Card>;
  }
  const report = payload.report;
  return <section className="global-report">
    <div className="global-report-title"><div><span className="eyebrow"><ShieldCheck/>Rapport global partagé</span><h2>Carrière FFE + FIDE</h2><p>Mis à jour le {new Date(report.generatedAt).toLocaleDateString("fr-FR")}</p></div>
      <a href={report.player.sourceUrl} target="_blank" rel="noreferrer" className="button">Profil FIDE<ExternalLink/></a></div>
    <div className="player-report-tabs" role="tablist" aria-label="Sections du rapport">
      {tabs.map((tab) => <button role="tab" aria-selected={active === tab.id} className={active === tab.id ? "active" : ""} onClick={() => setActive(tab.id)} key={tab.id}>{tab.label}</button>)}
    </div>
    <div role="tabpanel">
      {active === "overview" && <Overview report={report}/>}
      {active === "ratings" && <Ratings report={report} type={ratingType} setType={setRatingType}/>}
      {active === "events" && <Events report={report}/>}
      {active === "games" && <Games report={report}/>}
      {active === "compare" && <Compare ffeCode={ffeCode}/>}
      {active === "opponent" && <OpponentScout ffeCode={ffeCode}/>}
    </div>
    <div className="report-provenance">{report.provenance.map((item) => <p key={item.source}><strong>{item.source}</strong> — {item.note} <a href={item.url} target="_blank" rel="noreferrer">Source<ExternalLink/></a></p>)}</div>
  </section>;
}

function Overview({ report }: { report: PlayerGlobalReport }) {
  return <div className="global-overview">
    <div className="player-rating-grid">
      <Card><small>Elo FIDE standard</small><strong>{report.player.standardRating ?? "NC"}</strong></Card>
      <Card><small>Rapide FIDE</small><strong>{report.player.rapidRating ?? "NC"}</strong></Card>
      <Card><small>Blitz FIDE</small><strong>{report.player.blitzRating ?? "NC"}</strong></Card>
      <Card><small>Statut</small><strong>{report.player.active ? "Actif" : "Inactif"}</strong></Card>
    </div>
    <div className="global-kpis">
      <Card><Activity/><small>Parties classées détaillées</small><strong>{report.statistics.ratedGames}</strong></Card>
      <Card><Trophy/><small>Pic standard</small><strong>{report.statistics.peakStandard ?? "—"}</strong></Card>
      <Card><CalendarDays/><small>Tournois FFE indexés</small><strong>{report.participations.length}</strong></Card>
    </div>
    <Card className="career-summary"><h3>Synthèse calculée</h3>{report.summary.map((line) => <p key={line}>{line}</p>)}</Card>
    <div className="coverage-notice"><Check/><p>Couverture FIDE : {report.coverage.oldestPeriod ?? "—"} à {report.coverage.newestPeriod ?? "—"}. Années récentes validées : {report.coverage.completeYears.join(", ") || "aucune"}. {report.coverage.ffeComplete ? "Index FFE complet." : "Index FFE encore progressif."}</p></div>
  </div>;
}

function Ratings({ report, type, setType }: { report: PlayerGlobalReport; type: FideRatingType; setType: (value: FideRatingType) => void }) {
  const points = report.ratings.filter((item) => item.ratingType === type && item.rating != null).sort((a, b) => a.period.localeCompare(b.period));
  const option = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: "axis" },
    grid: { left: 45, right: 20, top: 25, bottom: 50 },
    xAxis: { type: "category", data: points.map((item) => item.period.slice(0, 7)), axisLabel: { hideOverlap: true } },
    yAxis: { type: "value", scale: true },
    series: [{ type: "line", smooth: true, showSymbol: false, data: points.map((item) => item.rating), lineStyle: { color: "#356B82", width: 3 }, areaStyle: { color: "rgba(53,107,130,.12)" } }],
  }), [points]);
  return <Card className="rating-chart-card"><div className="section-toolbar"><div><h3>Classements mensuels officiels</h3><p>Les mois sans partie restent des classements publiés, pas de nouvelles parties.</p></div><label>Cadence<select aria-label="Cadence FIDE" value={type} onChange={(event) => setType(event.target.value as FideRatingType)}><option value="standard">Standard</option><option value="rapid">Rapide</option><option value="blitz">Blitz</option></select></label></div>
    {points.length ? <EChart option={option} height={360} ariaLabel={`Évolution du classement FIDE ${type}`}/> : <EmptyState title="Aucun classement publié">Cette cadence n’est pas disponible dans le profil officiel.</EmptyState>}</Card>;
}

function Events({ report }: { report: PlayerGlobalReport }) {
  const items = [...report.participations].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const fideEvents = [...report.events].sort((a, b) => (b.ratingPeriod ?? "").localeCompare(a.ratingPeriod ?? ""));
  if (!items.length && !fideEvents.length) return <EmptyState title="Aucune compétition agrégée">Les index FFE et FIDE progressent indépendamment.</EmptyState>;
  return <div className="competition-groups">
    <section><h3>Compétitions FFE ({items.length})</h3>
      {items.length ? <div className="participation-list">{items.slice(0, 50).map((item) => <Card className="participation-card" key={`${item.tournamentRef}:${item.date}`}><div><span className="status-pill">{item.ratingType ?? "cadence inconnue"}</span><h3>{item.title}</h3><p>{item.date ? new Date(item.date).toLocaleDateString("fr-FR") : item.year ?? "Date inconnue"} · {item.playedRounds ?? 0} partie(s) · score {item.score ?? "—"}</p></div><a className="button" href={`/tournoi/${item.tournamentRef}`}>Rapport FFE</a></Card>)}</div> : <p className="report-empty-note">Aucune participation FFE indexée.</p>}
    </section>
    <section><h3>Compétitions FIDE homologuées ({fideEvents.length})</h3>
      {fideEvents.length ? <div className="participation-list">{fideEvents.slice(0, 50).map((event) => <Card className="participation-card" key={`${event.eventId}:${event.ratingType}`}><div><span className="status-pill">FIDE · {event.ratingType}</span><h3>{event.eventName}</h3><p>{event.ratingPeriod ?? "Période inconnue"} · {event.games ?? 0} partie(s) · score {event.score ?? "—"} · variation {event.ratingChange ?? "—"}</p></div><a className="button" href={event.sourceUrl} target="_blank" rel="noreferrer">Source FIDE</a></Card>)}</div> : <p className="report-empty-note">Aucun rapport de compétition FIDE détaillé dans la fenêtre récente.</p>}
    </section>
  </div>;
}

function Games({ report }: { report: PlayerGlobalReport }) {
  return report.games.length ? <div className="rated-games">{report.games.slice(0, 50).map((game) => <Card key={game.id}><strong>{game.opponentName}</strong><span>{game.result ?? "—"} · {game.ratingType} · {game.ratingPeriod}</span><small>{game.eventName}</small></Card>)}</div> :
    <EmptyState title="Aucune partie classée détaillée disponible">EloScope distingue les résultats homologués des parties PGN : aucune notation de partie n’est inventée.</EmptyState>;
}

function Compare({ ffeCode }: { ffeCode: string }) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{
    players?: Array<{ name: string; standardRating?: number }>;
    expectedScore?: number;
    headToHead?: { total: number; wins: number; draws: number; losses: number };
    competitions?: { players: Array<{ ffeParticipations: number; fideEvents: number; ratedGames: number }> };
    error?: string;
  } | null>(null);
  const compare = async () => {
    const response = await fetch(`/api/players/${ffeCode}/compare/${code.toUpperCase()}`);
    setResult(await response.json());
  };
  return <Card className="scout-card"><BarChart3/><div><h3>Comparer deux joueurs</h3><p>Le rapport adverse doit déjà être présent dans le cache partagé.</p><label>Code FFE adverse<input value={code} onChange={(event) => setCode(event.target.value)} placeholder="A12345"/></label><button className="button primary" disabled={!/^[A-Z]\d{5}$/i.test(code)} onClick={compare}>Comparer</button>
    {result?.error && <p className="form-error">{result.error}</p>}{result?.players && <div className="compare-result"><strong>{result.players[0].name} — {result.players[1].name}</strong><p>Score théorique du premier joueur : {Math.round((result.expectedScore ?? 0) * 100)} %.</p>
      {result.competitions && <p>Compétitions recensées : {result.competitions.players[0].ffeParticipations} FFE + {result.competitions.players[0].fideEvents} FIDE contre {result.competitions.players[1].ffeParticipations} FFE + {result.competitions.players[1].fideEvents} FIDE.</p>}
      {result.headToHead && <p>Face-à-face classé : {result.headToHead.total} partie(s), {result.headToHead.wins} victoire(s), {result.headToHead.draws} nulle(s), {result.headToHead.losses} défaite(s).</p>}
    </div>}</div></Card>;
}

function OpponentScout({ ffeCode }: { ffeCode: string }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Array<{ ffeCode: string; displayName: string; standardRating?: number }>>([]);
  useEffect(() => {
    if (query.trim().length < 3) { setItems([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => fetch(`/api/players/search?q=${encodeURIComponent(query)}`, { signal: controller.signal }).then((response) => response.json() as Promise<{ items?: Array<{ ffeCode: string; displayName: string; standardRating?: number }> }>).then((body) => setItems(body.items ?? [])).catch(() => {}), 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  return <Card className="scout-card"><Swords/><div><h3>Scout adversaire</h3><p>Recherchez un joueur FFE, puis ouvrez la comparaison de profils officiels.</p><label><Search/>Nom ou code FFE<input aria-label="Rechercher un adversaire" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
    <div className="opponent-results">{items.filter((item) => item.ffeCode !== ffeCode).slice(0, 6).map((item) => <a href={`/joueurs/${item.ffeCode}`} key={item.ffeCode}><strong>{item.displayName}</strong><span>{item.ffeCode} · Elo {item.standardRating ?? "NC"}</span></a>)}</div></div></Card>;
}
