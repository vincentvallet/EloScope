"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, CircleAlert, Database, LoaderCircle, RefreshCcw } from "lucide-react";
import type { NormalizedTournament } from "@/lib/importers/types";
import { Card } from "./ui";

type Payload = {
  state: string;
  data?: NormalizedTournament;
  stale?: boolean;
  error?: string;
  metadata?: { status?: string; progress?: number; message?: string; generatedAt?: string };
};

export function SharedReportPreparation({
  ffeRef,
  setReport,
  entryId,
}: {
  ffeRef: string;
  setReport: (report: NormalizedTournament) => void;
  entryId?: string;
}) {
  const [payload, setPayload] = useState<Payload>({ state: "checking", metadata: { progress: 5, message: "Vérification du cache partagé" } });
  const [attempt, setAttempt] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (data: NormalizedTournament, stale = false) => {
      setReport(data);
      if (stale) void fetch(`/api/tournaments/${ffeRef}/analyze?refresh=true`, { method: "POST" });
      window.location.assign(entryId ? `/tournoi/${ffeRef}/joueurs/${entryId}` : `/tournoi/${ffeRef}/vue-ensemble`);
    };
    const poll = async () => {
      try {
        const response = await fetch(`/api/tournaments/${ffeRef}/report`, { cache: "no-store" });
        const current = await response.json() as Payload;
        if (cancelled) return;
        if (current.data) return finish(current.data, current.stale);
        setPayload(current);
        if (current.state === "error") return;
        if (!started.current) {
          started.current = true;
          setPayload({ state: "fetching", metadata: { status: "fetching", progress: 15, message: "Récupération des résultats officiels" } });
          void fetch(`/api/tournaments/${ffeRef}/analyze`, { method: "POST" })
            .then(async (creation) => {
              const created = await creation.json() as Payload;
              if (cancelled) return;
              if (created.data) return finish(created.data, created.stale);
              setPayload(created);
            })
            .catch((error) => {
              if (!cancelled) setPayload({ state: "error", error: error instanceof Error ? error.message : "Préparation impossible" });
            });
        }
        timer = setTimeout(poll, 900);
      } catch (error) {
        if (!cancelled) setPayload({ state: "error", error: error instanceof Error ? error.message : "Connexion impossible" });
      }
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [attempt, entryId, ffeRef, setReport]);

  const progress = payload.metadata?.progress ?? (payload.state === "checking" ? 5 : 20);
  const steps = [
    ["Cache partagé vérifié", progress >= 10],
    ["Résultats FFE récupérés", progress >= 35],
    ["Données du tournoi préparées", progress >= 65],
    ["Rapport partagé enregistré", progress >= 100],
  ] as const;
  const failed = payload.state === "error";
  return <div className="narrow-page preparation-page">
    <a className="back-link" href="/tournois"><ArrowLeft/>Retour aux tournois</a>
    <div className="page-heading">
      <span className="eyebrow"><Database/>Cache partagé</span>
      <h1>{failed ? "Le rapport n’a pas pu être préparé" : "Préparation de votre rapport"}</h1>
      <p>{failed ? payload.error ?? payload.metadata?.message : "Cette première préparation profitera aussi aux prochains visiteurs."}</p>
    </div>
    <Card className="preparation-card">
      <div className="preparation-progress" role="progressbar" aria-label="Progression du rapport" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }}/></div>
      <ol>{steps.map(([label, complete], index) => <li className={complete ? "complete" : ""} key={label}>
        <span>{complete ? <Check/> : failed && index === steps.findIndex((step) => !step[1]) ? <CircleAlert/> : <LoaderCircle className={!failed && index === steps.findIndex((step) => !step[1]) ? "spin" : ""}/>}</span>
        <div><strong>{label}</strong>{!complete && index === steps.findIndex((step) => !step[1]) && <small>{payload.metadata?.message ?? "Préparation en cours…"}</small>}</div>
      </li>)}</ol>
      {failed && <button className="button primary" onClick={() => { started.current = false; setAttempt((value) => value + 1); }}><RefreshCcw/>Réessayer</button>}
    </Card>
  </div>;
}
