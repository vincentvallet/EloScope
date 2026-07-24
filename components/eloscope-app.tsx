"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { EChartsOption } from "echarts";
import {
  ArrowLeft, ArrowRight, BarChart3, Building2, CalendarDays, Check, ChevronDown,
  CircleAlert, Clock3, Download, Gauge, HelpCircle, Home, Import,
  Info, Menu, Printer, RefreshCcw, Search, Settings, Star, Target, Trophy,
  UserRound, Users,
} from "lucide-react";
import type { ImportedPlayer, NormalizedTournament } from "@/lib/importers/types";
import type { RoundResult } from "@/lib/domain";
import { calculateTournamentDelta, RULESETS } from "@/lib/rating/engine";
import { formatNumber, formatScore, signed } from "@/lib/format";
import { Avatar, Card, EmptyState, Kpi, SectionTitle } from "@/components/ui";
import { EChart } from "@/components/echart";

const LEGACY_STORAGE_KEY = "eloscope:ffe-report";
const SESSION_REPORT_KEY = "eloscope:session-report";
const SESSION_HISTORY_KEY = "eloscope:session-history";
const BASE = "/tournoi/importe";
const colors = ["#356B82", "#7158A5", "#2B8295", "#C47B2E", "#64748B"];
const tooltip = {
  backgroundColor: "#17211B",
  borderWidth: 0,
  textStyle: { color: "#fff", fontFamily: "Inter, sans-serif", fontSize: 12 },
};

function toRatingRounds(player: ImportedPlayer): RoundResult[] {
  return player.rounds.map((round) => ({
    round: round.round,
    opponentName: round.opponentName,
    opponentRating: round.opponentRating,
    color: round.color === "WHITE" ? "WHITE" : round.color === "BLACK" ? "BLACK" : "UNKNOWN",
    result: round.result,
    tournamentPoints: round.result ?? 0,
    played: round.played,
    rated: round.played && round.opponentRating != null,
    bye: !round.played && /exempt/i.test(round.notation),
    forfeit: !round.played && /forfait|[<>]/i.test(round.notation),
    sourceNotation: round.notation,
  }));
}

function useImportedReport() {
  const [report, setReport] = useState<NormalizedTournament | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      const stored = sessionStorage.getItem(SESSION_REPORT_KEY);
      setReport(stored ? JSON.parse(stored) as NormalizedTournament : null);
    } catch {
      sessionStorage.removeItem(SESSION_REPORT_KEY);
    }
    setReady(true);
  }, []);
  return { report, ready, setReport };
}

type SessionHistory = {
  tournaments: Array<{ title: string; sourceUrl?: string; players: number; rounds: number; searchedAt: string }>;
  players: Array<{ id: string; name: string; rating?: number; club?: string; tournament: string; searchedAt: string }>;
};

const emptyHistory = (): SessionHistory => ({ tournaments: [], players: [] });

function readSessionHistory() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SESSION_HISTORY_KEY) ?? "") as Partial<SessionHistory>;
    return {
      tournaments: Array.isArray(parsed.tournaments) ? parsed.tournaments : [],
      players: Array.isArray(parsed.players) ? parsed.players : [],
    };
  } catch {
    return emptyHistory();
  }
}

function rememberTournament(report: NormalizedTournament) {
  const history = readSessionHistory();
  history.tournaments = [
    {
      title: report.report.title,
      sourceUrl: report.report.sourceUrl,
      players: report.players.length,
      rounds: report.report.totalRounds,
      searchedAt: new Date().toISOString(),
    },
    ...history.tournaments.filter((item) => item.sourceUrl !== report.report.sourceUrl),
  ].slice(0, 6);
  sessionStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(history));
}

function rememberPlayer(player: ImportedPlayer, tournament: string) {
  const history = readSessionHistory();
  history.players = [
    {
      id: player.id,
      name: player.name,
      rating: player.rating,
      club: player.club,
      tournament,
      searchedAt: new Date().toISOString(),
    },
    ...history.players.filter((item) => item.id !== player.id || item.tournament !== tournament),
  ].slice(0, 10);
  sessionStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(history));
}

function playerHref(player: ImportedPlayer) {
  return `${BASE}/joueurs/${player.id}`;
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

function exportPlayers(players: ImportedPlayer[]) {
  const rows = [
    ["Place", "Joueur", "Club", "Elo", "Catégorie", "Fédération", "Ligue", "Score", "Performance"],
    ...players.map((player) => [
      player.rank, player.name, player.club ?? "", player.rating ?? "", player.category ?? "",
      player.federation ?? "", player.league ?? "", player.score, player.performance ?? "",
    ]),
  ];
  downloadText(
    "classement-ffe-eloscope.csv",
    rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n"),
    "text/csv;charset=utf-8",
  );
}

export function EloScopeApp() {
  const pathname = usePathname() || "/";
  const { report, ready, setReport } = useImportedReport();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const matches = useMemo(() => {
    if (!report || search.trim().length < 2) return [];
    const term = search.toLocaleLowerCase("fr");
    return report.players.filter((player) => player.name.toLocaleLowerCase("fr").includes(term)).slice(0, 6);
  }, [report, search]);
  const navigation = [
    { href: "/", label: "Accueil", icon: Home },
    { href: report ? `${BASE}/vue-ensemble` : "/importer", label: "Tournois", icon: Trophy },
    { href: report ? `${BASE}/joueurs` : "/importer", label: "Joueurs", icon: UserRound },
    { href: report ? `${BASE}/clubs` : "/importer", label: "Clubs", icon: Building2 },
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <a className="brand" href="/" aria-label="EloScope, accueil">
          <span className="brand-mark"><Target size={24}/><span>♜</span></span>
          <strong>EloScope</strong>
        </a>
        <nav aria-label="Navigation principale">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href.replace(/\/(vue-ensemble|joueurs|clubs)$/, ""));
            return <a href={item.href} className={active ? "active" : ""} key={item.label}><Icon size={18}/><span>{item.label}</span></a>;
          })}
        </nav>
        <div className="sidebar-section"><span>Session</span><a href="/rapports-recents"><Clock3 size={16}/>Historique récent</a></div>
        {report && <div className="sidebar-recents"><a href={`${BASE}/vue-ensemble`}><span className="file-icon">F</span><span><b>{report.report.title}</b><small>Source FFE</small></span></a></div>}
        <div className="sidebar-bottom">
          <a href="/a-propos-elo"><HelpCircle size={17}/>À propos des calculs Elo</a>
          <a href="/parametres"><Settings size={17}/>Paramètres</a>
        </div>
      </aside>
      {mobileOpen && <button className="sidebar-backdrop" aria-label="Fermer le menu" onClick={() => setMobileOpen(false)}/>}
      <div className="workspace">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen((value) => !value)} aria-label="Ouvrir le menu"><Menu/></button>
          <div className="global-search">
            <Search size={18}/>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher dans le tournoi importé…" aria-label="Recherche globale"/>
            {matches.length > 0 && <div className="search-results">{matches.map((player) => <a href={playerHref(player)} key={player.id} onClick={() => rememberPlayer(player, report!.report.title)}><Avatar name={player.name}/><span>{player.name}<small>{player.rating ? `${formatNumber(player.rating)} Elo` : "Non classé"}{player.club ? ` · ${player.club}` : ""}</small></span></a>)}</div>}
          </div>
          <div className="top-context"><span>{report?.report.title ?? "Aucun tournoi importé"}</span><small>{report ? "Source FFE" : "Import requis"}</small></div>
          <a className="button primary" href="/importer"><Import size={17}/>{report ? "Changer de tournoi" : "Importer"}</a>
        </header>
        <main>
          <PageRouter pathname={pathname} report={report} ready={ready} setReport={setReport}/>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Navigation mobile">
        {navigation.slice(0, 4).map((item) => { const Icon = item.icon; return <a href={item.href} key={item.label}><Icon size={19}/><span>{item.label}</span></a>; })}
        <button onClick={() => setMobileOpen(true)}><Menu size={19}/><span>Plus</span></button>
      </nav>
    </div>
  );
}

function PageRouter({
  pathname, report, ready, setReport,
}: {
  pathname: string;
  report: NormalizedTournament | null;
  ready: boolean;
  setReport: (report: NormalizedTournament | null) => void;
}) {
  if (!ready) return <div className="narrow-page"><Card className="empty-state"><strong>Chargement du rapport…</strong></Card></div>;
  if (pathname === "/") return <HomePage report={report} setReport={setReport}/>;
  if (pathname === "/importer") return <ImportPage setReport={setReport}/>;
  if (pathname === "/rapports-recents") return <RecentPage report={report}/>;
  if (pathname === "/a-propos-elo") return <MethodPage/>;
  if (!report) return <NoReport/>;
  if (pathname.includes("/joueurs/")) return <PlayerReport report={report} id={pathname.split("/").at(-1)}/>;
  if (pathname.endsWith("/classement") || pathname.endsWith("/joueurs")) return <RankingPage report={report}/>;
  if (pathname.endsWith("/clubs")) return <ClubsPage report={report}/>;
  if (pathname.endsWith("/rondes")) return <RoundsPage report={report}/>;
  if (pathname.startsWith("/tournoi/")) return <TournamentOverview report={report}/>;
  return <HomePage report={report} setReport={setReport}/>;
}

function HomePage({ report, setReport }: { report: NormalizedTournament | null; setReport: (report: NormalizedTournament) => void }) {
  return (
    <div className="home-page">
      <section className="hero">
        <span className="eyebrow"><Target size={16}/>Résultats officiels FFE</span>
        <h1>Analysez un tournoi FFE</h1>
        <p>Collez le lien de la fiche tournoi : EloScope récupère la liste des participants, leurs clubs et la grille américaine.</p>
        <ImportPanel compact setReport={setReport}/>
      </section>
      {report && <div className="home-section">
        <SectionTitle>Dernier rapport importé</SectionTitle>
        <div className="report-grid single">
          <a href={`${BASE}/vue-ensemble`} className="report-card">
            <div className="report-badge"><Trophy/></div><span className="status-pill success"><Check/>FFE</span>
            <h3>{report.report.title}</h3>
            <p><Users size={15}/>{report.players.length} joueurs · {report.report.currentRound} rondes disponibles</p>
            <small>Importé le {new Date(report.report.importedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</small>
          </a>
        </div>
      </div>}
    </div>
  );
}

function ImportPage({ setReport }: { setReport: (report: NormalizedTournament) => void }) {
  return <div className="narrow-page"><div className="page-heading"><span className="eyebrow">Source officielle</span><h1>Importer un tournoi FFE</h1><p>Collez le lien de la fiche tournoi. EloScope en déduit automatiquement la liste des participants et la grille américaine.</p></div><ImportPanel setReport={setReport}/></div>;
}

function ImportPanel({ compact = false, setReport }: { compact?: boolean; setReport: (report: NormalizedTournament) => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<NormalizedTournament | null>(null);
  const valid = /^https:\/\/(www\.)?echecs\.asso\.fr\/FicheTournoi\.aspx\?[^#]*\bRef=\d+/i.test(url);
  const analyze = async () => {
    setError(""); setLoading(true);
    try {
      const response = await fetch("/api/import", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "url", input: url }),
      });
      const payload = await response.json() as { data?: NormalizedTournament; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Import impossible.");
      if (!payload.data.players.length) throw new Error(payload.data.warnings[0] ?? "Aucun joueur détecté.");
      setPreview(payload.data);
      rememberTournament(payload.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import impossible.");
    } finally { setLoading(false); }
  };
  const generate = () => {
    if (!preview) return;
    sessionStorage.setItem(SESSION_REPORT_KEY, JSON.stringify(preview));
    setReport(preview);
    window.location.assign(`${BASE}/vue-ensemble`);
  };
  if (preview) return <Card className="verification">
    <div className="verification-head"><span className="success-circle"><Check/></span><div><h2>Tournoi FFE reconnu</h2><p>La liste des participants et la grille américaine ont été rapprochées.</p></div></div>
    <dl className="verification-grid">
      <div><dt>Tournoi</dt><dd>{preview.report.title}</dd></div>
      <div><dt>Joueurs</dt><dd>{preview.players.length}</dd></div>
      <div><dt>Rondes</dt><dd>{preview.report.currentRound} / {preview.report.totalRounds}</dd></div>
      <div><dt>Joueurs avec Elo</dt><dd>{preview.players.filter((player) => player.rating).length}</dd></div>
      <div><dt>Fédérations</dt><dd>{new Set(preview.players.map((player) => player.federation).filter(Boolean)).size}</dd></div>
      <div><dt>Clubs</dt><dd>{new Set(preview.players.map((player) => player.club).filter(Boolean)).size}</dd></div>
      <div><dt>Avertissements</dt><dd>{preview.warnings.length}</dd></div>
    </dl>
    {preview.warnings.length > 0 && <div className="notice warning"><CircleAlert/><p>{preview.warnings.join(" ")}</p></div>}
    <div className="card-actions"><button className="button secondary" onClick={() => setPreview(null)}>Changer le lien</button><button className="button primary" onClick={generate}>Générer le rapport <ArrowRight/></button></div>
  </Card>;
  return <Card className={compact ? "hero-import" : "import-card"}>
    <div className="field-stack"><label htmlFor={compact ? "home-url" : "source-url"}>Lien de la fiche tournoi FFE</label><div className="input-with-icon"><Search/><input id={compact ? "home-url" : "source-url"} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://echecs.asso.fr/FicheTournoi.aspx?Ref=70244" /></div>
      <p className="field-help"><Info/>EloScope récupère automatiquement <code>Action=Ls</code> pour les clubs et <code>Action=Ga</code> pour les résultats.</p>
      {url && !valid && <p className="field-error"><CircleAlert/>Collez une URL FicheTournoi.aspx?Ref=… du domaine officiel echecs.asso.fr.</p>}
      {error && <div className="notice warning"><CircleAlert/><p>{error}</p></div>}
    </div>
    <div className={compact ? "hero-import-action" : "card-actions"}><button disabled={!valid || loading} className="button primary" onClick={analyze}>{loading ? "Récupération du tournoi…" : "Analyser le tournoi"} <ArrowRight/></button></div>
  </Card>;
}

function NoReport() {
  return <div className="narrow-page"><EmptyState title="Aucun tournoi importé">Collez le lien d’une fiche tournoi FFE pour créer votre premier rapport.</EmptyState><div className="center-action"><a className="button primary" href="/importer"><Import/>Importer un tournoi FFE</a></div></div>;
}

function TournamentHeader({ report, active }: { report: NormalizedTournament; active: string }) {
  const tabs = [["vue-ensemble", "Vue d’ensemble"], ["classement", "Classement"], ["joueurs", "Joueurs"], ["clubs", "Clubs"], ["rondes", "Rondes"]];
  return <>
    <div className="breadcrumbs"><a href="/">Accueil</a><span>/</span><strong>{report.report.title}</strong></div>
    <div className="tournament-head">
      <div className="tournament-emblem"><Trophy/></div>
      <div><span className="status-pill success"><Check/>Source FFE</span><h1>{report.report.title}</h1><p><CalendarDays/>Données après la ronde {report.report.currentRound} sur {report.report.totalRounds}</p><small>Importé le {new Date(report.report.importedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</small></div>
      <div className="head-actions"><a className="icon-button" href="/importer" title="Actualiser depuis la FFE"><RefreshCcw/></a><button className="button secondary" onClick={() => window.print()}><Printer/>PDF</button><button className="button primary" onClick={() => exportPlayers(report.players)}><Download/>Exporter</button></div>
    </div>
    <nav className="context-tabs" aria-label="Sections du tournoi">{tabs.map(([key, label]) => <a href={`${BASE}/${key}`} className={active === key ? "active" : ""} key={key}>{label}</a>)}</nav>
  </>;
}

function TournamentOverview({ report }: { report: NormalizedTournament }) {
  const rated = report.players.filter((player) => player.rating).map((player) => player.rating!).sort((a, b) => a - b);
  const median = rated.length ? rated[Math.floor(rated.length / 2)] : 0;
  const winner = [...report.players].sort((a, b) => a.rank - b.rank)[0];
  const bestRelative = report.players.filter((player) => player.rating && player.performance).sort((a, b) => (b.performance! - b.rating!) - (a.performance! - a.rating!))[0];
  const top = [...report.players].sort((a, b) => a.rank - b.rank).slice(0, 5);
  const progressionOption: EChartsOption = {
    tooltip: { ...tooltip, trigger: "axis" }, grid: { left: 38, right: 22, top: 24, bottom: 32 },
    xAxis: { type: "category", data: Array.from({ length: report.report.totalRounds }, (_, index) => index + 1), name: "Ronde", boundaryGap: false },
    yAxis: { type: "value", name: "Score", min: 0 },
    series: top.map((player, index) => ({
      type: "line", name: player.name, smooth: .18, symbolSize: 7,
      data: player.rounds.map((_, roundIndex) => player.rounds.slice(0, roundIndex + 1).reduce((sum, round) => sum + (round.result ?? 0), 0)),
      lineStyle: { color: colors[index], width: index === 0 ? 3 : 2 }, itemStyle: { color: colors[index] },
    })),
  };
  const distributionOption: EChartsOption = {
    tooltip: { ...tooltip, trigger: "axis" }, grid: { left: 35, right: 12, top: 18, bottom: 44 },
    xAxis: { type: "category", data: ["< 1 200", "1 200–1 399", "1 400–1 599", "1 600–1 799", "1 800–1 999", "2 000+"], axisLabel: { fontSize: 10, interval: 0 } },
    yAxis: { type: "value", minInterval: 1, name: "Joueurs" },
    series: [{ type: "bar", barWidth: "64%", itemStyle: { color: "#4F91A6", borderRadius: [4, 4, 0, 0] }, data: [[0,1199],[1200,1399],[1400,1599],[1600,1799],[1800,1999],[2000,4000]].map(([min,max]) => rated.filter((rating) => rating >= min && rating <= max).length) }],
  };
  return <div className="report-page"><TournamentHeader report={report} active="vue-ensemble"/>
    <div className="kpi-grid five">
      <Kpi label="Participants" value={report.players.length} detail={`${rated.length} avec Elo`} icon={<Users/>}/>
      <Kpi label="Elo médian" value={median ? formatNumber(median) : "Non disponible"} detail="Parmi les joueurs classés" icon={<Gauge/>}/>
      <Kpi label="Score du premier" value={`${formatScore(winner?.score ?? 0)} / ${report.report.totalRounds}`} detail={winner?.name ?? "—"} tone="positive" icon={<Trophy/>}/>
      <Kpi label="Clubs" value={new Set(report.players.map((player) => player.club).filter(Boolean)).size} detail="Liste officielle des participants" icon={<Building2/>}/>
      <Kpi label="Meilleure perf. relative" value={bestRelative ? signed(bestRelative.performance! - bestRelative.rating!, 0) : "—"} detail={bestRelative?.name ?? "Performance absente"} tone="positive" icon={<BarChart3/>}/>
    </div>
    <Card className="chart-card wide"><SectionTitle help="Score cumulé provenant des résultats de chaque ronde." action={<span className="select-like">Top 5 <ChevronDown/></span>}>Progression du score</SectionTitle><div className="chart-with-legend"><EChart option={progressionOption} height={310} ariaLabel="Progression des cinq premiers joueurs"/><div className="chart-legend">{top.map((player, index) => <a href={playerHref(player)} key={player.id}><i style={{ background: colors[index] }}/><span>{player.name}<small>{formatScore(player.score)} points</small></span></a>)}</div></div></Card>
    <div className="dashboard-grid two"><Card className="chart-card"><SectionTitle>Distribution Elo</SectionTitle><EChart option={distributionOption} height={270} ariaLabel="Distribution des classements Elo"/></Card><RankingPreview players={report.players}/></div>
  </div>;
}

function RankingPreview({ players }: { players: ImportedPlayer[] }) {
  return <Card className="table-card"><SectionTitle action={<a className="text-link" href={`${BASE}/classement`}>Classement complet <ArrowRight/></a>}>Premières places</SectionTitle><div className="table-scroll always"><table><thead><tr><th>Place</th><th>Joueur</th><th>Elo</th><th>Score</th><th>Perf.</th></tr></thead><tbody>{[...players].sort((a,b) => a.rank-b.rank).slice(0,10).map((player) => <tr key={player.id} onClick={() => window.location.assign(playerHref(player))}><td><span className={`rank rank-${player.rank}`}>{player.rank}</span></td><td><div className="player-cell"><Avatar name={player.name}/><strong>{player.name}</strong></div></td><td>{player.rating ?? "NC"}</td><td>{formatScore(player.score)}</td><td>{player.performance ?? "—"}</td></tr>)}</tbody></table></div></Card>;
}

function RankingPage({ report }: { report: NormalizedTournament }) {
  const [query, setQuery] = useState("");
  const players = report.players.filter((player) => player.name.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr"))).sort((a, b) => a.rank - b.rank);
  return <div className="report-page"><TournamentHeader report={report} active="classement"/><Card className="table-card"><SectionTitle action={<button className="button secondary" onClick={() => exportPlayers(players)}><Download/>Exporter CSV</button>}>Classement FFE</SectionTitle><div className="table-toolbar"><div className="input-with-icon"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un joueur…"/></div><span>{players.length} joueurs</span></div><div className="table-scroll always"><table><thead><tr><th>Place</th><th>Joueur</th><th>Club</th><th>Elo</th><th>Catégorie</th><th>Fédération</th><th>Ligue</th><th>Score</th><th>Départages</th><th>Performance</th><th>Var. Elo estimée</th></tr></thead><tbody>{players.map((player) => { const scenario = calculateTournamentDelta(player.rating ?? 0, toRatingRounds(player), 20); return <tr key={player.id} onClick={() => { rememberPlayer(player, report.report.title); window.location.assign(playerHref(player)); }}><td><span className={`rank rank-${player.rank}`}>{player.rank}</span></td><td><div className="player-cell"><Avatar name={player.name}/><strong>{player.name}</strong></div></td><td>{player.club ?? "—"}</td><td>{player.rating ?? "NC"}</td><td>{player.category ?? "—"}</td><td>{player.federation ?? "—"}</td><td>{player.league ?? "—"}</td><td><strong>{formatScore(player.score)} / {report.report.totalRounds}</strong></td><td>{Object.values(player.tieBreaks).map((value) => value == null ? "—" : formatNumber(value)).join(" · ") || "—"}</td><td>{player.performance ?? "—"}</td><td className={scenario.roundedTotalDelta >= 0 ? "positive-text" : "negative-text"}>{player.rating ? signed(scenario.roundedTotalDelta, 0) : "—"}</td></tr>; })}</tbody></table></div></Card></div>;
}

function PlayerReport({ report, id }: { report: NormalizedTournament; id?: string }) {
  const ordered = [...report.players].sort((a, b) => a.rank - b.rank);
  const player = ordered.find((item) => item.id === id) ?? ordered[0];
  const index = ordered.findIndex((item) => item.id === player.id);
  const previous = ordered[(index - 1 + ordered.length) % ordered.length];
  const next = ordered[(index + 1) % ordered.length];
  const [k, setK] = useState(20);
  const [initial, setInitial] = useState(player.rating ?? 1800);
  useEffect(() => {
    rememberPlayer(player, report.report.title);
  }, [player, report.report.title]);
  const scenario = useMemo(() => calculateTournamentDelta(initial, toRatingRounds(player), k, RULESETS["fide-standard-2024"]), [initial, k, player]);
  const lineOption: EChartsOption = {
    tooltip: { ...tooltip, trigger: "axis" }, grid: { left: 45, right: 18, top: 20, bottom: 35 },
    xAxis: { type: "category", data: [0, ...player.rounds.map((round) => round.round)], name: "Ronde", boundaryGap: false },
    yAxis: { type: "value", name: "Variation" },
    series: [{ type: "line", smooth: .18, symbolSize: 8, data: [0, ...scenario.perRound.map((round) => Number(round.cumulative.toFixed(2)))], lineStyle: { color: "#23855B", width: 3 }, areaStyle: { color: "rgba(35,133,91,.10)" } }],
  };
  return <div className="report-page"><div className="breadcrumbs"><a href={`${BASE}/vue-ensemble`}>{report.report.title}</a><span>/</span><strong>{player.name}</strong></div>
    <div className="player-head"><div className="player-identity"><Avatar name={player.name}/><div><span className="status-pill">{player.category ?? "Participant"}</span><h1>{player.name}</h1><p>{player.club ?? "Club non indiqué"} · {player.federation ?? "Fédération non indiquée"} · {player.league ?? "Ligue non indiquée"}</p><small>Elo initial <strong>{player.rating ? formatNumber(player.rating) : "Non classé"}</strong></small></div></div><div className="player-nav"><a className="button secondary" href={playerHref(previous)}><ArrowLeft/>Précédent</a><select value={player.id} aria-label="Joueur courant" onChange={(event) => { const selectedPlayer = ordered.find((item) => item.id === event.target.value) ?? player; rememberPlayer(selectedPlayer, report.report.title); window.location.assign(playerHref(selectedPlayer)); }}>{ordered.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><a className="button secondary" href={playerHref(next)}>Suivant<ArrowRight/></a></div></div>
    <div className="kpi-grid five"><Kpi label="Score" value={`${formatScore(player.score)} / ${report.report.totalRounds}`} detail="Points du tournoi" tone="positive" icon={<Star/>}/><Kpi label="Classement final" value={`${player.rank}e / ${report.players.length}`} detail="Classement FFE" icon={<Trophy/>}/><Kpi label="Performance" value={player.performance ? formatNumber(player.performance) : "—"} detail={player.performance ? "Fournie par la FFE" : "Non disponible"} icon={<Gauge/>}/><Kpi label="Parties cotées" value={scenario.perRound.filter((round) => round.included).length} detail={`${player.rounds.length} rondes`} icon={<Check/>}/><Kpi label="Variation Elo estimée" value={player.rating ? signed(scenario.roundedTotalDelta, 0) : "—"} detail={player.rating ? `${formatNumber(initial)} → ${formatNumber(scenario.estimatedNewRating)}` : "Elo initial absent"} tone={scenario.roundedTotalDelta >= 0 ? "positive" : "negative"} icon={<BarChart3/>}/></div>
    <div className="player-layout"><div className="player-main"><Card className="chart-card"><SectionTitle help="Estimation fondée uniquement sur les rondes jouées et cotées." action={<span className={`status-pill ${scenario.roundedTotalDelta >= 0 ? "success" : "danger"}`}>Final : {player.rating ? signed(scenario.roundedTotalDelta, 0) : "—"}</span>}>Variation Elo cumulée</SectionTitle><EChart option={lineOption} height={330} ariaLabel="Variation Elo cumulée"/></Card><PlayerRounds player={player} scenario={scenario}/></div><aside className="player-aside"><Card className="settings-card"><SectionTitle>Estimation Elo</SectionTitle><label>Classement avant le tournoi<input type="number" value={initial} min={800} max={3000} onChange={(event) => setInitial(Number(event.target.value) || 800)}/></label><span className="field-label">Coefficient K</span><div className="k-buttons">{[10,20,40].map((value) => <button className={k === value ? "selected" : ""} onClick={() => setK(value)} key={value}>{value}</button>)}<input aria-label="K personnalisé" value={k} type="number" min={1} max={100} onChange={(event) => setK(Number(event.target.value) || 20)}/></div><p className="field-help"><CircleAlert/>Vérifiez votre coefficient K sur votre fiche officielle.</p></Card><Card className="summary-card"><SectionTitle>Données de la source</SectionTitle><p>Le club vient de la liste des participants FFE ; le classement, le score, la performance et les rondes viennent de la grille américaine.</p><div className="key-takeaway"><Info/><span><strong>Limite</strong>Aucune conclusion n’est formulée sur la qualité des coups sans fichier de parties.</span></div></Card></aside></div>
    <p className="rating-disclaimer">Cette estimation porte uniquement sur les parties disponibles dans ce rapport. Le classement officiellement publié peut différer selon les règles applicables et l’homologation effective des parties.</p>
  </div>;
}

function PlayerRounds({ player, scenario }: { player: ImportedPlayer; scenario: ReturnType<typeof calculateTournamentDelta> }) {
  return <Card className="table-card rounds-table"><SectionTitle>Détail des rondes</SectionTitle><div className="table-scroll always"><table><thead><tr><th>Ronde</th><th>Couleur</th><th>Adversaire</th><th>Elo adverse</th><th>Résultat</th><th>Attendu</th><th>Var. Elo</th><th>Cumul</th><th>Notation FFE</th></tr></thead><tbody>{player.rounds.map((round, index) => { const calc = scenario.perRound[index]; return <tr key={round.round}><td>{round.round}</td><td>{round.color === "WHITE" ? "○ Blancs" : round.color === "BLACK" ? "● Noirs" : "—"}</td><td><strong>{round.opponentName ?? "—"}</strong></td><td>{round.opponentRating ?? "—"}</td><td><span className={`result result-${round.result}`}>{round.result === 1 ? "V · 1" : round.result === .5 ? "N · ½" : round.result === 0 ? "D · 0" : "—"}</span></td><td>{calc.expected == null ? "—" : formatNumber(calc.expected)}</td><td className={calc.rawDelta > 0 ? "positive-text" : calc.rawDelta < 0 ? "negative-text" : ""}>{calc.included ? signed(calc.rawDelta) : "0,0"}</td><td>{signed(calc.cumulative)}</td><td>{round.notation || "—"}</td></tr>; })}</tbody></table></div></Card>;
}

function RoundsPage({ report }: { report: NormalizedTournament }) {
  const [round, setRound] = useState(1);
  const results = report.players.map((player) => ({ player, result: player.rounds[round - 1] })).filter((item) => item.result);
  return <div className="report-page"><TournamentHeader report={report} active="rondes"/><div className="round-selector"><div><span className="eyebrow">Résultats FFE</span><h1>Ronde {round}</h1></div><div>{Array.from({ length: report.report.totalRounds }, (_, index) => <button className={round === index + 1 ? "selected" : ""} onClick={() => setRound(index + 1)} key={index}>{index + 1}</button>)}</div></div><div className="kpi-grid five"><Kpi label="Victoires" value={results.filter((item) => item.result.result === 1).length} detail="Résultats individuels" tone="positive" icon={<Check/>}/><Kpi label="Nulles" value={results.filter((item) => item.result.result === .5).length} detail="½ point" icon={<Target/>}/><Kpi label="Défaites" value={results.filter((item) => item.result.result === 0).length} detail="Résultats individuels" tone="negative" icon={<CircleAlert/>}/><Kpi label="Données disponibles" value={results.filter((item) => item.result.played).length} detail={`${report.players.length} participants`} icon={<Users/>}/><Kpi label="Ronde" value={`${round} / ${report.report.totalRounds}`} detail="Sélection courante" icon={<Gauge/>}/></div><Card className="table-card"><SectionTitle>Résultats individuels</SectionTitle><div className="table-scroll always"><table><thead><tr><th>Joueur</th><th>Couleur</th><th>Adversaire</th><th>Elo adverse</th><th>Résultat</th><th>Notation</th></tr></thead><tbody>{results.map(({ player, result }) => <tr key={player.id} onClick={() => window.location.assign(playerHref(player))}><td><strong>{player.name}</strong></td><td>{result.color === "WHITE" ? "Blancs" : result.color === "BLACK" ? "Noirs" : "—"}</td><td>{result.opponentName ?? "—"}</td><td>{result.opponentRating ?? "—"}</td><td>{result.result === 1 ? "Victoire" : result.result === .5 ? "Nulle" : result.result === 0 ? "Défaite" : "Non joué"}</td><td>{result.notation || "—"}</td></tr>)}</tbody></table></div></Card></div>;
}

function ClubsPage({ report }: { report: NormalizedTournament }) {
  const clubs = useMemo(() => {
    const groups = new Map<string, ImportedPlayer[]>();
    for (const player of report.players) {
      if (!player.club) continue;
      groups.set(player.club, [...(groups.get(player.club) ?? []), player]);
    }
    return [...groups.entries()]
      .map(([name, players]) => ({ name, players: players.sort((a, b) => a.rank - b.rank) }))
      .sort((a, b) => b.players.length - a.players.length || a.name.localeCompare(b.name, "fr"));
  }, [report.players]);
  const withClub = clubs.reduce((sum, club) => sum + club.players.length, 0);
  return <div className="report-page"><TournamentHeader report={report} active="clubs"/>
    <div className="kpi-grid five">
      <Kpi label="Clubs représentés" value={clubs.length} detail="Source : liste des participants" icon={<Building2/>}/>
      <Kpi label="Joueurs rattachés" value={withClub} detail={`${report.players.length - withClub} sans club indiqué`} icon={<Users/>}/>
      <Kpi label="Club le plus représenté" value={clubs[0]?.players.length ?? 0} detail={clubs[0]?.name ?? "Aucun club"} icon={<Trophy/>}/>
    </div>
    {clubs.length ? <>
      <div className="club-grid">{clubs.map((club) => <article className="club-card" key={club.name}>
        <span className="club-icon"><Building2/></span>
        <div><h3>{club.name}</h3><p>{club.players.length} joueur{club.players.length > 1 ? "s" : ""}</p><small>{club.players.slice(0, 3).map((player) => player.name).join(" · ")}{club.players.length > 3 ? "…" : ""}</small></div>
      </article>)}</div>
      <Card className="table-card"><SectionTitle>Liste complète des joueurs par club</SectionTitle><div className="table-scroll always"><table><thead><tr><th>Club</th><th>Joueur</th><th>Elo</th><th>Classement</th><th>Score</th></tr></thead><tbody>{clubs.flatMap((club) => club.players.map((player) => <tr key={`${club.name}-${player.id}`} onClick={() => { rememberPlayer(player, report.report.title); window.location.assign(playerHref(player)); }}><td><strong>{club.name}</strong></td><td>{player.name}</td><td>{player.rating ?? "NC"}</td><td>{player.rank}</td><td>{formatScore(player.score)} / {report.report.totalRounds}</td></tr>))}</tbody></table></div></Card>
    </> : <EmptyState title="Aucun club trouvé">La liste des participants FFE ne contient aucun club exploitable pour ce tournoi.</EmptyState>}
  </div>;
}

function RecentPage({ report }: { report: NormalizedTournament | null }) {
  const [history, setHistory] = useState<SessionHistory>(emptyHistory);
  useEffect(() => setHistory(readSessionHistory()), []);
  return <div className="plain-page"><div className="page-heading"><span className="eyebrow">Mémoire de la session</span><h1>Historique récent</h1><p>Ces recherches restent uniquement dans l’onglet courant et disparaissent à la fermeture de la session du navigateur.</p></div>
    <SectionTitle>Tournois recherchés</SectionTitle>
    {history.tournaments.length ? <div className="report-grid">{history.tournaments.map((item) => <a className="report-card" href={report?.report.sourceUrl === item.sourceUrl ? `${BASE}/vue-ensemble` : "/importer"} key={`${item.sourceUrl}-${item.searchedAt}`}>
      <div className="report-badge"><Trophy/></div><span className="status-pill success"><Check/>FFE</span><h3>{item.title}</h3><p>{item.players} joueurs · {item.rounds} rondes</p><small>Recherché le {new Date(item.searchedAt).toLocaleString("fr-FR")}</small>
    </a>)}</div> : <EmptyState title="Aucun tournoi recherché">Importez une fiche tournoi FFE pour commencer.</EmptyState>}
    <SectionTitle>Joueurs consultés</SectionTitle>
    {history.players.length ? <div className="directory-grid">{history.players.map((item) => <a href={report?.report.title === item.tournament ? `${BASE}/joueurs/${item.id}` : "/importer"} key={`${item.tournament}-${item.id}`}>
      <Avatar name={item.name}/><span><strong>{item.name}</strong><small>{item.club ?? item.tournament}</small></span><ArrowRight/>
    </a>)}</div> : <EmptyState title="Aucun joueur consulté">Les joueurs ouverts depuis la recherche ou le classement apparaîtront ici.</EmptyState>}
  </div>;
}

function MethodPage() {
  return <div className="narrow-page"><div className="page-heading"><span className="eyebrow">Méthode transparente</span><h1>À propos des calculs Elo</h1><p>EloScope produit une estimation reproductible à partir des résultats importés.</p></div><Card className="prose-card"><h2>Source des données</h2><p>Les clubs viennent de la liste officielle des participants FFE. Les classements, scores, performances et rondes viennent de la grille américaine du même tournoi.</p><h2>Variation par partie</h2><p><code>coefficient K × (score réalisé − score attendu)</code></p><p>Les parties non jouées, adversaires sans Elo, exempts et forfaits sont exclus du calcul.</p><div className="notice warning"><CircleAlert/><p>Vérifiez toujours votre coefficient K et le classement officiellement publié.</p></div></Card></div>;
}
