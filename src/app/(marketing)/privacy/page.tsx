import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/prose";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="6 November 2026">
      <section>
        <h2>The short version</h2>
        <p>
          KindChat exists so two people can talk privately. We collect only what we need to run the service, we never
          sell your data, and we never show you ads.
        </p>
      </section>
      <section>
        <h2>What we store</h2>
        <ul>
          <li>Your username, display name, optional photo and optional short bio.</li>
          <li>Your password, stored only as a secure hash by our authentication provider. We never see it.</li>
          <li>An optional recovery email, used only to help you reset your password. It is never shown to anyone.</li>
          <li>Your messages, their timestamps, and delivery and read status.</li>
          <li>Your privacy, notification and appearance preferences.</li>
          <li>Security records such as sign-in attempts, with IP addresses stored only as one-way hashes.</li>
        </ul>
      </section>
      <section>
        <h2>Who can see your messages</h2>
        <p>
          Only the two members of a couple space can read its conversation. This is enforced inside our database with
          strict access rules, not just by the app.
        </p>
        <p>
          Messages are encrypted in transit and at rest, but they are <strong>not end-to-end encrypted</strong>. Our
          staff do not have routine access to conversations. Content is only ever reviewed if you choose to include it
          in a report, or if we are legally required to.
        </p>
      </section>
      <section>
        <h2>The KindChat team chat</h2>
        <p>
          Every account has a separate chat with the founder of KindChat, used for a welcome message, support and
          feedback. Messages you send there are read by the founder. This chat is completely separate from your couple
          space: the founder can never see conversations between you and your partner.
        </p>
      </section>
      <section>
        <h2>Your local time</h2>
        <p>
          Your device&apos;s time zone is stored so the people you chat with can see your local time when it differs
          from theirs. It is never shown to anyone else.
        </p>
      </section>
      <section>
        <h2>Online status and last seen</h2>
        <p>
          You can hide your online status and your last-seen time in Settings. If you hide your last seen, you also
          won&apos;t see your partner&apos;s.
        </p>
      </section>
      <section>
        <h2>When a couple disconnects</h2>
        <p>
          Either partner can disconnect at any time. Both of you immediately lose access to the shared conversation. For
          30 days afterwards, each of you can download a copy of it from Settings. After 30 days the messages are
          permanently deleted. Nothing is deleted silently.
        </p>
      </section>
      <section>
        <h2>Your controls</h2>
        <ul>
          <li>Export your data at any time from Settings → Your data.</li>
          <li>Delete your account permanently from Settings. Your profile and sign-in details are removed immediately.</li>
          <li>Block or report anyone who contacts you.</li>
        </ul>
      </section>
      <section>
        <h2>Service providers</h2>
        <p>
          We use Supabase for database, authentication and realtime infrastructure, Vercel for hosting, and an email
          provider only for password recovery emails.
        </p>
      </section>
    </LegalPage>
  );
}
