import Link from "next/link";
import { BarChart3, Bot, ChevronRight, FlaskConical } from "lucide-react";
import { requirePagePermission } from "@/lib/staff";
import { loadConfigState } from "@/lib/bot/config";
import { SECTION_KEYS } from "@/lib/bot/schema";
import { SECTION_INFO } from "@/lib/bot/sections";
import { Callout, PageHeader } from "@/components/admin/ui";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { config } from "@/lib/config";

export const metadata = { title: "Chatbot Studio" };

export default async function ChatbotStudioPage() {
  await requirePagePermission("chatbot.manage", "/admin/chatbot");
  const state = await loadConfigState({ fresh: true });
  const groups = Array.from(new Set(SECTION_KEYS.map((key) => SECTION_INFO[key].group)));
  const { nodes } = state.config.menu;

  return (
    <>
      <PageHeader
        eyebrow="Assistant"
        title="Chatbot Studio"
        description="Everything the Pros-Link Assistant says and does on the website and WhatsApp — menus, questions, prices, teams, scoring and automation — editable here without touching code."
        actions={
          <>
            <Link href="/admin/chatbot/simulator" className={buttonVariants({ variant: "brand", size: "sm" })}>
              <FlaskConical /> Try it
            </Link>
            <Link href="/admin/chatbot/analytics" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <BarChart3 /> Analytics
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Menu items" value={Object.keys(nodes).length} />
        <Summary label="Qualification flows" value={Object.keys(state.config.flows).length} />
        <Summary label="Published prices" value={state.config.pricing.length} />
        <Summary label="Customised sections" value={`${state.customised.length} / ${SECTION_KEYS.length}`} />
      </div>

      <div className="mb-6 space-y-3">
        {state.error && (
          <Callout title="Using the built-in defaults">
            The stored configuration could not be read ({state.error}). The assistant keeps working with the defaults.
          </Callout>
        )}
        {state.invalid.map((entry) => (
          <Callout key={entry.section} title={`Stored "${SECTION_INFO[entry.section].title}" is being ignored`}>
            It no longer matches the expected format, so the default is in use: {entry.issues.slice(0, 3).join("; ")}
          </Callout>
        ))}
        {state.warnings.length > 0 && (
          <Callout title={`${state.warnings.length} configuration warning${state.warnings.length === 1 ? "" : "s"}`}>
            <ul className="list-disc pl-4">
              {state.warnings.slice(0, 8).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </Callout>
        )}
        {!config.whatsapp.enabled && (
          <Callout title="WhatsApp is not connected on this server">
            Changes save normally and the simulator works, but customers will not receive replies until WhatsApp is
            configured under Integrations.
          </Callout>
        )}
      </div>

      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group}>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{group}</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {SECTION_KEYS.filter((key) => SECTION_INFO[key].group === group).map((key) => (
                <Link key={key} href={`/admin/chatbot/${key}`} className="group">
                  <Card className="flex h-full items-start gap-3 p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-primary/30">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{SECTION_INFO[key].title}</p>
                        {state.customised.includes(key) ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            Customised
                          </span>
                        ) : (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{SECTION_INFO[key].description}</p>
                    </div>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
        <Bot className="size-4" />
      </span>
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-lg font-bold tabular-nums">{value}</p>
      </div>
    </Card>
  );
}
