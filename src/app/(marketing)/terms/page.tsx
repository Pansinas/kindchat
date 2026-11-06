import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/prose";

export const metadata: Metadata = { title: "Terms and conditions" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms and conditions" updated="6 November 2026">
      <section>
        <h2>Using Pairvella</h2>
        <p>
          Pairvella is a private messaging service for two people in a relationship. You must be at least 16 years old,
          or the age of digital consent where you live, to create an account.
        </p>
      </section>
      <section>
        <h2>Your account</h2>
        <ul>
          <li>Keep your password private. You are responsible for activity on your account.</li>
          <li>Add a recovery email if you want to be able to reset a forgotten password.</li>
          <li>Don&apos;t impersonate anyone or choose a misleading username.</li>
        </ul>
      </section>
      <section>
        <h2>Consent</h2>
        <p>
          A couple space is created only when both people agree. Either person can end it at any time, and either
          person can block the other.
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>No harassment, threats or abuse.</li>
          <li>No spam, automated messaging or attempts to get around rate limits.</li>
          <li>No attempts to access another person&apos;s account or data.</li>
          <li>No illegal content.</li>
        </ul>
        <p>We may suspend accounts that break these rules or put others at risk.</p>
      </section>
      <section>
        <h2>Your content</h2>
        <p>
          Your messages belong to you. You give us permission only to store and deliver them so the service works.
          See the privacy policy for how long we keep them.
        </p>
      </section>
      <section>
        <h2>Availability</h2>
        <p>
          We work hard to keep Pairvella reliable, but it is provided &quot;as is&quot;, and we can&apos;t guarantee
          it will always be available or error-free.
        </p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>If we change these terms in a meaningful way, we&apos;ll tell you in the app before the change takes effect.</p>
      </section>
    </LegalPage>
  );
}
