import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { hireApplicantFn } from "@/lib/onboarding.functions";
import {
  addApplicantFn,
  createPostingFn,
  getHiring,
  moveApplicantFn,
} from "@/lib/workforce.functions";

export const Route = createFileRoute("/_authenticated/hiring")({
  head: () => ({
    meta: [
      { title: "Hiring — CoverGrid" },
      {
        name: "description",
        content:
          "Job requisitions, applicant pipeline and automatic screening for nurse and CNA roles.",
      },
      { property: "og:title", content: "Hiring — CoverGrid" },
      {
        property: "og:description",
        content: "Requisitions open themselves when coverage is chronically short.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HiringPage,
});

const STAGES = ["applied", "screened", "interview", "offer", "hired", "rejected"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_LABEL: Record<Stage, string> = {
  applied: "Applied",
  screened: "Screened",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Not moving forward",
};

function HiringPage() {
  const qc = useQueryClient();
  const load = useServerFn(getHiring);
  const createPosting = useServerFn(createPostingFn);
  const addApplicant = useServerFn(addApplicantFn);
  const move = useServerFn(moveApplicantFn);
  const hireApplicant = useServerFn(hireApplicantFn);
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [position, setPosition] = useState<"nurse" | "qma" | "cna">("cna");
  const [payRange, setPayRange] = useState("");
  const [applicantName, setApplicantName] = useState("");
  const [applicantNotes, setApplicantNotes] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");
  const [applicantPostingId, setApplicantPostingId] = useState("");

  const { data, error } = useQuery({ queryKey: ["hiring"], queryFn: () => load() });

  const postingMutation = useMutation({
    mutationFn: () =>
      createPosting({
        data: {
          title,
          position,
          shift: null,
          unitId: null,
          payRange,
          description: "",
          openings: 1,
        },
      }),
    onSuccess: () => {
      toast.success("Requisition opened.");
      setTitle("");
      setPayRange("");
      void qc.invalidateQueries({ queryKey: ["hiring"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applicantMutation = useMutation({
    mutationFn: () =>
      addApplicant({
        data: {
          postingId: applicantPostingId,
          fullName: applicantName,
          email: applicantEmail,
          notes: applicantNotes,
          source: "career_site",
        },
      }),
    onSuccess: () => {
      toast.success("Applicant screened automatically and placed in the pipeline.");
      setApplicantName("");
      setApplicantNotes("");
      setApplicantEmail("");
      setApplicantPostingId("");
      void qc.invalidateQueries({ queryKey: ["hiring"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveMutation = useMutation({
    mutationFn: (v: { id: string; stage: Stage }) => move({ data: v }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hiring"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const onboardMutation = useMutation({
    mutationFn: (applicantId: string) => hireApplicant({ data: { applicantId } }),
    onSuccess: (res) => {
      toast.success(
        res.alreadyStarted
          ? "This person is already in onboarding — open New hires to keep going."
          : "Onboarding started. Paperwork and background screenings were sent automatically.",
      );
      void qc.invalidateQueries({ queryKey: ["hiring"] });
      void qc.invalidateQueries({ queryKey: ["new-hires"] });
      void qc.invalidateQueries({ queryKey: ["hr-board"] });
      void navigate({ to: "/new-hires" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <p className="text-muted-foreground">Hiring is available to managers only.</p>;

  const m = data?.metrics;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Hiring</h1>
        <p className="text-muted-foreground">
          Requisitions open themselves when a unit and shift stay short. Applicants are scored and
          advanced without anyone sorting a stack of résumés.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Open positions" value={m?.openings ?? 0} />
        <Metric label="Applicants" value={m?.applied ?? 0} />
        <Metric label="In pipeline" value={m?.inPipeline ?? 0} />
        <Metric label="Hired" value={m?.hired ?? 0} />
        <Metric label="Days to hire" value={m?.avgDaysToHire ?? 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Open a requisition</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Job title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="flex gap-2">
              {(["cna", "qma", "nurse"] as const).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={position === p ? "default" : "outline"}
                  onClick={() => setPosition(p)}
                >
                  {p === "cna" ? "CNA" : p === "qma" ? "QMA" : "Nurse"}
                </Button>
              ))}
            </div>
            <Input
              placeholder="Pay range"
              value={payRange}
              onChange={(e) => setPayRange(e.target.value)}
            />
            <Button
              disabled={!title || postingMutation.isPending}
              onClick={() => postingMutation.mutate()}
            >
              Post job
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Add an applicant</CardTitle>
            <CardDescription>
              Scored on contact completeness, source and stated experience.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={applicantPostingId} onValueChange={setApplicantPostingId}>
              <SelectTrigger>
                <SelectValue placeholder="Which requisition is this applicant for?" />
              </SelectTrigger>
              <SelectContent>
                {(data?.postings ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Full name"
                value={applicantName}
                onChange={(e) => setApplicantName(e.target.value)}
              />
              <Input
                placeholder="Email"
                value={applicantEmail}
                onChange={(e) => setApplicantEmail(e.target.value)}
              />
            </div>
            <Textarea
              placeholder="Experience notes"
              value={applicantNotes}
              onChange={(e) => setApplicantNotes(e.target.value)}
            />
            <Button
              variant="secondary"
              disabled={!applicantName || !applicantPostingId || applicantMutation.isPending}
              onClick={() => applicantMutation.mutate()}
            >
              Screen applicant
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {STAGES.map((stage) => (
            <div key={stage} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">{STAGE_LABEL[stage]}</h3>
                <Badge variant="secondary">{data?.byStage?.[stage]?.length ?? 0}</Badge>
              </div>
              <div className="space-y-2">
                {(data?.byStage?.[stage] ?? []).map((a) => (
                  <div key={a.id} className="rounded-md border bg-card p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{a.full_name}</span>
                      {a.ai_score != null && (
                        <Badge className="bg-info text-info-foreground">
                          {Math.round(Number(a.ai_score))}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{a.ai_summary}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {STAGES.filter((s) => s !== stage)
                        .slice(0, 3)
                        .map((s) => (
                          <Button
                            key={s}
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => moveMutation.mutate({ id: a.id, stage: s })}
                          >
                            → {STAGE_LABEL[s]}
                          </Button>
                        ))}
                    </div>
                    {(stage === "offer" || stage === "hired") && (
                      <Button
                        size="sm"
                        className="mt-2 h-7 w-full px-2 text-xs"
                        disabled={onboardMutation.isPending}
                        onClick={() => onboardMutation.mutate(a.id)}
                      >
                        {onboardMutation.isPending ? "Working…" : "Start onboarding"}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Open requisitions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {(data?.postings ?? []).map((p) => (
            <div key={p.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{p.title}</span>
                <Badge variant={p.status === "open" ? "default" : "secondary"}>{p.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {p.unitName} · {p.shiftLabel} · {p.pay_range || "Pay DOE"} · {p.openings} opening
                {p.openings > 1 ? "s" : ""}
              </p>
              {p.description && (
                <p className="mt-2 text-xs text-muted-foreground">{p.description}</p>
              )}
              <p className="mt-2 text-xs">
                {p.applicants} applicant{p.applicants === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-display text-3xl">{value}</p>
      </CardContent>
    </Card>
  );
}
