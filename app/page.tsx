import { FileUploader } from "@/components/FileUploader";

export default function Home() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center p-4 sm:p-8 lg:p-12 xl:p-24">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-6 sm:mb-8 lg:mb-12">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-4 font-roboto-condensed text-brand-dark-blue">Upload Assets</h1>
          <p className="text-sm sm:text-base lg:text-lg text-muted-foreground mb-4 sm:mb-6 px-4">
            Upload marketing assets for AI-powered analysis and categorization
          </p>
        </div>
        <FileUploader />
      </div>
    </main>
  );
}
