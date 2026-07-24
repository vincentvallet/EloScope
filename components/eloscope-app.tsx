"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { EChartsOption } from "echarts";
import {
  ArrowLeft, ArrowRight, BarChart3, Building2, CalendarDays,
  Check, ChevronDown, CircleAlert, Clock3, Download, FileSpreadsheet,
  Filter, Gauge, Heart, HelpCircle, Home, Import, Info,
  Menu, Printer, RefreshCcw, Search, Settings, Star, Target, Trophy, Upload,
  UserRound, Users, X,
} from "lucide-react";
import { demoEntries, demoReport, entriesByInitialRank, featuredEntries, getClubEntries, getEntry, clubs } from "@/data/demo-tournament";
import type { DemoEntry } from "@/lib/domain";
import { calculateTournamentDelta, RULESETS } from "@/lib/rating/engine";
import { formatNumber, formatScore, signed } from "@/lib/format";
import { Card, Kpi, SectionTitle, Avatar, EmptyState } from "@/components/ui";
import { EChart } from "@/components/echart";

const BASE = "/tournoi/open-cote-opale-2026";
const palette = ["#356B82", "#7158A5", "#2B8295", "#C47B2E", "#64748B", "#23855B", "#A14D68", "#596B3A"];
const tooltip = {
  backgroundColor: "#17211B",
  borderWidth: 0,
  textStyle: { color: "#fff", fontFamily: "Inter, sans-serif", fontSize: 12 },
};

function routeForEntry(entry: DemoEntry) {
  return `${BASE}/joueurs/${entry.id}`;
}

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportEntriesCsv(entries: DemoEntry[], name = "classement-eloscope.csv") {
  const headers = ["Place","Joueur","Elo","Club","Score","Performance","Départage","Progression"];
  const rows = entries.map((entry) => [
    entry.finalRank, entry.player.displayName, entry.startingRating ?? "",
    entry.club?.displayName ?? "", entry.score, entry.providedPerformance ?? entry.estimatedPerformance ?? "",
    entry.tieBreaks.buchholz ?? "", (entry.startingRank ?? 0) - (entry.finalRank ?? 0),
  ]);
  downloadText(name, [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"','""')}"`).join(";")).join("\n"), "text/csv;charset=utf-8");
}

function exportReportJson() {
  downloadText(
    "eloscope-open-cote-opale-2026.json",
    JSON.stringify({ schemaVersion: "1.0", application: "EloScope", report: demoReport, entries: demoEntries }, null, 2),
    "application/json",
  );
}

const nav = [
  { href: "/", label: "Accueil", icon: Home },
  { href: "/tournois", label: "Tournois", icon: Trophy },
  { href: "/joueurs", label: "Joueurs", icon: UserRound },
  { href: "/clubs", label: "Clubs", icon: Building2 },
  { href: `${BASE}/comparer`, label: "Comparer", icon: BarChart3 },
];

export function EloScopeApp() {
  const pathname = usePathname() || "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchMatches = useMemo(() => {
    if (search.trim().length < 2) return [];
    const term = search.toLocaleLowerCase("fr");
    return demoEntries.filter((entry) =>
      `${entry.player.displayName} ${entry.club?.displayName}`.toLocaleLowerCase("fr").includes(term)
    ).slice(0, 5);
  }, [search]);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <a className="brand" href="/" aria-label="EloScope, accueil">
          <span className="brand-mark"><Target size={24} /><span>♜</span></span>
          <strong>EloScope</strong>
        </a>
        <nav aria-label="Navigation principale">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href.split("/comparer")[0]) && (
              item.label !== "Tournois" || pathname.includes("/tournoi") || pathname === "/tournois"
            );
            return <a key={item.label} href={item.href} className={active ? "active" : ""}><Icon size={18}/><span>{item.label}</span></a>;
          })}
        </nav>
        <div className="sidebar-section">
          <span>Rapports</span>
          <a href="/rapports-recents"><Clock3 size={16}/>Rapports récents</a>
          <a href="/favoris"><Star size={16}/>Favoris</a>
        </div>
        <div className="sidebar-recents">
          <a href={`${BASE}/vue-ensemble`}><span className="file-icon">O</span><span><b>Open de la Côte d’Opale</b><small>Consulté aujourd’hui</small></span></a>
          <a href={routeForEntry(featuredEntries[0])}><span className="file-icon">M</span><span><b>{featuredEntries[0].player.displayName}</b><small>Rapport joueur</small></span></a>
        </div>
        <div className="sidebar-bottom">
          <a href="/a-propos-elo"><HelpCircle size={17}/>À propos des calculs Elo</a>
          <a href="/parametres"><Settings size={17}/>Paramètres</a>
        </div>
      </aside>
      {mobileOpen && <button className="sidebar-backdrop" aria-label="Fermer le menu" onClick={() => setMobileOpen(false)} />}
      <div className="workspace">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen((value) => !value)} aria-label="Ouvrir le menu"><Menu/></button>
          <div className="global-search">
            <Search size={18}/>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rapport, joueur, club ou URL…" aria-label="Recherche globale"/>
            {searchMatches.length > 0 && <div className="search-results">
              {searchMatches.map((entry) => <a href={routeForEntry(entry)} key={entry.id}><Avatar name={entry.player.displayName}/><span>{entry.player.displayName}<small>{entry.club?.displayName}</small></span></a>)}
            </div>}
          </div>
          <div className="top-context"><span>Données de démonstration</span><small>France · fr-FR</small></div>
          <a className="button primary" href="/importer"><Upload size={17}/>Importer</a>
        </header>
        <main>
          <PageRouter pathname={pathname}/>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Navigation mobile">
        {nav.slice(0, 4).map((item) => { const Icon = item.icon; return <a href={item.href} key={item.label}><Icon size={19}/><span>{item.label === "Tournois" ? "Tournoi" : item.label}</span></a>; })}
        <button onClick={() => setMobileOpen(true)}><Menu size={19}/><span>Plus</span></button>
      </nav>
    </div>
  );
}

function PageRouter({ pathname }: { pathname: string }) {
  if (pathname === "/") return <HomePage />;
  if (pathname === "/importer") return <ImportPage />;
  if (pathname === "/tournois") return <ReportsList title="Tournois importés" />;
  if (pathname === "/joueurs") return <Directory mode="players" />;
  if (pathname === "/clubs") return <Directory mode="clubs" />;
  if (pathname === "/favoris") return <ReportsList title="Favoris" favorite />;
  if (pathname === "/rapports-recents") return <ReportsList title="Rapports récents" />;
  if (pathname.includes("/joueurs/")) return <PlayerReport id={pathname.split("/").at(-1)} />;
  if (pathname.includes("/clubs/")) return <ClubReport id={pathname.split("/").at(-1)} />;
  if (pathname.endsWith("/classement") || pathname.endsWith("/joueurs")) return <RankingPage />;
  if (pathname.endsWith("/clubs")) return <ClubDirectory />;
  if (pathname.endsWith("/rondes")) return <RoundsPage />;
  if (pathname.endsWith("/comparer") || pathname === "/comparer") return <ComparePage />;
  if (pathname.startsWith("/tournoi/")) return <TournamentOverview />;
  if (pathname === "/a-propos-elo") return <MethodPage />;
  return <HomePage />;
}

function HomePage() {
  return (
    <div className="home-page">
      <section className="hero">
        <span className="eyebrow"><Target size={16}/>L’analyse de résultats, sans bruit</span>
        <h1>Analysez un tournoi d’échecs</h1>
        <p>Transformez une grille de résultats en rapport clair, visuel et interactif.</p>
        <div className="hero-search"><Search/><input placeholder="Nom d’un rapport, joueur, club ou URL de résultats" aria-label="Analyser un rapport"/><a href="/importer" className="button primary">Analyser</a></div>
        <div className="hero-actions">
          <a className="button secondary" href="/importer?mode=url"><Import size={17}/>Analyser une URL</a>
          <a className="button secondary" href="/importer?mode=file"><FileSpreadsheet size={17}/>Importer un fichier</a>
          <a className="button ghost" href={`${BASE}/vue-ensemble`}><Target size={17}/>Utiliser la démonstration</a>
        </div>
      </section>
      <div className="home-section">
        <SectionTitle action={<a className="text-link" href="/rapports-recents">Tout afficher <ArrowRight size={15}/></a>}>Rapports récents</SectionTitle>
        <div className="report-grid">
          <a href={`${BASE}/vue-ensemble`} className="report-card">
            <div className="report-badge"><Trophy/></div>
            <span className="status-pill success"><Check size={13}/>Terminé</span>
            <h3>{demoReport.title}</h3>
            <p><CalendarDays size={15}/>18–24 juillet 2026 · Le Touquet</p>
            <div><span><strong>72</strong> joueurs</span><span><strong>9</strong> rondes</span><span><strong>Démo</strong> source</span></div>
            <small>Consulté il y a quelques instants</small>
          </a>
          <a href={`${BASE}/joueurs/entry-1`} className="report-card compact">
            <Avatar name={featuredEntries[0].player.displayName}/>
            <span className="report-type">Rapport joueur</span>
            <h3>{featuredEntries[0].player.displayName}</h3>
            <p>{featuredEntries[0].club?.displayName}</p>
            <div><span><strong>{formatScore(featuredEntries[0].score)} / 9</strong> score</span><span><strong>{featuredEntries[0].finalRank}e</strong> place</span></div>
          </a>
          <a href={`${BASE}/clubs/${clubs[0].id}`} className="report-card compact">
            <div className="report-badge"><Building2/></div>
            <span className="report-type">Rapport club</span>
            <h3>{clubs[0].displayName}</h3>
            <p>{getClubEntries(clubs[0].id).length} joueurs dans le tournoi</p>
            <small>Consulté aujourd’hui</small>
          </a>
        </div>
      </div>
    </div>
  );
}

function ImportPage() {
  const [mode, setMode] = useState<"url" | "file" | "demo">("url");
  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [stage, setStage] = useState<"input" | "checking">("input");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const urlAllowed = /^https:\/\/(www\.)?echecs\.asso\.fr\//i.test(url);
  const canContinue = mode === "demo" || (mode === "url" && urlAllowed) || (mode === "file" && !!fileName);
  const verify = async () => {
    setError("");
    if (mode === "demo") { setStage("checking"); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: mode === "url" ? "url" : "csv", input: mode === "url" ? url : fileContent }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Import impossible");
      setStage("checking");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import impossible");
    } finally { setLoading(false); }
  };
  return (
    <div className="narrow-page">
      <div className="page-heading"><span className="eyebrow">Nouvelle analyse</span><h1>Importer des résultats</h1><p>Ajoutez une grille FFE, un fichier CSV ou utilisez le tournoi fictif fourni avec EloScope.</p></div>
      {stage === "input" ? <Card className="import-card">
        <div className="segmented" role="tablist">
          <button className={mode === "url" ? "selected" : ""} onClick={() => setMode("url")}><Import/>URL FFE</button>
          <button className={mode === "file" ? "selected" : ""} onClick={() => setMode("file")}><FileSpreadsheet/>Fichier CSV</button>
          <button className={mode === "demo" ? "selected" : ""} onClick={() => setMode("demo")}><Target/>Démonstration</button>
        </div>
        {mode === "url" && <div className="field-stack"><label htmlFor="source-url">URL de la grille américaine FFE</label><div className="input-with-icon"><Search/><input id="source-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.echecs.asso.fr/..." /></div>{url && !urlAllowed && <p className="field-error"><CircleAlert/>Seules les URL HTTPS du domaine officiel echecs.asso.fr sont acceptées.</p>}<p className="field-help"><Info/>La page est récupérée côté serveur avec un délai et une taille strictement limités.</p></div>}
        {mode === "file" && <label className="drop-zone"><Upload/><strong>{fileName || "Déposez un fichier CSV"}</strong><span>ou cliquez pour le sélectionner · 5 Mo maximum</span><input type="file" accept=".csv,text/csv" onChange={async (e) => { const file=e.target.files?.[0]; setFileName(file?.name??""); setFileContent(file ? await file.text() : ""); }}/></label>}
        {mode === "demo" && <div className="demo-preview"><div className="report-badge"><Trophy/></div><div><strong>{demoReport.title}</strong><p>72 joueurs · 9 rondes · 8 clubs · cas incomplets inclus</p></div><span className="status-pill"><Check/>Prêt</span></div>}
        {error && <div className="notice warning"><CircleAlert/><p>{error}</p></div>}
        <div className="card-actions"><a className="button ghost" href="/">Annuler</a><button disabled={!canContinue || loading} className="button primary" onClick={verify}>{loading ? "Analyse en cours…" : "Vérifier les données"} <ArrowRight/></button></div>
      </Card> : <ImportVerification mode={mode}/>}
    </div>
  );
}

function ImportVerification({ mode }: { mode: "url" | "file" | "demo" }) {
  return <Card className="verification">
    <div className="verification-head"><span className="success-circle"><Check/></span><div><h2>Données prêtes à être analysées</h2><p>Vérifiez les informations détectées avant de générer le rapport.</p></div></div>
    <dl className="verification-grid">
      <div><dt>Tournoi</dt><dd>{mode === "demo" ? demoReport.title : "Tournoi importé"}</dd></div>
      <div><dt>Source</dt><dd>{mode === "url" ? "FFE" : mode === "file" ? "CSV manuel" : "Démonstration"}</dd></div>
      <div><dt>Joueurs</dt><dd>{mode === "demo" ? "72" : "Données détectées"}</dd></div>
      <div><dt>Rondes</dt><dd>{mode === "demo" ? "9 / 9" : "Selon la source"}</dd></div>
      <div><dt>Clubs identifiés</dt><dd>{mode === "demo" ? "8" : "À vérifier"}</dd></div>
      <div><dt>Joueurs sans Elo</dt><dd>{mode === "demo" ? "5" : "À vérifier"}</dd></div>
    </dl>
    <div className="notice warning"><CircleAlert/><div><strong>2 éléments à vérifier</strong><p>Deux exempts et un forfait sont conservés mais exclus du calcul Elo.</p></div></div>
    <div className="card-actions"><a className="button secondary" href="/importer">Corriger les données</a><a className="button primary" href={`${BASE}/vue-ensemble`}>Générer le rapport <ArrowRight/></a></div>
  </Card>;
}

function TournamentHeader({ active }: { active: string }) {
  const [favorite, setFavorite] = useState(false);
  useEffect(() => { setFavorite(localStorage.getItem("eloscope:fav:tournament") === "1"); }, []);
  const toggleFavorite = () => {
    const next = !favorite; setFavorite(next); localStorage.setItem("eloscope:fav:tournament", next ? "1" : "0");
  };
  const tabs = [["vue-ensemble","Vue d’ensemble"],["classement","Classement"],["joueurs","Joueurs"],["clubs","Clubs"],["rondes","Rondes"],["comparer","Comparer"]];
  return <>
    <div className="breadcrumbs"><a href="/tournois">Tournois</a><span>/</span><strong>{demoReport.title}</strong></div>
    <div className="tournament-head">
      <div className="tournament-emblem"><Trophy/></div>
      <div><span className="status-pill success"><Check/>Terminé</span><h1>{demoReport.title}</h1><p><CalendarDays/>18–24 juillet 2026 <span>·</span> Le Touquet-Paris-Plage <span>·</span> 9 rondes <span>·</span> Standard</p><small>Source : démonstration structurée · Mis à jour à 07:42</small></div>
      <div className="head-actions">
        <button className="icon-button" title="Actualiser les données"><RefreshCcw/></button>
        <button className={`icon-button ${favorite ? "favorite" : ""}`} onClick={toggleFavorite} title={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}><Heart fill={favorite ? "currentColor" : "none"}/></button>
        <button className="button secondary" onClick={() => window.print()}><Printer/>PDF</button>
        <button className="button primary" onClick={exportReportJson}><Download/>Exporter <ChevronDown/></button>
      </div>
    </div>
    <nav className="context-tabs" aria-label="Sections du tournoi">
      {tabs.map(([key,label]) => <a href={`${BASE}/${key}`} className={active === key ? "active" : ""} key={key}>{label}</a>)}
    </nav>
  </>;
}

function TournamentOverview() {
  const median = [...demoEntries].filter((e) => e.startingRating).sort((a,b) => a.startingRating! - b.startingRating!)[33].startingRating!;
  const winner = [...demoEntries].sort((a,b) => (a.finalRank ?? 999) - (b.finalRank ?? 999))[0];
  const deltas = demoEntries.filter((entry) => entry.startingRating != null).map((entry) => ({ entry, relative: (entry.providedPerformance ?? entry.estimatedPerformance ?? entry.startingRating!) - entry.startingRating! }));
  const best = deltas.sort((a,b) => b.relative - a.relative)[0];
  const progressionOption: EChartsOption = useMemo(() => ({
    tooltip: { ...tooltip, trigger: "axis" }, grid: { left: 38, right: 24, top: 26, bottom: 30 },
    xAxis: { type: "category", data: [1,2,3,4,5,6,7,8,9], name: "Ronde", boundaryGap: false },
    yAxis: { type: "value", min: 0, max: 9, interval: 1.5, name: "Score" },
    series: featuredEntries.slice(0,5).map((entry,index) => ({
      name: entry.player.displayName, type: "line", smooth: .18, symbolSize: 7,
      data: entry.rounds.map((_,round) => entry.rounds.slice(0,round+1).reduce((sum,r) => sum+r.tournamentPoints,0)),
      lineStyle: { width: index === 0 ? 3 : 2, color: palette[index] }, itemStyle: { color: palette[index] },
      emphasis: { focus: "series" },
    })),
  }), []);
  const distributionOption: EChartsOption = useMemo(() => {
    const bins = [[0,1199],[1200,1399],[1400,1599],[1600,1799],[1800,1999],[2000,2199],[2200,2600]];
    return {
      tooltip: { ...tooltip, trigger: "axis" }, grid: { left: 35, right: 12, top: 18, bottom: 45 },
      xAxis: { type: "category", axisLabel: { fontSize: 10, interval: 0 }, data: ["< 1 200","1 200–1 399","1 400–1 599","1 600–1 799","1 800–1 999","2 000–2 199","2 200+"] },
      yAxis: { type: "value", name: "Joueurs", minInterval: 1 },
      series: [{ type: "bar", barWidth: "64%", itemStyle: { color: "#4F91A6", borderRadius: [4,4,0,0] }, data: bins.map(([min,max]) => demoEntries.filter((e) => e.startingRating != null && e.startingRating >= min && e.startingRating <= max).length) }],
    };
  }, []);
  const rankOption: EChartsOption = useMemo(() => ({
    tooltip: { ...tooltip, formatter: (params: unknown) => {
      const p = params as { data: { name: string; value: number[] } }; return `${p.data.name}<br/>Initial : ${p.data.value[0]} · Final : ${p.data.value[1]}`;
    }},
    grid: { left: 42, right: 15, top: 15, bottom: 36 },
    xAxis: { type: "value", inverse: false, name: "Rang initial", min: 1, max: 72 },
    yAxis: { type: "value", inverse: true, name: "Rang final", min: 1, max: 72 },
    series: [
      { type: "line", data: [[1,1],[72,72]], symbol: "none", lineStyle: { type: "dashed", color: "#98A2B3" }, silent: true },
      { type: "scatter", symbolSize: 8, data: demoEntries.map((e) => ({ name: e.player.displayName, value: [e.startingRank,e.finalRank], itemStyle: { color: (e.finalRank ?? 0) < (e.startingRank ?? 0) ? "#23855B" : (e.finalRank ?? 0) > (e.startingRank ?? 0) ? "#C2413A" : "#64748B" } })) },
    ],
  }), []);
  return <div className="report-page">
    <TournamentHeader active="vue-ensemble"/>
    <div className="kpi-grid five">
      <Kpi label="Participants" value="72" detail="4 fédérations" icon={<Users/>}/>
      <Kpi label="Elo médian" value={formatNumber(median)} detail="Moyenne : 1 762" icon={<Gauge/>}/>
      <Kpi label="Score du vainqueur" value={`${formatScore(winner.score)} / 9`} detail={`${Math.round(winner.score/9*100)} % des points`} tone="positive" icon={<Trophy/>}/>
      <Kpi label="Clubs représentés" value="8" detail="Tous identifiés" icon={<Building2/>}/>
      <Kpi label="Plus forte surperformance" value={signed(best.relative, 0)} detail={best.entry.player.displayName} tone="positive" icon={<BarChart3/>}/>
    </div>
    <Card className="chart-card wide">
      <SectionTitle help="Score cumulé après chaque ronde. Cliquez sur un nom dans la légende pour masquer une série." action={<span className="select-like">Top 5 joueurs <ChevronDown/></span>}>Progression du score</SectionTitle>
      <div className="chart-with-legend"><EChart option={progressionOption} height={310} ariaLabel="Courbes de progression du score des cinq premiers joueurs"/><div className="chart-legend">{featuredEntries.slice(0,5).map((entry,index)=><a href={routeForEntry(entry)} key={entry.id}><i style={{background:palette[index]}}/><span>{entry.player.displayName}<small>{formatScore(entry.score)} pts</small></span></a>)}</div></div>
      <details className="data-alternative"><summary>Afficher les données exactes</summary><p>{featuredEntries.slice(0,5).map((e) => `${e.player.displayName} : ${formatScore(e.score)}`).join(" · ")}</p></details>
    </Card>
    <div className="dashboard-grid">
      <Card className="chart-card"><SectionTitle help={`La ligne verticale correspond à la médiane : ${formatNumber(median)}.`}>Distribution Elo</SectionTitle><EChart option={distributionOption} height={260} ariaLabel="Histogramme de distribution des classements Elo"/></Card>
      <Card className="chart-card"><SectionTitle help="Sous la diagonale : progression au classement. Au-dessus : recul.">Classement initial contre final</SectionTitle><EChart option={rankOption} height={260} ariaLabel="Nuage de points du classement initial et final"/></Card>
      <Insights entries={demoEntries}/>
    </div>
  </div>;
}

function Insights({ entries }: { entries: DemoEntry[] }) {
  const improver = [...entries].sort((a,b) => ((b.startingRank ?? 0)-(b.finalRank ?? 0))-((a.startingRank ?? 0)-(a.finalRank ?? 0)))[0];
  const over = [...entries].filter((e) => e.startingRating).sort((a,b) =>
    ((b.providedPerformance ?? b.estimatedPerformance ?? 0)-b.startingRating!)-
    ((a.providedPerformance ?? a.estimatedPerformance ?? 0)-a.startingRating!)
  )[0];
  const hard = [...entries].sort((a,b) => averageOpponents(b)-averageOpponents(a))[0];
  return <Card className="insights"><SectionTitle>Enseignements</SectionTitle>
    <a href={routeForEntry(improver)}><span className="insight-icon positive"><ArrowRight/></span><div><strong>Plus forte progression</strong><p>{improver.player.displayName} gagne {(improver.startingRank ?? 0)-(improver.finalRank ?? 0)} places.</p></div></a>
    <a href={routeForEntry(over)}><span className="insight-icon warning"><Star/></span><div><strong>Surperformance marquante</strong><p>{over.player.displayName} joue {signed((over.providedPerformance ?? over.estimatedPerformance ?? 0)-(over.startingRating ?? 0),0)} au-dessus de son Elo.</p></div></a>
    <a href={routeForEntry(hard)}><span className="insight-icon neutral"><Gauge/></span><div><strong>Parcours le plus relevé</strong><p>Adversaires à {formatNumber(averageOpponents(hard))} Elo en moyenne.</p></div></a>
  </Card>;
}

function averageOpponents(entry: DemoEntry) {
  const rated = entry.rounds.filter((r) => r.opponentRating);
  return rated.reduce((sum,r) => sum+r.opponentRating!,0)/Math.max(rated.length,1);
}

function RankingPage() {
  const [query,setQuery] = useState("");
  const [onlyImproved,setOnlyImproved] = useState(false);
  const sorted = useMemo(() => demoEntries.filter((entry) =>
    entry.player.displayName.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")) &&
    (!onlyImproved || (entry.finalRank ?? 0) < (entry.startingRank ?? 0))
  ).sort((a,b) => (a.finalRank ?? 999)-(b.finalRank ?? 999)),[query,onlyImproved]);
  return <div className="report-page"><TournamentHeader active="classement"/>
    <Card className="table-card">
      <SectionTitle action={<button className="button secondary" onClick={() => exportEntriesCsv(sorted)}><Download/>Exporter CSV</button>}>Classement</SectionTitle>
      <div className="table-toolbar"><div className="input-with-icon"><Search/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Rechercher un joueur…" /></div><button className={`button secondary ${onlyImproved?"selected":""}`} onClick={()=>setOnlyImproved(v=>!v)}><Filter/>Progression</button><span>{sorted.length} joueurs</span></div>
      <div className="table-scroll"><table><thead><tr><th>Place</th><th>Joueur</th><th>Titre</th><th>Elo</th><th>Catégorie</th><th>Féd.</th><th>Club</th><th>Score</th><th>Buchholz</th><th>Performance</th><th>Var. Elo</th><th>Progression</th></tr></thead>
        <tbody>{sorted.map((entry,index)=>{
          const rating = entry.startingRating ?? 0;
          const scenario = calculateTournamentDelta(rating,entry.rounds,20);
          const progress=(entry.startingRank ?? 0)-(entry.finalRank ?? 0);
          return <tr key={entry.id} onClick={()=>location.href=routeForEntry(entry)} tabIndex={0}><td><span className={`rank rank-${index+1}`}>{entry.finalRank}</span></td><td><div className="player-cell"><Avatar name={entry.player.displayName} color={index}/><div><strong>{entry.player.displayName}</strong><small>{entry.club?.displayName}</small></div></div></td><td>{entry.player.title??"—"}</td><td>{entry.startingRating?formatNumber(entry.startingRating):"NC"}</td><td>{entry.player.category}</td><td>{entry.player.federation}</td><td>{entry.club?.displayName}</td><td><strong>{formatScore(entry.score)} / 9</strong></td><td>{formatNumber(entry.tieBreaks.buchholz ?? 0)}</td><td>{formatNumber(entry.providedPerformance ?? entry.estimatedPerformance ?? 0)}</td><td className={scenario.roundedTotalDelta>=0?"positive-text":"negative-text"}>{signed(scenario.roundedTotalDelta,0)}</td><td className={progress>0?"positive-text":progress<0?"negative-text":""}>{progress>0?"▲":progress<0?"▼":"●"} {Math.abs(progress)}</td></tr>
        })}</tbody></table></div>
    </Card>
  </div>;
}

function PlayerReport({ id }: { id?: string }) {
  const entry=getEntry(id);
  const ordered=[...demoEntries].sort((a,b)=>(a.finalRank??999)-(b.finalRank??999));
  const index=ordered.findIndex((e)=>e.id===entry.id);
  const previous=ordered[(index-1+ordered.length)%ordered.length];
  const next=ordered[(index+1)%ordered.length];
  const [k,setK]=useState(20);
  const [initial,setInitial]=useState(entry.startingRating ?? 1800);
  const [metric,setMetric]=useState("elo");
  const [selectedRound,setSelectedRound]=useState<number|null>(null);
  useEffect(()=>{setInitial(entry.startingRating??1800);setSelectedRound(null);},[entry.id,entry.startingRating]);
  const scenario=useMemo(()=>calculateTournamentDelta(initial,entry.rounds,k,RULESETS["fide-standard-2024"]),[initial,entry.rounds,k]);
  const performance=entry.providedPerformance??entry.estimatedPerformance??0;
  const places=(entry.startingRank??0)-(entry.finalRank??0);
  const lineOption:EChartsOption=useMemo(()=>({
    tooltip:{...tooltip,trigger:"axis"},grid:{left:45,right:18,top:20,bottom:35},
    xAxis:{type:"category",data:[0,...entry.rounds.map(r=>r.round)],name:"Ronde",boundaryGap:false},
    yAxis:{type:"value",name:"Variation",axisLabel:{formatter:(v:number)=>signed(v,0)}},
    series:[{type:"line",smooth:.18,symbolSize:8,data:[0,...scenario.perRound.map(r=>Number(r.cumulative.toFixed(2)))],lineStyle:{color:"#23855B",width:3},itemStyle:{color:(params:{dataIndex:number})=>params.dataIndex===0||scenario.perRound[params.dataIndex-1]?.rawDelta>=0?"#23855B":"#C2413A"},areaStyle:{color:"rgba(35,133,91,.10)"}}],
  }),[entry.rounds,scenario]);
  const waterfallOption:EChartsOption=useMemo(()=>({
    tooltip:{...tooltip,formatter:(p:unknown)=>{const x=p as {dataIndex:number};const r=scenario.perRound[x.dataIndex];return `Ronde ${r.round}<br/>Variation : ${signed(r.rawDelta)}<br/>Cumul : ${signed(r.cumulative)}`}},
    grid:{left:45,right:18,top:20,bottom:35},xAxis:{type:"category",data:scenario.perRound.map(r=>`R${r.round}`)},yAxis:{type:"value",name:"Points Elo"},
    series:[{type:"bar",data:scenario.perRound.map(r=>({value:Number(r.rawDelta.toFixed(2)),itemStyle:{color:r.rawDelta>0?"#23855B":r.rawDelta<0?"#C2413A":"#64748B",borderRadius:r.rawDelta>=0?[4,4,0,0]:[0,0,4,4]}})),barWidth:"55%"}],
  }),[scenario]);
  const white=entry.rounds.filter(r=>r.color==="WHITE");
  const black=entry.rounds.filter(r=>r.color==="BLACK");
  return <div className="report-page">
    <div className="breadcrumbs"><a href="/tournois">Tournois</a><span>/</span><a href={`${BASE}/vue-ensemble`}>{demoReport.title}</a><span>/</span><a href={`${BASE}/clubs/${entry.clubId}`}>{entry.club?.displayName}</a><span>/</span><strong>{entry.player.displayName}</strong></div>
    <div className="player-head">
      <div className="player-identity"><Avatar name={entry.player.displayName}/><div><span className="status-pill">{entry.player.title??entry.player.category}</span><h1>{entry.player.displayName}</h1><p><Building2/>{entry.club?.displayName} · {entry.player.federation}</p><small>Elo initial <strong>{formatNumber(initial)}</strong></small></div></div>
      <div className="player-nav"><a className="button secondary" href={routeForEntry(previous)}><ArrowLeft/>Précédent</a><label><span className="sr-only">Joueur courant</span><select value={entry.id} onChange={(e)=>location.href=routeForEntry(getEntry(e.target.value))}>{ordered.map(e=><option value={e.id} key={e.id}>{e.player.displayName}</option>)}</select></label><a className="button secondary" href={routeForEntry(next)}>Suivant<ArrowRight/></a></div>
    </div>
    <div className="kpi-grid five">
      <Kpi label="Score" value={`${formatScore(entry.score)} / 9`} detail={`${Math.round(entry.score/9*100)} %`} tone="positive" icon={<Star/>}/>
      <Kpi label="Classement final" value={`${entry.finalRank}e / 72`} detail={`Départ : ${entry.startingRank}e`} icon={<Trophy/>}/>
      <Kpi label="Performance" value={formatNumber(performance)} detail={`${signed(performance-initial,0)} vs Elo`} icon={<Gauge/>}/>
      <Kpi label="Places gagnées" value={signed(places,0)} detail={`${entry.startingRank}e → ${entry.finalRank}e`} tone={places>=0?"positive":"negative"} icon={<ArrowRight/>}/>
      <Kpi label="Variation Elo estimée" value={signed(scenario.roundedTotalDelta,0)} detail={`${formatNumber(initial)} → ${formatNumber(scenario.estimatedNewRating)}`} tone={scenario.roundedTotalDelta>=0?"positive":"negative"} icon={<BarChart3/>}/>
    </div>
    <div className="player-layout"><div className="player-main">
      <Card className="chart-card">
        <div className="metric-tabs">{[["score","Score"],["elo","Variation Elo"],["rank","Classement"],["performance","Performance"]].map(([key,label])=><button key={key} className={metric===key?"selected":""} onClick={()=>setMetric(key)}>{label}</button>)}</div>
        <SectionTitle help="Somme des variations brutes, arrondie une seule fois au total." action={<span className={`status-pill ${scenario.roundedTotalDelta>=0?"success":"danger"}`}>Final : {signed(scenario.roundedTotalDelta,0)}</span>}>{metric==="elo"?"Variation Elo cumulée":metric==="score"?"Score cumulé":metric==="rank"?"Évolution du classement":"Performance estimée"}</SectionTitle>
        <EChart option={lineOption} height={280} ariaLabel="Courbe de variation Elo cumulée" onClick={(params)=>setSelectedRound((params as {dataIndex:number}).dataIndex)}/>
        <SectionTitle help="Contribution estimée de chaque ronde à la variation totale.">Variation par ronde</SectionTitle>
        <EChart option={waterfallOption} height={190} ariaLabel="Barres de variation Elo pour chaque ronde"/>
      </Card>
      <RoundTable entry={entry} scenario={scenario} selectedRound={selectedRound}/>
    </div><aside className="player-aside">
      <RatingSettings k={k} setK={setK} initial={initial} setInitial={setInitial}/>
      <PlayerSummary entry={entry} scenario={scenario} performance={performance}/>
      <ColorResults white={white} black={black}/>
      <OpponentStrength entry={entry} scenario={scenario}/>
    </aside></div>
    <p className="rating-disclaimer">Cette estimation porte uniquement sur les parties disponibles dans ce rapport. Le classement officiellement publié peut différer selon les autres compétitions intégrées à la même période, les règles applicables et l’homologation effective des parties.</p>
  </div>;
}

function RatingSettings({k,setK,initial,setInitial}:{k:number;setK:(v:number)=>void;initial:number;setInitial:(v:number)=>void}) {
  return <Card className="settings-card"><SectionTitle help="Le coefficient K mesure la sensibilité du classement à un résultat.">Estimation Elo</SectionTitle>
    <label>Classement avant le tournoi<input type="number" value={initial} min={800} max={3000} onChange={e=>setInitial(Number(e.target.value)||800)}/></label>
    <span className="field-label">Coefficient K</span><div className="k-buttons">{[10,20,40].map(v=><button key={v} className={k===v?"selected":""} onClick={()=>setK(v)}>{v}</button>)}<input aria-label="Coefficient K personnalisé" type="number" min={1} max={100} value={k} onChange={e=>setK(Math.max(1,Math.min(100,Number(e.target.value)||1)))}/></div>
    <label>Règles de calcul<select><option>Estimation FIDE standard actuelle</option></select></label>
    <label>Type de classement<select><option>Standard</option><option>Rapide</option><option>Blitz</option></select></label>
    <p className="field-help"><CircleAlert/>Vérifiez votre coefficient K sur votre fiche officielle.</p>
  </Card>;
}

function RoundTable({entry,scenario,selectedRound}:{entry:DemoEntry;scenario:ReturnType<typeof calculateTournamentDelta>;selectedRound:number|null}) {
  return <Card className="table-card rounds-table"><SectionTitle action={<button className="button secondary" onClick={()=> {
    const rows=entry.rounds.map((r,i)=>[r.round,r.opponentName??"",r.opponentRating??"",r.sourceNotation??"",scenario.perRound[i].expected??"",scenario.perRound[i].rawDelta,scenario.perRound[i].cumulative]);
    downloadText("rondes-joueur.csv",[["Ronde","Adversaire","Elo","Résultat","Attendu","Variation","Cumul"],...rows].map(row=>row.join(";")).join("\n"),"text/csv");
  }}><Download/>CSV</button>}>Détail des rondes</SectionTitle><div className="table-scroll"><table><thead><tr><th>Ronde</th><th>Couleur</th><th>Adversaire</th><th>Elo</th><th>Résultat</th><th>Attendu</th><th>Var. Elo</th><th>Cumul</th><th>Statut</th></tr></thead><tbody>{entry.rounds.map((round,i)=>{
    const calc=scenario.perRound[i];const status=round.bye?"Exempt":round.forfeit?"Forfait perdu":!round.rated?"Jouée non cotée":"Jouée et cotée";
    return <tr key={round.round} className={selectedRound===round.round?"highlight":""}><td>{round.round}</td><td>{round.color==="WHITE"?"○ Blancs":round.color==="BLACK"?"● Noirs":"—"}</td><td><strong>{round.opponentName??"—"}</strong></td><td>{round.opponentRating?formatNumber(round.opponentRating):"—"}</td><td><span className={`result result-${round.result}`}>{round.bye?"E":round.forfeit?"F":round.result===1?"V · 1":round.result===.5?"N · ½":"D · 0"}</span></td><td>{calc.expected==null?"—":formatNumber(calc.expected)}</td><td className={calc.rawDelta>0?"positive-text":calc.rawDelta<0?"negative-text":""}>{calc.included?signed(calc.rawDelta):"0,0"}</td><td>{signed(calc.cumulative)}</td><td>{status}</td></tr>
  })}</tbody></table></div>
  <div className="round-cards">{entry.rounds.map((round,i)=><article key={round.round}><strong>Ronde {round.round} · {round.color==="WHITE"?"Blancs":round.color==="BLACK"?"Noirs":"Sans couleur"}</strong><p>contre {round.opponentName??"—"} · {round.opponentRating??"—"}</p><span>{round.bye?"Exempt":round.forfeit?"Forfait":round.result===1?"Victoire":round.result===.5?"Nulle":"Défaite"}</span><dl><div><dt>Attendu</dt><dd>{scenario.perRound[i].expected==null?"—":formatNumber(scenario.perRound[i].expected!)}</dd></div><div><dt>Variation</dt><dd>{signed(scenario.perRound[i].rawDelta)}</dd></div><div><dt>Cumul</dt><dd>{signed(scenario.perRound[i].cumulative)}</dd></div></dl></article>)}</div>
  </Card>;
}

function PlayerSummary({entry,scenario,performance}:{entry:DemoEntry;scenario:ReturnType<typeof calculateTournamentDelta>;performance:number}) {
  const best=[...scenario.perRound].sort((a,b)=>b.rawDelta-a.rawDelta)[0];
  return <Card className="summary-card"><SectionTitle>Synthèse</SectionTitle><p>{entry.player.displayName} termine {entry.finalRank}e avec {formatScore(entry.score)} points sur 9 et une performance {entry.providedPerformance?"fournie":"estimée"} de {formatNumber(performance)}.</p><p>La variation estimée est de <strong className={scenario.roundedTotalDelta>=0?"positive-text":"negative-text"}>{signed(scenario.roundedTotalDelta,0)} Elo</strong>. La ronde {best.round} a le plus contribué au résultat ({signed(best.rawDelta)}).</p><div className="key-takeaway"><Trophy/><span><strong>À retenir</strong>Cette synthèse interprète uniquement les résultats, jamais la qualité des coups.</span></div></Card>;
}

function ColorResults({white,black}:{white:DemoEntry["rounds"];black:DemoEntry["rounds"]}) {
  const row=(label:string,rounds:DemoEntry["rounds"])=>{const score=rounds.reduce((s,r)=>s+(r.result??0),0);return <div className="result-bar"><span>{label} ({rounds.length})</span><div><i style={{width:`${score/Math.max(rounds.length,1)*100}%`}}/></div><strong>{formatScore(score)} / {rounds.length}</strong><b>{formatNumber(score/Math.max(rounds.length,1)*100)} %</b></div>};
  return <Card><SectionTitle>Résultats par couleur</SectionTitle>{row("Blancs",white)}{row("Noirs",black)}</Card>;
}

function OpponentStrength({entry,scenario}:{entry:DemoEntry;scenario:ReturnType<typeof calculateTournamentDelta>}) {
  const groups=[{label:"Plus forts",test:(r:DemoEntry["rounds"][number])=>(r.opponentRating??0)-(entry.startingRating??0)>=100},{label:"Similaires",test:(r:DemoEntry["rounds"][number])=>Math.abs((r.opponentRating??0)-(entry.startingRating??0))<100},{label:"Moins forts",test:(r:DemoEntry["rounds"][number])=>(entry.startingRating??0)-(r.opponentRating??0)>=100}];
  return <Card><SectionTitle help="Plus fort : +100 Elo ou davantage. Similaire : écart inférieur à 100 Elo.">Force adverse</SectionTitle>{groups.map(group=>{const indexes=entry.rounds.map((r,i)=>group.test(r)?i:-1).filter(i=>i>=0);const score=indexes.reduce((s,i)=>s+(entry.rounds[i].result??0),0);const delta=indexes.reduce((s,i)=>s+scenario.perRound[i].rawDelta,0);return <div className="strength-row" key={group.label}><span>{group.label}</span><strong>{formatScore(score)} / {indexes.length}</strong><b className={delta>=0?"positive-text":"negative-text"}>{signed(delta)}</b></div>})}</Card>;
}

function ClubDirectory() {
  return <div className="report-page"><TournamentHeader active="clubs"/><div className="page-heading inline"><div><h1>Clubs représentés</h1><p>8 clubs identifiés dans les données de démonstration.</p></div></div><div className="club-grid">{clubs.map((club,index)=>{const entries=getClubEntries(club.id);const average=entries.reduce((s,e)=>s+e.score,0)/entries.length;return <a className="club-card" href={`${BASE}/clubs/${club.id}`} key={club.id}><span className="club-icon"><Building2/></span><div><h3>{club.displayName}</h3><p>{entries.length} joueurs · score moyen {formatNumber(average)}</p><small>Voir l’analyse collective <ArrowRight/></small></div><span className={`avatar avatar-${index%4}`}>{entries.length}</span></a>})}</div></div>;
}

function ClubReport({ id }: { id?: string }) {
  const club=clubs.find(c=>c.id===id)??clubs[0];
  const [minimum,setMinimum]=useState(0);
  const [query,setQuery]=useState("");
  const entries=getClubEntries(club.id).filter(e=>(e.startingRating??0)>=minimum&&e.player.displayName.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")));
  const scenarios=entries.map(e=>({entry:e,scenario:calculateTournamentDelta(e.startingRating??1800,e.rounds,20)}));
  const medianPerf=[...entries].map(e=>e.providedPerformance??e.estimatedPerformance??0).sort((a,b)=>a-b)[Math.floor(entries.length/2)]??0;
  const totalDelta=scenarios.reduce((s,x)=>s+x.scenario.rawTotalDelta,0);
  const scatterOption:EChartsOption=useMemo(()=>({
    tooltip:{...tooltip,formatter:(p:unknown)=>{const x=p as {data:{name:string;value:number[]}};return `${x.data.name}<br/>Elo : ${x.data.value[0]}<br/>Performance : ${x.data.value[1]}`}},
    grid:{left:48,right:18,top:20,bottom:38},xAxis:{type:"value",name:"Elo initial",min:1000,max:2300},yAxis:{type:"value",name:"Performance",min:1000,max:2400},
    series:[{type:"line",data:[[1000,1000],[2300,2300]],symbol:"none",lineStyle:{type:"dashed",color:"#98A2B3"},silent:true},{type:"scatter",symbolSize:13,data:entries.map(e=>{const p=e.providedPerformance??e.estimatedPerformance??0;return{name:e.player.displayName,value:[e.startingRating??1000,p],itemStyle:{color:p-(e.startingRating??p)>50?"#23855B":p-(e.startingRating??p)<-50?"#C2413A":"#64748B"}}})}],
  }),[entries]);
  const heatmapOption:EChartsOption=useMemo(()=>({
    tooltip:{...tooltip,formatter:(p:unknown)=>{const x=p as {data:{name:string;value:number[];labelText:string}};return `${x.data.name}<br/>Ronde ${x.data.value[0]+1} · ${x.data.labelText}`}},
    grid:{left:120,right:15,top:25,bottom:28},xAxis:{type:"category",data:[1,2,3,4,5,6,7,8,9],splitArea:{show:true}},yAxis:{type:"category",data:entries.map(e=>e.player.displayName),axisLabel:{width:105,overflow:"truncate"},splitArea:{show:true}},
    visualMap:{show:false,min:0,max:3,inRange:{color:["#FDEDEC","#EEF2F6","#EAF6F0","#FFF4E5"]}},
    series:[{type:"heatmap",label:{show:true,formatter:(p:unknown)=>(p as {data:{labelText:string}}).data.labelText},data:entries.flatMap((e,y)=>e.rounds.map((r,x)=>({name:e.player.displayName,value:[x,y,r.bye||r.forfeit?3:r.result===1?2:r.result===.5?1:0],labelText:r.bye?"E":r.forfeit?"F":r.result===1?"V":r.result===.5?"N":"D"})))}],
  }),[entries]);
  return <div className="report-page"><div className="breadcrumbs"><a href="/tournois">Tournois</a><span>/</span><a href={`${BASE}/vue-ensemble`}>{demoReport.title}</a><span>/</span><strong>{club.displayName}</strong></div>
    <div className="club-head"><span className="club-icon large"><Building2/></span><div><span className="eyebrow">Analyse collective</span><h1>{club.displayName}</h1><p>{entries.length} joueurs · {demoReport.title}</p></div><button className="button secondary" onClick={()=>exportEntriesCsv(entries,"joueurs-club.csv")}><Download/>Exporter le rapport</button></div>
    <div className="kpi-grid six"><Kpi label="Joueurs" value={entries.length} detail="Tous actifs" icon={<Users/>}/><Kpi label="Score moyen" value={formatNumber(entries.reduce((s,e)=>s+e.score,0)/Math.max(entries.length,1))} detail="Sur 9 rondes" icon={<Trophy/>}/><Kpi label="Performance médiane" value={formatNumber(medianPerf)} detail="Estimation incluse" icon={<Gauge/>}/><Kpi label="Variation cumulée" value={signed(totalDelta,0)} detail={`Médiane ${signed(totalDelta/Math.max(entries.length,1),0)}`} tone={totalDelta>=0?"positive":"negative"} icon={<BarChart3/>}/><Kpi label="Surperformance" value={`${Math.round(entries.filter(e=>(e.providedPerformance??e.estimatedPerformance??0)>(e.startingRating??9999)).length/Math.max(entries.length,1)*100)} %`} detail="des joueurs" tone="positive" icon={<ArrowRight/>}/><Kpi label="Parcours moyen" value={formatNumber(entries.reduce((s,e)=>s+averageOpponents(e),0)/Math.max(entries.length,1))} detail="Elo adverse" icon={<Target/>}/></div>
    <div className="club-layout"><aside className="filters-panel"><h2><Filter/>Filtres</h2><label>Joueur<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nom du joueur"/></label><label>Elo minimum<input type="range" min="0" max="2100" step="100" value={minimum} onChange={e=>setMinimum(Number(e.target.value))}/><span>{minimum===0?"Tous":formatNumber(minimum)+" Elo"}</span></label><button className="button secondary" onClick={()=>{setMinimum(0);setQuery("")}}><RefreshCcw/>Réinitialiser</button><small>{entries.length} joueurs correspondent</small></aside>
      <div className="club-content"><div className="club-charts"><Card className="chart-card"><SectionTitle>Elo initial vs performance</SectionTitle><EChart option={scatterOption} height={330} ariaLabel="Nuage de points Elo initial contre performance"/></Card><Card className="chart-card"><SectionTitle>Résultats par ronde</SectionTitle><EChart option={heatmapOption} height={330} ariaLabel="Carte de chaleur des résultats par joueur et par ronde"/></Card></div><ClubTable entries={entries}/></div>
    </div>
  </div>;
}

function ClubTable({entries}:{entries:DemoEntry[]}) {
  return <Card className="table-card"><SectionTitle>Joueurs du club</SectionTitle><div className="table-scroll"><table><thead><tr><th>Joueur</th><th>Elo</th><th>Score</th><th>Performance</th><th>Écart</th><th>Var. Elo</th><th>Départ</th><th>Final</th><th>Progression</th></tr></thead><tbody>{entries.map((entry,index)=>{const p=entry.providedPerformance??entry.estimatedPerformance??0;const scenario=calculateTournamentDelta(entry.startingRating??1800,entry.rounds,20);const progress=(entry.startingRank??0)-(entry.finalRank??0);return <tr key={entry.id} onClick={()=>location.href=routeForEntry(entry)}><td><div className="player-cell"><Avatar name={entry.player.displayName} color={index}/><strong>{entry.player.displayName}</strong></div></td><td>{entry.startingRating??"NC"}</td><td>{formatScore(entry.score)} / 9</td><td>{formatNumber(p)}</td><td className={p-(entry.startingRating??p)>=0?"positive-text":"negative-text"}>{signed(p-(entry.startingRating??p),0)}</td><td className={scenario.rawTotalDelta>=0?"positive-text":"negative-text"}>{signed(scenario.rawTotalDelta)}</td><td>{entry.startingRank}</td><td>{entry.finalRank}</td><td>{progress>0?"▲":progress<0?"▼":"●"} {Math.abs(progress)}</td></tr>})}</tbody></table></div></Card>;
}

function RoundsPage() {
  const [round,setRound]=useState(1);
  const games=demoEntries.filter((_,i)=>i%2===0).map(e=>({entry:e,result:e.rounds[round-1]}));
  const wins=games.filter(g=>g.result.result===1).length, draws=games.filter(g=>g.result.result===.5).length;
  return <div className="report-page"><TournamentHeader active="rondes"/><div className="round-selector"><div><span className="eyebrow">Analyse par ronde</span><h1>Ronde {round}</h1></div><div>{Array.from({length:9},(_,i)=><button className={round===i+1?"selected":""} onClick={()=>setRound(i+1)} key={i}>{i+1}</button>)}</div></div>
    <div className="kpi-grid five"><Kpi label="Victoires" value={wins} detail="résultats décisifs" tone="positive" icon={<Check/>}/><Kpi label="Nulles" value={draws} detail="½–½" icon={<Target/>}/><Kpi label="Défaites" value={games.length-wins-draws} detail="sur les échiquiers suivis" tone="negative" icon={<X/>}/><Kpi label="Forfaits / exempts" value={games.filter(g=>g.result.bye||g.result.forfeit).length} detail="exclus du calcul Elo" tone="warning" icon={<CircleAlert/>}/><Kpi label="Plus gros écart" value="412" detail="points Elo" icon={<Gauge/>}/></div>
    <Card className="table-card"><SectionTitle>Rencontres de la ronde</SectionTitle><div className="table-scroll"><table><thead><tr><th>Éch.</th><th>Blancs</th><th>Elo</th><th>Résultat</th><th>Noirs</th><th>Elo</th><th>Écart</th></tr></thead><tbody>{games.map((game,i)=><tr key={game.entry.id}><td>{i+1}</td><td><a href={routeForEntry(game.entry)}>{game.entry.player.displayName}</a></td><td>{game.entry.startingRating??"NC"}</td><td><span className={`result result-${game.result.result}`}>{game.result.sourceNotation}</span></td><td>{game.result.opponentName??"—"}</td><td>{game.result.opponentRating??"—"}</td><td>{game.result.opponentRating&&game.entry.startingRating?Math.abs(game.result.opponentRating-game.entry.startingRating):"—"}</td></tr>)}</tbody></table></div></Card>
  </div>;
}

function ComparePage() {
  const [ids,setIds]=useState(featuredEntries.slice(0,3).map(e=>e.id));
  const selected=ids.map(id=>getEntry(id));
  const add=demoEntries.find(e=>!ids.includes(e.id));
  const metrics=[
    {label:"Score",value:(e:DemoEntry)=>`${formatScore(e.score)} / 9`,bar:(e:DemoEntry)=>e.score/9*100},
    {label:"Performance",value:(e:DemoEntry)=>formatNumber(e.providedPerformance??e.estimatedPerformance??0),bar:(e:DemoEntry)=>(e.providedPerformance??e.estimatedPerformance??0)/2600*100},
    {label:"Écart perf. / Elo",value:(e:DemoEntry)=>signed((e.providedPerformance??e.estimatedPerformance??0)-(e.startingRating??0),0),bar:(e:DemoEntry)=>Math.max(4,((e.providedPerformance??e.estimatedPerformance??0)-(e.startingRating??0)+300)/6)},
    {label:"Variation Elo",value:(e:DemoEntry)=>signed(calculateTournamentDelta(e.startingRating??1800,e.rounds,20).rawTotalDelta),bar:(e:DemoEntry)=>Math.max(4,(calculateTournamentDelta(e.startingRating??1800,e.rounds,20).rawTotalDelta+50))},
    {label:"Places gagnées",value:(e:DemoEntry)=>signed((e.startingRank??0)-(e.finalRank??0),0),bar:(e:DemoEntry)=>Math.max(4,((e.startingRank??0)-(e.finalRank??0)+30))},
    {label:"Elo moyen adverse",value:(e:DemoEntry)=>formatNumber(averageOpponents(e)),bar:(e:DemoEntry)=>averageOpponents(e)/2400*100},
  ];
  return <div className="report-page"><TournamentHeader active="comparer"/><div className="compare-head"><div><span className="eyebrow">2 à 4 joueurs</span><h1>Comparer les parcours</h1><p>Mêmes échelles, mêmes règles de calcul, valeurs exactes.</p></div>{ids.length<4&&add&&<button className="button secondary" onClick={()=>setIds([...ids,add.id])}><Users/>Ajouter un joueur</button>}</div>
    <Card className="compare-board"><div className="compare-row compare-players"><div className="compare-label">Joueurs</div>{selected.map((entry,index)=><a href={routeForEntry(entry)} key={entry.id} className="compare-player" style={{borderTopColor:palette[index]}}><button aria-label={`Retirer ${entry.player.displayName}`} onClick={(event)=>{event.preventDefault();if(ids.length>2)setIds(ids.filter(id=>id!==entry.id))}}><X/></button><Avatar name={entry.player.displayName} color={index}/><div><strong>{entry.player.displayName}</strong><small>{entry.player.title??entry.player.category} · {entry.startingRating??"NC"}</small></div></a>)}</div>
      {metrics.map(metric=><div className="compare-row" key={metric.label}><div className="compare-label">{metric.label}<HelpCircle/></div>{selected.map((entry,index)=><div className="compare-metric" key={entry.id}><strong>{metric.value(entry)}</strong><div><i style={{width:`${Math.min(100,metric.bar(entry))}%`,background:palette[index]}}/></div></div>)}</div>)}
      <div className="compare-row compare-sparks"><div className="compare-label">Progression<br/><small>par ronde</small></div>{selected.map((entry,index)=>{const data=entry.rounds.map((_,i)=>entry.rounds.slice(0,i+1).reduce((s,r)=>s+r.tournamentPoints,0));const option:EChartsOption={grid:{left:2,right:2,top:6,bottom:4},xAxis:{type:"category",show:false,data:[1,2,3,4,5,6,7,8,9]},yAxis:{type:"value",show:false,min:0,max:9},series:[{type:"line",data,smooth:.2,symbolSize:4,lineStyle:{color:palette[index],width:2},itemStyle:{color:palette[index]},areaStyle:{color:`${palette[index]}18`}}]};return <EChart key={entry.id} option={option} height={110} ariaLabel={`Progression de ${entry.player.displayName}`}/>})}</div>
    </Card>
    <Card className="table-card"><SectionTitle action={<button className="button secondary" onClick={()=>exportEntriesCsv(selected,"comparaison-joueurs.csv")}><Download/>CSV</button>}>Valeurs exactes</SectionTitle><div className="table-scroll"><table><thead><tr><th>Joueur</th><th>Parties</th><th>Score</th><th>Elo initial</th><th>Performance</th><th>Var. Elo</th><th>Victoires</th><th>Nulles</th><th>Défaites</th></tr></thead><tbody>{selected.map((e,i)=><tr key={e.id} onClick={()=>location.href=routeForEntry(e)}><td><div className="player-cell"><i style={{background:palette[i]}}/><strong>{e.player.displayName}</strong></div></td><td>{e.rounds.filter(r=>r.played).length}</td><td>{formatScore(e.score)}</td><td>{e.startingRating??"NC"}</td><td>{e.providedPerformance??e.estimatedPerformance}</td><td>{signed(calculateTournamentDelta(e.startingRating??1800,e.rounds,20).rawTotalDelta)}</td><td>{e.rounds.filter(r=>r.result===1&&r.played).length}</td><td>{e.rounds.filter(r=>r.result===.5).length}</td><td>{e.rounds.filter(r=>r.result===0&&r.played).length}</td></tr>)}</tbody></table></div></Card>
  </div>;
}

function Directory({mode}:{mode:"players"|"clubs"}) {
  if(mode==="clubs") return <ClubDirectory/>;
  return <div className="plain-page"><div className="page-heading"><span className="eyebrow">Annuaire local</span><h1>Joueurs importés</h1><p>Les 72 participants du tournoi de démonstration.</p></div><div className="directory-grid">{entriesByInitialRank.map((entry,index)=><a href={routeForEntry(entry)} key={entry.id}><Avatar name={entry.player.displayName} color={index}/><span><strong>{entry.player.displayName}</strong><small>{entry.startingRating??"Non classé"} · {entry.club?.displayName}</small></span><ArrowRight/></a>)}</div></div>;
}

function ReportsList({title,favorite=false}:{title:string;favorite?:boolean}) {
  const [visible,setVisible]=useState(!favorite);
  useEffect(()=>{if(favorite)setVisible(localStorage.getItem("eloscope:fav:tournament")==="1")},[favorite]);
  return <div className="plain-page"><div className="page-heading"><span className="eyebrow">Bibliothèque locale</span><h1>{title}</h1><p>Ces éléments sont conservés uniquement sur cet appareil dans le MVP.</p></div>{visible?<div className="report-grid"><a href={`${BASE}/vue-ensemble`} className="report-card"><div className="report-badge"><Trophy/></div><span className="status-pill success"><Check/>Terminé</span><h3>{demoReport.title}</h3><p>72 joueurs · 9 rondes · Démonstration</p><small>Mis à jour le 24 juillet 2026 à 07:42</small></a></div>:<EmptyState title="Aucun favori">Ajoutez un tournoi, un joueur, un club ou une comparaison à vos favoris.</EmptyState>}</div>;
}

function MethodPage() {
  return <div className="narrow-page"><div className="page-heading"><span className="eyebrow">Méthode transparente</span><h1>À propos des calculs Elo</h1><p>EloScope produit une estimation reproductible à partir des résultats disponibles.</p></div><Card className="prose-card"><h2>Score attendu</h2><p>La probabilité théorique de marquer un point est lue dans la table FIDE versionnée selon l’écart de classement. Le ruleset standard plafonne cet écart à 400 points.</p><h2>Variation par partie</h2><p><code>coefficient K × (score réalisé − score attendu)</code></p><p>Une victoire vaut 1, une nulle ½ et une défaite 0. Les parties non jouées, non cotées, les exempts et les forfaits sont exclus.</p><h2>Arrondi</h2><p>Les deltas bruts sont additionnés, puis le total est arrondi une seule fois à l’entier le plus proche.</p><div className="notice warning"><CircleAlert/><p>Vérifiez toujours votre coefficient K sur votre fiche officielle. L’estimation peut différer du classement publié.</p></div></Card></div>;
}
