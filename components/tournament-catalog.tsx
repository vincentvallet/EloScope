"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, Clock3, ExternalLink,
  Info, LoaderCircle, MapPin, RefreshCcw, Search, SlidersHorizontal, Trophy,
} from "lucide-react";
import type { NormalizedTournament } from "@/lib/importers/types";
import type { FfeTournamentCatalogItem } from "@/lib/ffe-catalog/types";
import { Card, EmptyState } from "./ui";

type SearchPayload = {
  items: FfeTournamentCatalogItem[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  facets: {
    regions: Array<{ value: string; count: number }>;
    departments: Array<{ value: string; count: number }>;
    years: Array<{ value: string; count: number }>;
  };
  catalog: {
    catalogCount: number;
    earliestIndexedDate?: string;
    latestIndexedDate?: string;
    lastSuccessfulSyncAt?: string;
    lastAttemptAt?: string;
    isRefreshing: boolean;
    historicalBackfill?: {
      targetStart: string; targetEnd: string; totalMonths: number; completedMonths: number;
      emptyMonths: number; failedMonths: number; pendingMonths: number; running: boolean;
      completed: boolean; lastProcessedMonth?: string; updatedAt: string;
    };
  };
};

const STATUS_LABELS = {
  upcoming: "À venir",
  in_progress: "En cours",
  results_available: "Rapport disponible",
  completed_without_results: "Résultats en attente",
  unknown: "Données partielles",
};
const CADENCE_LABELS = { standard: "Cadence lente", rapid: "Rapide", blitz: "Blitz", unknown: "Cadence inconnue" };

function initialFilters() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

export function TournamentSearchPage() {
  const [filters, setFilters] = useState(initialFilters);
  const [payload, setPayload] = useState<SearchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const requestId = useRef(0);
  const query = filters.get("q") ?? "";

  useEffect(() => {
    const params = new URLSearchParams(filters);
    if (query.length === 1) params.delete("q");
    params.set("pageSize", "20");
    const id = ++requestId.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      window.history.replaceState(null, "", `${window.location.pathname}${filters.size ? `?${filters}` : ""}`);
      try {
        const response = await fetch(`/api/tournaments/search?${params}`, { signal: controller.signal });
        const data = await response.json() as SearchPayload & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Recherche indisponible");
        if (requestId.current === id) setPayload(data);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        if (requestId.current === id) setError(caught instanceof Error ? caught.message : "Recherche indisponible");
      } finally {
        if (requestId.current === id) setLoading(false);
      }
    }, query ? 300 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filters, query]);

  const update = (key: string, value?: string) => {
    const next = new URLSearchParams(filters);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "page") next.delete("page");
    setFilters(next);
  };
  const quick = (name: string) => {
    const now = new Date();
    const iso = (date: Date) => date.toISOString().slice(0, 10);
    const next = new URLSearchParams(filters);
    ["from", "to", "year", "status", "hasResults"].forEach((key) => next.delete(key));
    if (name === "month") {
      next.set("from", iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))));
      next.set("to", iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))));
    } else if (name === "three") {
      next.set("from", iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1))));
      next.set("to", iso(now));
    } else if (name === "year") next.set("year", String(now.getUTCFullYear()));
    else if (name === "previous") next.set("year", String(now.getUTCFullYear() - 1));
    else if (name === "upcoming") next.set("status", "upcoming");
    else if (name === "results") next.set("hasResults", "true");
    else if (name === "since2000") next.set("from", "2000-01-01");
    else if (name === "2000s") {
      next.set("from", "2000-01-01"); next.set("to", "2009-12-31");
    } else if (name === "2010s") {
      next.set("from", "2010-01-01"); next.set("to", "2019-12-31");
    } else if (name === "2020s") {
      next.set("from", "2020-01-01"); next.set("to", "2029-12-31");
    }
    next.delete("page");
    setFilters(next);
  };
  const refreshedAt = payload?.catalog.lastSuccessfulSyncAt
    ? new Date(payload.catalog.lastSuccessfulSyncAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })
    : null;
  const history = payload?.catalog.historicalBackfill;
  const progress = history?.totalMonths ? Math.min(100, Math.round((history.completedMonths / history.totalMonths) * 100)) : 0;
  const oldestYear = payload?.catalog.earliestIndexedDate?.slice(0, 4);

  return <div className="plain-page catalog-page">
    <div className="page-heading catalog-heading">
      <span className="eyebrow"><Trophy size={16}/>Catalogue indépendant</span>
      <h1>Trouver un tournoi</h1>
      <p>Recherchez les tournois publiés par la Fédération Française des Échecs et générez leur rapport EloScope.</p>
    </div>
    {history && <section className="catalog-history-status" aria-label="État des archives FFE">
      <div><strong>{history.completed ? "Archives FFE indexées depuis 2000, selon les données publiquement disponibles" : "Archives historiques en cours d’indexation"}</strong>
        <span>{history.completed ? "Catalogue mis à jour quotidiennement" : `Période actuellement disponible : ${oldestYear ?? "en cours"}–${history.targetEnd.slice(0, 4)}`}</span></div>
      <div className="catalog-history-metrics"><span><b>{history.completedMonths}</b> / {history.totalMonths} mois vérifiés</span><span><b>{payload.catalog.catalogCount}</b> tournois indexés</span><span>{history.emptyMonths} mois vérifiés sans archive</span></div>
      <div className="catalog-progress" role="progressbar" aria-label="Progression des archives" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }}/></div>
      <small>Dernière mise à jour : {new Date(history.updatedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</small>
    </section>}
    <Card className="catalog-search-card">
      <label className="catalog-main-search">
        <Search/>
        <input aria-label="Nom du tournoi, ville ou département" placeholder="Nom du tournoi, ville ou département…" value={query} onChange={(event) => update("q", event.target.value)}/>
        {loading && <LoaderCircle className="spin" aria-label="Chargement"/>}
      </label>
      <div className="quick-filters" aria-label="Filtres rapides">
        <button onClick={() => quick("month")}>Ce mois</button><button onClick={() => quick("three")}>3 derniers mois</button>
        <button onClick={() => quick("year")}>Cette année</button><button onClick={() => quick("previous")}>Année précédente</button>
        <button onClick={() => quick("upcoming")}>À venir</button><button onClick={() => quick("results")}>Rapports disponibles</button>
        <button onClick={() => quick("since2000")}>Depuis 2000</button><button onClick={() => quick("2000s")}>Années 2000</button>
        <button onClick={() => quick("2010s")}>Années 2010</button><button onClick={() => quick("2020s")}>Années 2020</button>
      </div>
      <div className="catalog-primary-filters">
        <label>Du<input type="date" value={filters.get("from") ?? ""} onChange={(event) => update("from", event.target.value)}/></label>
        <label>Au<input type="date" value={filters.get("to") ?? ""} onChange={(event) => update("to", event.target.value)}/></label>
        <label>Année<select value={filters.get("year") ?? ""} onChange={(event) => update("year", event.target.value)}><option value="">Toutes</option>{payload?.facets.years.map((item) => <option value={item.value} key={item.value}>{item.value} ({item.count})</option>)}</select></label>
        <button className="button secondary" onClick={() => setAdvanced((value) => !value)} aria-expanded={advanced}><SlidersHorizontal/>Filtres avancés<ChevronDown/></button>
      </div>
      {advanced && <div className="catalog-advanced">
        <label>Région<select aria-label="Région" value={filters.get("region") ?? ""} onChange={(event) => update("region", event.target.value)}><option value="">Toutes les régions</option>{payload?.facets.regions.map((item) => <option value={item.value} key={item.value}>{item.value} ({item.count})</option>)}</select></label>
        <label>Département<select aria-label="Département" value={filters.get("department") ?? ""} onChange={(event) => update("department", event.target.value)}><option value="">Tous</option>{payload?.facets.departments.map((item) => <option value={item.value} key={item.value}>{item.value} ({item.count})</option>)}</select></label>
        <label>Cadence<select aria-label="Cadence" value={filters.get("cadence") ?? ""} onChange={(event) => update("cadence", event.target.value)}><option value="">Toutes</option><option value="standard">Lente</option><option value="rapid">Rapide</option><option value="blitz">Blitz</option></select></label>
        <label>Résultats<select aria-label="Disponibilité des résultats" value={filters.get("hasResults") ?? ""} onChange={(event) => update("hasResults", event.target.value)}><option value="">Tous</option><option value="true">Disponibles</option><option value="false">Pas encore disponibles</option></select></label>
      </div>}
    </Card>
    <div className="catalog-toolbar">
      <div><strong>{payload?.pagination.total ?? 0} tournoi{payload?.pagination.total === 1 ? "" : "s"}</strong>{refreshedAt && <small>Catalogue FFE mis à jour le {refreshedAt}</small>}</div>
      <button className="button secondary" onClick={() => setFilters(new URLSearchParams(filters))}><RefreshCcw/>Actualiser la recherche</button>
    </div>
    {error && <div className="notice warning"><Info/><p>Les dernières données enregistrées restent disponibles. {error}</p></div>}
    {!loading && !error && payload?.items.length === 0 && <EmptyState title="Aucun tournoi trouvé">Essayez un nom de ville, retirez un filtre ou élargissez la plage de dates.</EmptyState>}
    <div className="tournament-results">{payload?.items.map((item) => <TournamentResultCard item={item} search={filters.toString()} key={item.ffeRef}/>)}</div>
    {!!payload?.pagination.pageCount && payload.pagination.pageCount > 1 && <nav className="catalog-pagination" aria-label="Pagination">
      <button disabled={payload.pagination.page <= 1} onClick={() => update("page", String(payload.pagination.page - 1))}><ArrowLeft/>Précédent</button>
      <span>Page {payload.pagination.page} sur {payload.pagination.pageCount}</span>
      <button disabled={payload.pagination.page >= payload.pagination.pageCount} onClick={() => update("page", String(payload.pagination.page + 1))}>Suivant<ArrowRight/></button>
    </nav>}
    <p className="catalog-attribution">Source : Fédération Française des Échecs. EloScope est un service indépendant utilisant les données publiquement consultables sur le site de la Fédération Française des Échecs.</p>
  </div>;
}

function TournamentResultCard({ item, search }: { item: FfeTournamentCatalogItem; search: string }) {
  const dates = formatDates(item);
  const detailHref = `/tournois/${item.ffeRef}${search ? `?${search}` : ""}`;
  return <article className="tournament-result-card">
    <div className="tournament-result-main">
      <div className="tournament-result-badges"><span className={`status-pill catalog-${item.status}`}>{item.status === "results_available" && <Check/>}{STATUS_LABELS[item.status]}</span>{item.cadence && item.cadence !== "unknown" && <span className="status-pill">{CADENCE_LABELS[item.cadence]}</span>}</div>
      <h2><a href={detailHref}>{item.title}</a></h2>
      <p><MapPin/>{[item.city, item.departmentCode && `${item.departmentCode} · ${item.departmentName}`, item.regionName].filter(Boolean).join(" · ") || "Lieu non publié"}</p>
      <p><CalendarDays/>{dates}</p>
      <small>Réf. FFE {item.ffeRef} · Source : Fédération Française des Échecs</small>
    </div>
    <div className="tournament-result-action">
      <a className={`button ${item.hasResults ? "primary" : "secondary"}`} href={detailHref}>{item.hasResults ? "Analyser le tournoi" : "Voir les informations"}<ArrowRight/></a>
      <a className="source-link" href={item.sourceDetailUrl} target="_blank" rel="noreferrer">Page source<ExternalLink/></a>
    </div>
  </article>;
}

export function TournamentDetailPage({ ffeRef, setReport }: { ffeRef: string; setReport: (report: NormalizedTournament) => void }) {
  const [item, setItem] = useState<FfeTournamentCatalogItem | null>(null);
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/tournaments/${ffeRef}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as FfeTournamentCatalogItem & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Tournoi introuvable");
        setItem(body);
      })
      .catch((caught) => { if (caught.name !== "AbortError") setError(caught.message); });
    return () => controller.abort();
  }, [ffeRef]);
  const analyze = async () => {
    setAnalyzing(true); setError("");
    try {
      const response = await fetch(`/api/tournaments/${ffeRef}/analyze`, { method: "POST" });
      const body = await response.json() as { data?: NormalizedTournament; error?: string };
      if (!response.ok || !body.data) throw new Error(body.error ?? "Analyse impossible");
      setReport(body.data);
      window.location.assign("/tournoi/importe/vue-ensemble");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analyse impossible");
    } finally { setAnalyzing(false); }
  };
  if (error && !item) return <div className="narrow-page"><EmptyState title="Tournoi indisponible">{error}</EmptyState></div>;
  if (!item) return <div className="narrow-page"><Card className="empty-state"><LoaderCircle className="spin"/><strong>Chargement du tournoi…</strong></Card></div>;
  const details = [
    ["Lieu", [item.city, item.departmentCode, item.regionName].filter(Boolean).join(" · ")],
    ["Dates", formatDates(item)], ["Cadence", item.cadence ? CADENCE_LABELS[item.cadence] : ""],
    ["Nombre de rondes", item.rounds], ["Organisateur", item.organizer], ["Arbitre", item.arbiter], ["Adresse", item.address],
  ].filter(([, value]) => value);
  return <div className="narrow-page tournament-detail-page">
    <a className="back-link" href={`/tournois${typeof window !== "undefined" ? window.location.search : ""}`}><ArrowLeft/>Retour à la recherche</a>
    <div className="page-heading"><span className={`status-pill catalog-${item.status}`}>{STATUS_LABELS[item.status]}</span><h1>{item.title}</h1><p>Référence FFE {item.ffeRef}</p></div>
    <Card className="tournament-detail-card"><dl>{details.map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {!item.hasResults && <div className="notice"><Clock3/><p>Les résultats de ce tournoi ne sont pas encore disponibles. EloScope vérifiera automatiquement leur publication.</p></div>}
      {error && <div className="notice warning"><Info/><p>{error}</p></div>}
      <div className="card-actions"><a className="button secondary" href={item.sourceDetailUrl} target="_blank" rel="noreferrer">Voir la fiche FFE<ExternalLink/></a>{item.hasResults && <button className="button primary" disabled={analyzing} onClick={analyze}>{analyzing ? "Analyse en cours…" : "Analyser le tournoi"}<ArrowRight/></button>}</div>
    </Card>
    <p className="catalog-attribution">Source : Fédération Française des Échecs. EloScope est un service indépendant et n’est pas un produit officiel de la FFE.</p>
  </div>;
}

function formatDates(item: FfeTournamentCatalogItem) {
  const formatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  if (!item.startDate) return "Date non publiée";
  const start = formatter.format(new Date(`${item.startDate}T00:00:00Z`));
  if (!item.endDate || item.endDate === item.startDate) return start;
  return `${start} – ${formatter.format(new Date(`${item.endDate}T00:00:00Z`))}`;
}
