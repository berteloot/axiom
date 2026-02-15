import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Asset Organizer",
  description: "Privacy policy for Asset Organizer.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] py-8 sm:py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
        <h1 className="text-2xl sm:text-3xl font-bold font-roboto-condensed text-brand-dark-blue mb-6">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString("en-US")}</p>

        <div className="space-y-6 text-sm sm:text-base text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">1. Introduction</h2>
            <p>
              Asset Organizer (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) respects your privacy. This policy describes how we collect, use, and protect your information when you use our marketing asset intelligence application at https://axiom.nytromarketing.com (the &quot;Service&quot;).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">2. Information We Collect</h2>
            <p>
              We collect information you provide directly (e.g. email address, account details, uploaded assets and metadata) and information we obtain automatically (e.g. usage data, logs, device information) to operate and improve the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">3. How We Use Your Information</h2>
            <p>
              We use your information to provide, maintain, and improve the Service; to communicate with you; to comply with legal obligations; and to protect our rights and the security of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">4. Data Sharing and Third Parties</h2>
            <p>
              We do not sell your personal data. We may share data with service providers (e.g. hosting, analytics, email) that assist in operating the Service, subject to confidentiality and data protection commitments. We may disclose information where required by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">5. Data Retention and Security</h2>
            <p>
              We retain your data for as long as your account is active or as needed to provide the Service and comply with legal obligations. We implement appropriate technical and organizational measures to protect your data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">6. Your Rights</h2>
            <p>
              Depending on your location, you may have rights to access, correct, delete, or port your data, or to object to or restrict certain processing. Contact us using the details below to exercise these rights.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">7. Contact</h2>
            <p>
              For privacy-related questions or requests, contact us at the email or address provided on the Asset Organizer application or website.
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
