import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { Textarea } from "@/components/ui/textarea";
import { askAssistant, clearChatHistory, getChatHistory } from "@/lib/ai.functions";
import { getFacilityConfig } from "@/lib/staffing.functions";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({
    meta: [
      { title: "Scheduling assistant — CoverGrid" },
      {
        name: "description",
        content:
          "Ask a question or give a command about shifts, coverage, call-offs and overtime — answered from live data.",
      },
      { property: "og:title", content: "Scheduling assistant — CoverGrid" },
      {
        property: "og:description",
        content: "Scheduling answers and actions from live facility data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AssistantPage,
});

function AssistantPage() {
  const qc = useQueryClient();
  const loadConfig = useServerFn(getFacilityConfig);
  const loadHistory = useServerFn(getChatHistory);
  const ask = useServerFn(askAssistant);
  const clear = useServerFn(clearChatHistory);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const { data: config } = useQuery({ queryKey: ["facility-config"], queryFn: () => loadConfig() });
  const history = useQuery({ queryKey: ["chat"], queryFn: () => loadHistory() });

  const send = useMutation({
    mutationFn: (message: string) => ask({ data: { message } }),
    onSuccess: () => {
      setInput("");
      void qc.invalidateQueries({ queryKey: ["chat"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["me"] });
      boxRef.current?.focus();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const messages = history.data ?? [];

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, send.isPending]);

  const submit = () => {
    const text = input.trim();
    if (text && !send.isPending) send.mutate(text);
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-9rem)] w-full max-w-3xl flex-col">
      <div className="flex items-start justify-between gap-4 pb-4">
        <div>
          <h1 className="font-display text-3xl">Scheduling assistant</h1>
          <p className="text-muted-foreground">
            {config?.isManager
              ? "Type a question or a command. It works from live schedule data."
              : "Type a question about your schedule, hours or time off."}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await clear();
            void qc.invalidateQueries({ queryKey: ["chat"] });
          }}
        >
          Clear
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pb-6 pr-1">
        {messages.length === 0 && (
          <p className="pt-10 text-center text-sm text-muted-foreground">
            Ask anything about the schedule to get started.
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
          placeholder="Type your question or command here…"
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
