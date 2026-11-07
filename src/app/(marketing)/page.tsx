import { CheckCheck, Lock, MessageCircleHeart, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Users,
    title: "Only the two of you",
    body: "One shared space, exactly two people. No feeds, no followers, no strangers.",
  },
  {
    icon: MessageCircleHeart,
    title: "Real time, and it stays",
    body: "Messages arrive instantly and are kept safely, so your history is there whenever you return.",
  },
  {
    icon: Lock,
    title: "Private by design",
    body: "Strict access controls mean only you and your partner can read your conversation. You decide what you share.",
  },
];

export default function LandingPage() {
  return (
    <>
      <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 pt-10 pb-20 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
        <div className="max-w-xl">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-[13px] text-accent-foreground">
            Private messaging for couples
          </p>
          <h1 className="text-[2.6rem] leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
            A quieter place for two.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground text-pretty">
            KindChat gives you and your partner a calm, private space to talk — away from group chats, notifications
            and noise. Just your conversation, kept safe.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/register">Create your space</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">I already have an account</Link>
            </Button>
          </div>
        </div>

        <div aria-hidden className="relative mx-auto w-full max-w-md">
          <div className="absolute -inset-6 rounded-[2rem] bg-accent/60 blur-2xl" />
          <div className="relative rounded-[1.75rem] border border-border bg-card p-5 shadow-[0_20px_60px_-25px_rgba(43,42,51,0.25)]">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <div className="flex size-10 items-center justify-center rounded-full bg-accent text-sm font-medium text-accent-foreground">M</div>
              <div>
                <p className="text-sm font-medium">Maya</p>
                <p className="text-xs text-success">online</p>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 pt-5 text-[15px]">
              <p className="max-w-[80%] self-start rounded-2xl rounded-bl-md border border-border bg-bubble-theirs px-4 py-2.5">
                Made it home. The rain finally stopped 🌧️
              </p>
              <p className="max-w-[80%] self-end rounded-2xl rounded-br-md bg-bubble-mine px-4 py-2.5 text-bubble-mine-foreground">
                Good. Tea and a film tonight?
              </p>
              <p className="max-w-[80%] self-start rounded-2xl rounded-bl-md border border-border bg-bubble-theirs px-4 py-2.5">
                Already putting the kettle on.
              </p>
              <span className="flex items-center gap-1 self-end text-xs text-muted-foreground">
                Seen <CheckCheck className="size-3.5 text-read-tick" strokeWidth={2.5} />
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-card/50">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 sm:px-8 md:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <span className="mb-4 inline-flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Icon className="size-5" />
              </span>
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              <p className="mt-2 leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-5 py-20 text-center sm:px-8">
        <h2 className="text-3xl font-semibold tracking-tight text-balance">Start with a username. Invite your person.</h2>
        <p className="mx-auto mt-4 max-w-xl leading-relaxed text-muted-foreground">
          Create an account, then find your partner by username or send them a private invitation link. Your space opens
          only when you both agree.
        </p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/register">Get started</Link>
        </Button>
      </section>
    </>
  );
}
