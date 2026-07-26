"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { Activity, BarChart3, CalendarDays, Check, ExternalLink, RefreshCcw, Search, ShieldCheck, Swords, Trophy } from "lucide-react";
import { EChart } from "./echart";
import { Card, EmptyState } from "./ui";
import type { FideRatingType, PlayerGlobalReport, PlayerReportMetadata } from "@/lib/fide/types";
import { careerRatingSeries, filterRatingsByRange, type RatingRange } from "@/lib/fide/rating-history";

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
const ratingLabels: Record<FideRatingType, string> = { standard: "Standard", rapid: "Rapide", blitz: "Blitz" };

export function PlayerGlobalReportView({ ffeCode }: { ffeCode: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [active, setActive] = useState<Tab>("overview");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [pollToken, setPollToken] = useState(0);
  const [clock, setClock] = useState(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/players/${ffeCode}/global-report`, { signal });
    const body = await response.json() as Payload;
    setPayload(body);
    setClock(Date.now());
    return body;
  }, [ffeCode]);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const body = await load(controller.signal);
        if (!cancelled && ["queued", "pending", "building", "retry_wait"].includes(body.state)) {
          timer = setTimeout(refresh, body.state === "retry_wait" ? 15_000 : 2500);
        }
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Lecture indisponible");
      } finally { inFlight = false; }
    };
    refresh();
    return () => { cancelled = true; controller.abort(); if (timer) clearTimeout(timer); };
  }, [load, pollToken]);
  const generate = async () => {
    setGenerating(true); setError("");
    try {
      const response = await fetch(`/api/players/${ffeCode}/global-report/generate`, { method: "POST" });
      const body = await response.json() as Payload;
      if (!response.ok && body.state !== "failed") throw new Error(body.error ?? "Génération indisponible");
      setPayload(body);
      if (["queued", "pending", "building", "retry_wait"].includes(body.state)) setPollToken((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Génération indisponible");
    } finally { setGenerating(false); }
  };
  if (!payload?.report) {
    const progress = payload?.metadata?.progress ?? 0;
    const metadata = payload?.metadata;
    const retryWaiting = metadata?.status === "retry_wait"
      && !!metadata.nextRetryAt
      && Date.parse(metadata.nextRetryAt) > clock;
    const activeBuild = generating || ["queued", "building"].includes(metadata?.status ?? "") || retryWaiting;
    const partial = ["partial_ready", "retry_wait", "failed"].includes(metadata?.status ?? "");
    return <Card className="global-report-launch">
      <div><span className="eyebrow"><ShieldCheck/>Données sportives officielles FFE + FIDE</span><h2>{partial ? "Rapport partiellement disponible" : "Rapport global du joueur"}</h2>
        <p>{partial
          ? "Les données déjà récupérées sont conservées. Certaines statistiques FIDE seront complétées lorsque la source sera disponible."
          : "Classements mensuels, compétitions et statistiques de carrière, mis en cache pour tous les visiteurs."}</p></div>
      {payload?.metadata && <div className="global-build-progress" role="status"><div><span style={{ width: `${progress}%` }}/></div><p>{payload.metadata.currentStep ?? "Préparation"} · {progress} %</p></div>}
      {metadata?.lastSuccessfulStage && <small>Dernière étape réussie : {metadata.lastSuccessfulStage}</small>}
      {metadata?.updatedAt && <small>Dernière tentative : {new Date(metadata.updatedAt).toLocaleString("fr-FR")}</small>}
      {metadata?.nextRetryAt && <small>Prochaine tentative autorisée : {new Date(metadata.nextRetryAt).toLocaleString("fr-FR")}</small>}
      {error && <p className="form-error">{error}</p>}
      <button className="button primary" onClick={generate} disabled={activeBuild}>
        <RefreshCcw className={generating || ["queued", "building"].includes(metadata?.status ?? "") ? "spin" : ""}/>{retryWaiting ? "Nouvelle tentative programmée" : activeBuild ? "Construction en cours…" : partial ? "Réessayer les données manquantes" : payload?.metadata ? "Reprendre la construction" : "Construire le rapport global"}
      </button>
      <small>Traitement progressif, une requête FIDE à la fois. Les données FFE restent disponibles si la FIDE répond lentement.</small>
    </Card>;
  }
  const report = payload.report;
  return <section className="global-report">
    {payload.metadata && payload.metadata.status !== "ready" && <Card className="coverage-notice">
      <Check/><div role="status"><strong>Rapport partiellement disponible</strong>
        <p>Les informations déjà récupérées restent consultables. {payload.metadata.nextRetryAt ? `Nouvelle tentative après ${new Date(payload.metadata.nextRetryAt).toLocaleString("fr-FR")}.` : ""}</p>
        <small>Dernière étape réussie : {payload.metadata.lastSuccessfulStage ?? "données en cache"}.</small>
      </div>
      {!["queued", "building"].includes(payload.metadata.status)
        && !(payload.metadata.status === "retry_wait" && payload.metadata.nextRetryAt && Date.parse(payload.metadata.nextRetryAt) > clock)
        && <button className="button" onClick={generate} disabled={generating}>Réessayer les données manquantes</button>}
    </Card>}
    <div className="global-report-title"><div><span className="eyebrow"><ShieldCheck/>Rapport global partagé</span><h2>{report.player.federationFlag && <span role="img" aria-label={`Drapeau de la fédération ${report.player.federationName ?? report.player.federationCode}`}>{report.player.federationFlag} </span>}Carrière FFE + FIDE</h2>
      <p>{report.player.fideTitle && <><strong title={report.player.fideTitleLabel}>{report.player.fideTitle}</strong> · {report.player.fideTitleLabel} · </>}Fédération représentée : {report.player.federationName ?? report.player.federation ?? "non publiée"}{report.player.birthYear ? ` · Né(e) en ${report.player.birthYear}` : ""} · FIDE {report.fideId}</p>
      <p>Mis à jour le {new Date(report.generatedAt).toLocaleDateString("fr-FR")}</p></div>
      <a href={report.player.sourceUrl} target="_blank" rel="noreferrer" className="button">Profil FIDE<ExternalLink/></a></div>
    <div className="player-report-tabs" role="tablist" aria-label="Sections du rapport">
      {tabs.map((tab) => <button role="tab" aria-selected={active === tab.id} className={active === tab.id ? "active" : ""} onClick={() => setActive(tab.id)} key={tab.id}>{tab.label}</button>)}
    </div>
    <div role="tabpanel">
      {active === "overview" && <Overview report={report}/>}
      {active === "ratings" && <Ratings report={report}/>}
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
      <Card><CalendarDays/><small>Compétitions connues</small><strong>{report.statistics.knownEvents ?? report.careerEvents?.length ?? report.events.length + report.participations.length}</strong></Card>
    </div>
    <Card className="career-summary"><h3>Synthèse calculée</h3>{report.summary.map((line) => <p key={line}>{line}</p>)}</Card>
    <div className="coverage-notice"><Check/><p>Couverture FIDE : {report.coverage.oldestPeriod ?? "—"} à {report.coverage.newestPeriod ?? "—"}. Années récentes validées : {report.coverage.completeYears.join(", ") || "aucune"}. {report.coverage.ffeComplete ? "Index FFE complet." : "Index FFE encore progressif."}</p></div>
  </div>;
}

function Ratings({ report }: { report: PlayerGlobalReport }) {
  const [range, setRange] = useState<RatingRange>(3);
  const [zoomKey, setZoomKey] = useState(0);
  const [visible, setVisible] = useState<Record<FideRatingType, boolean>>({ standard: true, rapid: true, blitz: true });
  const points = filterRatingsByRange(report.ratings, range);
  const chart = careerRatingSeries(points, visible);
  const option = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: "axis", confine: true },
    legend: { top: 0 },
    grid: { left: 45, right: 20, top: 45, bottom: 75 },
    xAxis: { type: "category", data: chart.periods.map((period) => period.slice(0, 7)), axisLabel: { hideOverlap: true } },
    yAxis: { type: "value", scale: true },
    dataZoom: [
      { type: "inside", zoomOnMouseWheel: true, moveOnMouseMove: true, preventDefaultMouseMove: true },
      { type: "slider", bottom: 12, height: 24 },
    ],
    series: chart.series.map((series) => ({
      name: ratingLabels[series.type], type: "line", connectNulls: false, showSymbol: false, data: series.data,
    })),
  }), [chart.periods, chart.series]);
  const ranges: Array<[RatingRange, string]> = [[1, "1 an"], [3, "3 ans"], [5, "5 ans"], [10, "10 ans"], ["career", "Toute la carrière"]];
  return <Card className="rating-chart-card">
    <div className="section-toolbar"><div><h3>Classements mensuels officiels</h3><p>Historique complet disponible, sans interpolation des mois manquants.</p></div></div>
    <div className="rating-controls" aria-label="Période du graphique">
      {ranges.map(([value, label]) => <button key={String(value)} className={`button ${range === value ? "primary" : ""}`} aria-pressed={range === value} onClick={() => { setRange(value); setZoomKey((key) => key + 1); }}>{label}</button>)}
      <button className="button" onClick={() => setZoomKey((key) => key + 1)}>Réinitialiser le zoom</button>
    </div>
    <div className="rating-controls" aria-label="Séries Elo">
      {(Object.keys(visible) as FideRatingType[]).map((type) => <label key={type}><input type="checkbox" checked={visible[type]} onChange={() => setVisible((state) => ({ ...state, [type]: !state[type] }))}/>{ratingLabels[type]}</label>)}
    </div>
    {chart.periods.length ? <EChart key={zoomKey} option={option} height={420} ariaLabel="Évolution des classements FIDE standard, rapide et blitz"/> : <EmptyState title="Aucun classement publié">Aucun point officiel n’est disponible sur cette période.</EmptyState>}
  </Card>;
}

function Events({ report }: { report: PlayerGlobalReport }) {
  const items = report.careerEvents ?? [];
  if (!items.length) return <EmptyState title="Aucune compétition retrouvée">Les événements FIDE apparaissent indépendamment du catalogue ; l’index FFE complète ensuite les détails.</EmptyState>;
  return <section className="competition-groups"><h3>Tournois et compétitions ({items.length})</h3>
    <div className="participation-list">{items.map((event) => {
      const hasFfe = event.sources.some((source) => source.type.startsWith("ffe_"));
      const hasFide = event.sources.some((source) => source.type.startsWith("fide_"));
      const sourceLabel = hasFfe && hasFide ? "FFE + FIDE" : hasFfe ? "FFE" : "FIDE";
      const sourceUrl = event.sources.find((source) => source.type.startsWith("fide_"))?.url;
      const actionUrl = event.ffeTournamentRef ? `/tournoi/${event.ffeTournamentRef}` : sourceUrl;
      return <Card className="participation-card" key={event.canonicalEventId}><div>
        <div><span className="status-pill">{sourceLabel}</span> <span className="status-pill">{event.ratingType}</span>{event.catalogStatus === "not_matched" && <span className="status-pill">Événement non rapproché</span>}</div>
        <h3>{event.displayName}</h3>
        <p>{event.startDate ? new Date(event.startDate).toLocaleDateString("fr-FR") : event.ratingPeriod?.slice(0, 7) ?? event.year ?? "Période inconnue"} · {event.ratedGames ?? 0} partie(s) · score {event.score ?? "—"}</p>
        <small>Elo moyen adverse {event.averageOpponentRating ?? "—"} · performance {event.performanceRating ?? "—"} · variation officielle {event.officialRatingChange ?? "—"}</small>
      </div>{actionUrl ? <a className="button" href={actionUrl} target={event.ffeTournamentRef ? undefined : "_blank"} rel="noreferrer">{event.ffeTournamentRef ? "Voir le rapport" : "Voir les résultats classés"}</a> : <span>Données détaillées non disponibles</span>}</Card>;
    })}</div>
  </section>;
}

function Games({ report }: { report: PlayerGlobalReport }) {
  const [visible, setVisible] = useState(100);
  if (!report.games.length) return <EmptyState title="Aucune partie classée détaillée disponible">EloScope distingue les résultats homologués des parties PGN : aucune notation de partie n’est inventée.</EmptyState>;
  const resultLabel = (result?: 0 | 0.5 | 1) => result === 1 ? "Victoire" : result === 0.5 ? "Nulle" : result === 0 ? "Défaite" : "Résultat non publié";
  return <div>
    <p className="report-empty-note">{report.games.length} partie(s) classée(s) actuellement chargée(s) sur la carrière officielle.</p>
    <div className="rated-games">{report.games.slice(0, visible).map((game) => <Card key={game.id}><strong>{game.opponentName}</strong><span>{resultLabel(game.result)} · {game.color === "white" ? "Blancs" : game.color === "black" ? "Noirs" : "Couleur inconnue"} · {game.ratingType} · {game.ratingPeriod}</span><small>{game.eventName} · Elo adverse {game.opponentRating ?? "NC"}</small></Card>)}</div>
    {visible < report.games.length && <button className="button" onClick={() => setVisible((count) => count + 100)}>Afficher 100 parties supplémentaires</button>}
  </div>;
}

function Compare({ ffeCode }: { ffeCode: string }) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{
    players?: Array<{ name: string; standardRating?: number; federationFlag?: string; federationName?: string; birthYear?: number; fideTitle?: string; fideTitleLabel?: string }>;
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
    {result?.error && <p className="form-error">{result.error}</p>}{result?.players && <div className="compare-result"><strong>{result.players[0].federationFlag} {result.players[0].fideTitle} {result.players[0].name} — {result.players[1].federationFlag} {result.players[1].fideTitle} {result.players[1].name}</strong>
      <p>{result.players.map((player) => [player.federationName, player.birthYear ? `né(e) en ${player.birthYear}` : "", player.fideTitleLabel].filter(Boolean).join(" · ")).join(" — ")}</p><p>Score théorique du premier joueur : {Math.round((result.expectedScore ?? 0) * 100)} %.</p>
      {result.competitions && <p>Compétitions recensées : {result.competitions.players[0].ffeParticipations} FFE + {result.competitions.players[0].fideEvents} FIDE contre {result.competitions.players[1].ffeParticipations} FFE + {result.competitions.players[1].fideEvents} FIDE.</p>}
      {result.headToHead && <p>Face-à-face classé : {result.headToHead.total} partie(s), {result.headToHead.wins} victoire(s), {result.headToHead.draws} nulle(s), {result.headToHead.losses} défaite(s).</p>}
    </div>}</div></Card>;
}

function OpponentScout({ ffeCode }: { ffeCode: string }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Array<{ ffeCode: string; displayName: string; standardRating?: number; federationFlag?: string; federationName?: string; birthYear?: number; fideTitle?: string }>>([]);
  useEffect(() => {
    if (query.trim().length < 3) { setItems([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => fetch(`/api/players/search?q=${encodeURIComponent(query)}`, { signal: controller.signal }).then((response) => response.json() as Promise<{ items?: Array<{ ffeCode: string; displayName: string; standardRating?: number; federationFlag?: string; federationName?: string; birthYear?: number; fideTitle?: string }> }>).then((body) => setItems(body.items ?? [])).catch(() => {}), 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  return <Card className="scout-card"><Swords/><div><h3>Scout adversaire</h3><p>Recherchez un joueur FFE, puis ouvrez la comparaison de profils officiels.</p><label><Search/>Nom ou code FFE<input aria-label="Rechercher un adversaire" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
    <div className="opponent-results">{items.filter((item) => item.ffeCode !== ffeCode).slice(0, 6).map((item) => <a href={`/joueurs/${item.ffeCode}`} key={item.ffeCode}><strong>{item.federationFlag} {item.fideTitle} {item.displayName}</strong><span>{item.ffeCode} · Elo {item.standardRating ?? "NC"}{item.federationName ? ` · ${item.federationName}` : ""}{item.birthYear ? ` · ${item.birthYear}` : ""}</span></a>)}</div></div></Card>;
}
