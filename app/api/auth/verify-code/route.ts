import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/token-utils";
import { encode } from "next-auth/jwt";
import { randomUUID } from "crypto";
import { isAllowedEmailDomain, getEmailDomainError } from "@/lib/email-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, code } = body;

    // Validate inputs
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email address is required" },
        { status: 400 }
      );
    }

    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json(
        { error: "Valid 6-digit code is required" },
        { status: 400 }
      );
    }

    // Check if email is from allowed domain
    if (!isAllowedEmailDomain(email)) {
      return NextResponse.json(
        { error: getEmailDomainError() },
        { status: 403 }
      );
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();
    const hashedCode = hashToken(code);

    console.log("[Verify Code] Verifying code for:", normalizedEmail);
    console.log("[Verify Code] Code (first 3):", code.substring(0, 3) + "***");

    // Find the verification token
    const verificationToken = await prisma.verificationToken.findFirst({
      where: {
        identifier: normalizedEmail,
      },
    });

    if (!verificationToken) {
      console.log("[Verify Code] No code found for email");
      return NextResponse.json(
        { error: "Invalid or expired code. Please request a new one." },
        { status: 400 }
      );
    }

    // Check if code matches
    if (verificationToken.token !== hashedCode) {
      console.log("[Verify Code] Code mismatch");
      return NextResponse.json(
        { error: "Invalid code. Please check and try again." },
        { status: 400 }
      );
    }

    // Check if expired
    if (new Date() > verificationToken.expires) {
      console.log("[Verify Code] Code expired");
      // Clean up expired token
      await prisma.verificationToken.delete({
        where: {
          identifier_token: {
            identifier: normalizedEmail,
            token: verificationToken.token,
          },
        },
      });
      return NextResponse.json(
        { error: "Code has expired. Please request a new one." },
        { status: 400 }
      );
    }

    console.log("[Verify Code] Code valid, proceeding with authentication");

    // Delete the used token
    await prisma.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: normalizedEmail,
          token: verificationToken.token,
        },
      },
    });

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      console.log("[Verify Code] Creating new user for:", normalizedEmail);
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          emailVerified: "VERIFIED",
          emailVerifiedAt: new Date(),
        },
      });
      console.log("[Verify Code] User created:", user.id);
    } else {
      // Update email verification status
      if (user.emailVerified !== "VERIFIED") {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            emailVerified: "VERIFIED",
            emailVerifiedAt: new Date(),
          },
        });
        console.log("[Verify Code] User email verified:", user.id);
      }
    }

    // Create JWT token (30 days expiry)
    // The token MUST match the format NextAuth expects for session creation
    const maxAge = 30 * 24 * 60 * 60; // 30 days in seconds
    const now = Math.floor(Date.now() / 1000);
    const token = await encode({
      token: {
        // Core identity fields (required for session.user)
        sub: user.id,
        email: user.email,
        name: user.name || null,
        picture: user.image || null,
        // Custom fields for our app
        emailVerified: user.emailVerified,
        // Standard JWT fields
        iat: now,
        exp: now + maxAge,
        jti: randomUUID(), // Unique token ID
      },
      secret: NEXTAUTH_SECRET!,
      maxAge,
    });

    console.log("[Verify Code] JWT created for user:", user.id);
    console.log("[Verify Code] JWT includes: sub, email, name, picture, emailVerified");

    // Create response with session cookie
    const response = NextResponse.json({
      success: true,
      message: "Successfully signed in",
      user: {
        id: user.id,
        email: user.email,
      },
    });

    // Set the session cookie (NextAuth compatible)
    const isProduction = process.env.NODE_ENV === "production";
    const cookieName = isProduction 
      ? "__Secure-next-auth.session-token"
      : "next-auth.session-token";

    console.log("[Verify Code] Setting cookie:", cookieName);
    console.log("[Verify Code] NODE_ENV:", process.env.NODE_ENV);
    console.log("[Verify Code] Is Production:", isProduction);

    response.cookies.set(cookieName, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: maxAge,
    });

    console.log("[Verify Code] ✅ Session cookie set successfully");
    console.log("[Verify Code] Cookie settings: httpOnly=true, secure=" + isProduction + ", sameSite=lax, path=/, maxAge=" + maxAge);

    return response;
  } catch (error: any) {
    console.error("[Verify Code] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
