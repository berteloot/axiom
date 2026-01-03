export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only run on server-side (not in Edge runtime)
    const { prisma } = await import('./lib/prisma');

    // Cleanup stuck transcription jobs on server startup
    // This handles cases where the server was restarted during processing
    async function cleanupStuckJobs() {
      try {
        console.log('[STARTUP] Checking for stuck transcription jobs...');
        
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        
        // Clean up jobs stuck in PROCESSING (interrupted mid-process)
        const stuckProcessing = await prisma.transcriptionJob.updateMany({
          where: { 
            status: "PROCESSING",
            // Only mark as failed if they've been processing for more than 30 minutes
            // (prevents false positives for jobs that are legitimately still running)
            updatedAt: {
              lt: thirtyMinutesAgo
            }
          },
          data: { 
            status: "FAILED", 
            error: "Server restarted during processing. The job was interrupted. Please try again.",
            progress: 0,
          },
        });
        
        // Clean up jobs stuck in PENDING (created but never started)
        const stuckPending = await prisma.transcriptionJob.updateMany({
          where: { 
            status: "PENDING",
            // Jobs stuck in PENDING for more than 5 minutes are likely orphaned
            createdAt: {
              lt: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
            }
          },
          data: { 
            status: "FAILED", 
            error: "Job was created but never started. Server may have restarted. Please try again.",
            progress: 0,
          },
        });
        
        const totalCleaned = stuckProcessing.count + stuckPending.count;
        
        if (totalCleaned > 0) {
          console.log(`[STARTUP] 🧹 Cleaned up ${totalCleaned} stuck transcription job(s): ${stuckProcessing.count} PROCESSING, ${stuckPending.count} PENDING`);
        } else {
          console.log('[STARTUP] ✅ No stuck transcription jobs found.');
        }
      } catch (error) {
        console.error('[STARTUP] Error cleaning up stuck jobs:', error);
        // Don't throw - we don't want to prevent server startup if cleanup fails
      }
    }

    // Run cleanup on server startup
    cleanupStuckJobs().catch((error) => {
      console.error('[STARTUP] Cleanup job failed:', error);
    });
  }
}