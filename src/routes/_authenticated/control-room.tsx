import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askControlRoom, clearControlRoom, getControlRoomHistory } from "@/lib/architect.functions";
import { getFacilityConfig } from "@/lib/staffing.functions";

export const Route = createFileRoute("/_authenticated/control-room")({
  head: () => ({
    meta: [
      { title: "Control room — CoverGrid" },
      {
        name: "description",
        content:
          "Administrator command line for the whole facility: change staffing rules, units, goals and how the system runs itself with one plain-English instruction.",
      },
      { property: "og:title", content: "Control room — CoverGrid" },
      {
        property: "og:description",
        content: "Reshape how the facility runs with a single plain-English command.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ControlRoomPage,
});

function ControlRoomPage() {
  const qc = useQueryClient();
  const loadConfig = useServerFn(getFacilityConfig);
  const loadHistory = useServerFn(getControlRoomHistory);
  const ask = useServerFn(askControlRoom);
  const clear = useServerFn(clearControlRoom);
  const [input, setInput] = useState("");
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: config, isLoading } = useQuery({
    queryKey: ["facility-config"],
    queryFn: () => loadConfig(),
  });
  const isAdmin = Boolean(config?.isAdmin);

  const history = useQuery({
    queryKey: ["control-room"],
    queryFn: () => loadHistory(),
    enabled: isAdmin,
  });

  const send = useMutation({
    mutationFn: (message: string) => ask({ data: { message } }),
    onSuccess: () => {
      setInput("");
      void qc.invalidateQueries({ queryKey: ["control-room"] });
      void qc.invalidateQueries({ queryKey: ["facility-config"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["ppd-week"] });
      void qc.invalidateQueries({ queryKey: ["schedule"] });
      boxRef.current?.focus();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    boxRef.current?.focus();
  }, [isAdmin]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.data?.length, send.isPending]);

  const submit = () => {
    const text = input.trim();
    if (text && !send.isPending) send.mutate(text);
  };

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <h1 className="font-display text-3xl">Control room</h1>
        <p className="text-muted-foreground">
          This area is for administrators only. Ask an administrator if you need a facility-wide
          setting changed.
        </p>
      </div>
    );
  }

  const messages = history.data ?? [];

  return (
    <div className="mx-auto flex h-[calc(100dvh-9rem)] w-full max-w-3xl flex-col">
      <div className="flex items-start justify-between gap-4 pb-4">
        <div>
          <h1 className="font-display text-3xl">Control room</h1>
          <p className="text-muted-foreground">
            Administrator only. Say what you want changed in plain English — staffing rules, units,
            buildings, PPD goal, agencies, policy, or how the system runs itself — and it is changed
            for everyone right away.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await clear();
            void qc.invalidateQueries({ queryKey: ["control-room"] });
          }}
        >
          Clear
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pb-6 pr-1">
        {messages.length === 0 && (
          <p className="pt-10 text-center text-sm text-muted-foreground">
            Give one plain-English instruction to reshape how the facility runs.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground"
                : "mr-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-4 py-2 text-sm"
            }
          >
            {m.content}
          </div>
        ))}
        {send.isPending && <p className="text-sm text-muted-foreground">Working on it…</p>}
      </div>

      <div className="sticky bottom-0 space-y-2 border-t bg-background pb-2 pt-3">
        <Textarea
          ref={boxRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Cedar third shift needs 3 nurses instead of 2, then rebuild the schedule and tell the managers."
          className="max-h-48 min-h-20 resize-none text-base"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button
          className="w-full"
          size="lg"
          disabled={!input.trim() || send.isPending}
          onClick={submit}
        >
          {send.isPending ? "WORKING..." : "SEND"}
        </Button>
      </div>
    </div>
  );
}
