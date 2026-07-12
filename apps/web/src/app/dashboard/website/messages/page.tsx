import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui";
import type { ContactMessageRecord, WebsiteSite } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";

export default async function MessagesPage() {
  const siteResult = await serverFetch<{ site: WebsiteSite }>("/api/sites/me");
  if (!siteResult.ok) notFound();
  const { site } = siteResult.data;

  const messagesResult = await serverFetch<{ messages: ContactMessageRecord[] }>(`/api/sites/${site.id}/messages`);
  const messages = messagesResult.ok ? messagesResult.data.messages : [];

  return (
    <PageShell maxWidth="2xl">
        <div className="flex flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
          <h1 className="text-lg font-semibold text-black dark:text-zinc-50">Messages</h1>
          {messages.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No messages yet from your site&apos;s contact form.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {messages.map((message) => (
                <li key={message.id} className="flex flex-col gap-1 rounded border border-black/[.08] p-3 text-sm dark:border-white/[.145]">
                  <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-500">
                    <span>
                      {message.name} · {message.email}
                    </span>
                    <span>{new Date(message.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-black dark:text-zinc-50">{message.message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
    </PageShell>
  );
}
