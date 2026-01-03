"use server";

import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Zod schema for filter state validation
const FilterStateSchema = z.object({
  search: z.string().optional().default(""),
  funnelStages: z.array(z.enum([
    "TOFU_AWARENESS",
    "MOFU_CONSIDERATION",
    "BOFU_DECISION",
    "RETENTION"
  ])).optional().default([]),
  icpTargets: z.array(z.string()).optional().default([]),
  statuses: z.array(z.enum([
    "PENDING",
    "PROCESSING",
    "PROCESSED",
    "APPROVED",
    "ERROR"
  ])).optional().default([]),
  painClusters: z.array(z.string()).optional().default([]),
  sortBy: z.enum([
    "title",
    "createdAt",
    "updatedAt",
    "customCreatedAt",
    "lastReviewedAt",
    "funnelStage",
    "status",
    "contentQualityScore"
  ]).optional().default("createdAt"),
  sortDirection: z.enum(["asc", "desc"]).optional().default("desc"),
});

const CreateSmartCollectionSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  filterState: FilterStateSchema,
});

const DeleteSmartCollectionSchema = z.object({
  id: z.string().cuid("Invalid collection ID"),
});

export type SmartCollection = {
  id: string;
  name: string;
  userId: string;
  accountId: string;
  filterState: z.infer<typeof FilterStateSchema>;
  createdAt: Date;
};

export type ActionResult<T = void> = 
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Get the current user's session info (userId and accountId)
 */
async function getSessionInfo(): Promise<{ userId: string; accountId: string } | null> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      console.log("[getSessionInfo] No session found");
      return null;
    }
    
    if (!session.user?.id) {
      console.log("[getSessionInfo] Session found but no user ID");
      return null;
    }

    const userId = session.user.id;

    // Get the user's current account from their session
    const userSession = await prisma.session.findUnique({
      where: { userId },
    });

    if (!userSession) {
      console.log("[getSessionInfo] No user session found in database for userId:", userId);
      return null;
    }
    
    if (!userSession.accountId) {
      console.log("[getSessionInfo] User session found but no accountId for userId:", userId);
      return null;
    }

    return { userId, accountId: userSession.accountId };
  } catch (error) {
    console.error("[getSessionInfo] Error:", error);
    if (error instanceof Error) {
      console.error("[getSessionInfo] Error message:", error.message);
      console.error("[getSessionInfo] Error stack:", error.stack);
    }
    return null;
  }
}

/**
 * Create a new smart collection (saved search)
 */
export async function createSmartCollection(
  name: string,
  filterState: z.infer<typeof FilterStateSchema>
): Promise<ActionResult<SmartCollection>> {
  try {
    // Validate input
    const validatedData = CreateSmartCollectionSchema.parse({ name, filterState });

    // Get session info
    const sessionInfo = await getSessionInfo();
    if (!sessionInfo) {
      return { success: false, error: "You must be logged in to create a smart collection" };
    }

    // Check if a collection with the same name already exists for this user/account
    const existing = await prisma.smartCollection.findFirst({
      where: {
        name: validatedData.name,
        userId: sessionInfo.userId,
        accountId: sessionInfo.accountId,
      },
    });

    if (existing) {
      return { success: false, error: "A collection with this name already exists" };
    }

    // Create the smart collection
    const collection = await prisma.smartCollection.create({
      data: {
        name: validatedData.name,
        userId: sessionInfo.userId,
        accountId: sessionInfo.accountId,
        filterState: validatedData.filterState,
      },
    });

    revalidatePath("/dashboard");

    return {
      success: true,
      data: {
        ...collection,
        filterState: collection.filterState as z.infer<typeof FilterStateSchema>,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    console.error("Error creating smart collection:", error);
    return { success: false, error: "Failed to create smart collection" };
  }
}

/**
 * Get all smart collections for the current user and account
 */
export async function getSmartCollections(): Promise<ActionResult<SmartCollection[]>> {
  try {
    const sessionInfo = await getSessionInfo();
    if (!sessionInfo) {
      return { success: false, error: "You must be logged in to view smart collections" };
    }

    console.log("[getSmartCollections] Fetching collections for userId:", sessionInfo.userId, "accountId:", sessionInfo.accountId);

    const collections = await prisma.smartCollection.findMany({
      where: {
        userId: sessionInfo.userId,
        accountId: sessionInfo.accountId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    console.log("[getSmartCollections] Found", collections.length, "collections");

    return {
      success: true,
      data: collections.map((collection) => ({
        ...collection,
        filterState: collection.filterState as z.infer<typeof FilterStateSchema>,
      })),
    };
  } catch (error) {
    console.error("[getSmartCollections] Error fetching smart collections:", error);
    if (error instanceof Error) {
      console.error("[getSmartCollections] Error message:", error.message);
      console.error("[getSmartCollections] Error stack:", error.stack);
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { 
      success: false, 
      error: `Failed to fetch smart collections: ${errorMessage}` 
    };
  }
}

/**
 * Delete a smart collection
 */
export async function deleteSmartCollection(id: string): Promise<ActionResult> {
  try {
    // Validate input
    const validatedData = DeleteSmartCollectionSchema.parse({ id });

    const sessionInfo = await getSessionInfo();
    if (!sessionInfo) {
      return { success: false, error: "You must be logged in to delete a smart collection" };
    }

    // Find the collection and verify ownership
    const collection = await prisma.smartCollection.findFirst({
      where: {
        id: validatedData.id,
        userId: sessionInfo.userId,
        accountId: sessionInfo.accountId,
      },
    });

    if (!collection) {
      return { success: false, error: "Collection not found or you don't have permission to delete it" };
    }

    // Delete the collection
    await prisma.smartCollection.delete({
      where: { id: validatedData.id },
    });

    revalidatePath("/dashboard");

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    console.error("Error deleting smart collection:", error);
    return { success: false, error: "Failed to delete smart collection" };
  }
}
