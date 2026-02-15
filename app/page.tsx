import Link from "next/link";
import { FileUploader } from "@/components/FileUploader";

export default function Home() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center p-4 sm:p-8 lg:p-12 xl:p-24">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-6 sm:mb-8 lg:mb-12">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-4 font-roboto-condensed text-brand-dark-blue">Asset Organizer</h1>
          <p className="text-lg sm:text-xl font-semibold text-muted-foreground mb-2 sm:mb-3">Upload Assets</p>
          <p className="text-sm sm:text-base lg:text-lg text-muted-foreground mb-4 sm:mb-6 px-4">
            Upload marketing assets for AI-powered analysis and categorization
          </p>
          <p className="text-sm text-muted-foreground">
            <Link href="/privacy" className="underline underline-offset-4 hover:text-brand-orange text-brand-blue">
              Privacy Policy
            </Link>
            {" · "}
            <Link href="/terms" className="underline underline-offset-4 hover:text-brand-orange text-brand-blue">
              Terms of Service
            </Link>
          </p>
        </div>
        <FileUploader redirectAfterUpload={true} />
      </div>
    </main>
  );
}
