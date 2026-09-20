import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getMessages, sendMessageFn } from "@/lib/workforce.functions";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({
    meta: [
      { title: "Messages — CoverGrid" },
      {
        name: "description",
        content:
          "Broadcast to a unit or shift, or send a direct message — every staffing conversation in one thread.",
      },
      { property: "og:title", content: "Messages — CoverGrid" },
      {
        property: "og:description",
        content: "Facility-wide broadcasts and direct messages for staffing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const qc = useQueryClient();
  const load = useServerFn(getMessages);
  const send = useServerFn(sendMessageFn);
  const [recipientId, setRecipientId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const { data } = useQuery({ queryKey: ["messages"], queryFn: () => load() });

  const sendMutation = useMutation({
    mutationFn: () =>
      send({
        data: {
          recipientId: recipientId || null,
          audience: recipientId ? "direct" : "all",
          subject,
          body,
        },
      }),
    onSuccess: () => {
      toast.success(recipientId ? "Message sent." : "Broadcast sent to the whole facility.");
      setSubject("");
      setBody("");
      void qc.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Messages</h1>
        <p className="text-muted-foreground">
          Open-shift invitations, alerts and manager broadcasts all land here alongside direct
          messages.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New message</CardTitle>
            <CardDescription>
              {data?.isManager
                ? "Leave the recipient blank to broadcast facility-wide."
                : "Pick who you want to reach."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
            >
              <option value="">
                {data?.isManager ? "Everyone (broadcast)" : "Choose a recipient…"}
              </option>
              {(data?.employees ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </select>
            <Input
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <Textarea
              placeholder="Message"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <Button
              disabled={!body || sendMutation.isPending}
              onClick={() => sendMutation.mutate()}
            >
              Send
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Inbox</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(data?.messages ?? []).length === 0 && (
              <p className="text-muted-foreground">Nothing here yet.</p>
            )}
            {(data?.messages ?? []).map((msg) => (
              <div key={msg.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{msg.subject || "(no subject)"}</span>
                  <Badge variant={msg.recipient_id ? "secondary" : "default"}>
                    {msg.recipient_id ? "Direct" : `Broadcast · ${msg.audience}`}
                  </Badge>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{msg.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {msg.sender_name} · {new Date(msg.created_at).toLocaleString("en-US")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
