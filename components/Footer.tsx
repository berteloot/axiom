export function Footer() {
  const currentYear = new Date().getFullYear();
  const linkedInUrl = "https://www.linkedin.com/in/berteloot/";
  const baseUrl =
    process.env.NEXTAUTH_URL ||
    (process.env.NODE_ENV === "production" ? "https://axiom.nytromarketing.com" : "http://localhost:3000");

  return (
    <footer className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-sm text-muted-foreground">
          <span>© {currentYear} Copyright</span>
          <a
            href={`${baseUrl}/privacy`}
            className="hover:text-brand-orange text-brand-blue transition-colors underline underline-offset-4"
          >
            Privacy Policy
          </a>
          <a
            href={`${baseUrl}/terms`}
            className="hover:text-brand-orange text-brand-blue transition-colors underline underline-offset-4"
          >
            Terms of Service
          </a>
          <a
            href={linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-brand-orange text-brand-blue transition-colors underline underline-offset-4"
          >
            Stan Berteloot
          </a>
        </div>
      </div>
    </footer>
  );
}
