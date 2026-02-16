import { FileUploader } from "@/components/FileUploader";

const baseUrl =
  process.env.NEXTAUTH_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://axiom.nytromarketing.com"
    : "http://localhost:3000");

export default function Home() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center p-4 sm:p-8 lg:p-12 xl:p-24">
      <div className="w-full max-w-4xl">
        <header className="text-center mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4 font-roboto-condensed text-brand-dark-blue">
            Asset Organizer
          </h1>
          <p className="text-base sm:text-lg text-foreground font-medium mb-4 max-w-2xl mx-auto">
            Asset Organizer is a marketing asset intelligence application. It helps marketing teams
            upload, analyze, and organize their marketing assets with AI-powered categorization,
            insights, and reporting—so you can find, reuse, and improve content across campaigns.
          </p>
          <p className="text-sm text-muted-foreground mb-2">
            Upload marketing assets for AI-powered analysis and categorization.
          </p>
          <p className="text-sm text-muted-foreground">
            <a
              href={`${baseUrl}/privacy`}
              className="underline underline-offset-4 hover:text-brand-orange text-brand-blue"
            >
              Privacy Policy
            </a>
            {" · "}
            <a
              href={`${baseUrl}/terms`}
              className="underline underline-offset-4 hover:text-brand-orange text-brand-blue"
            >
              Terms of Service
            </a>
          </p>
        </header>
        <FileUploader redirectAfterUpload={true} />
      </div>
    </main>
  );
}
