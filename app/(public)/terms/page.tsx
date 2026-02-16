import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Asset Organizer",
  description: "Terms of service for Asset Organizer.",
};

export default function TermsPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] py-8 sm:py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
        <h1 className="text-2xl sm:text-3xl font-bold font-roboto-condensed text-brand-dark-blue mb-6">
          Terms of Service
        </h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString("en-US")}</p>

        <div className="space-y-6 text-sm sm:text-base text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">1. Acceptance</h2>
            <p>
              By accessing or using Asset Organizer (&quot;Service&quot;) at https://axiom.nytromarketing.com, you agree to these Terms of Service. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">2. Description of Service</h2>
            <p>
              Asset Organizer is a marketing asset intelligence application that helps users upload, analyze, and organize marketing assets. We reserve the right to modify, suspend, or discontinue the Service at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">3. Account Terms</h2>
            <p>
              You must provide accurate information when creating an account and keep your account secure. You are responsible for all activity under your account. You must be at least 18 years old (or the age of majority in your jurisdiction) to use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">4. Acceptable Use</h2>
            <p>
              You agree not to use the Service for any illegal purpose or in violation of any laws; to infringe others&apos; intellectual property or privacy; to transmit malware or abuse the Service; or to attempt to gain unauthorized access to our systems or other users&apos; data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">5. Intellectual Property</h2>
            <p>
              The Service and its content (excluding your uploaded assets) are owned by us or our licensors. You retain ownership of your content; by using the Service you grant us a limited license to store, process, and display it as necessary to provide the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">6. Disclaimer of Warranties</h2>
            <p>
              The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, express or implied. We do not warrant that the Service will be uninterrupted, error-free, or free of harmful components.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">7. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or data, arising from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">8. Termination</h2>
            <p>
              We may suspend or terminate your access to the Service at any time for breach of these terms or for any other reason. You may stop using the Service at any time. Provisions that by their nature should survive will survive termination.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">9. Changes</h2>
            <p>
              We may update these Terms from time to time. We will notify you of material changes by posting the updated Terms on the Service or by email. Continued use of the Service after changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">10. Contact</h2>
            <p>
              For questions about these Terms, contact us at the email or address provided on the Asset Organizer application or website.
            </p>
          </section>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-brand-orange text-brand-blue underline underline-offset-4">
            ← Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
