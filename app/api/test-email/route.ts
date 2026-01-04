import { NextRequest, NextResponse } from "next/server";
import sgMail from "@sendgrid/mail";

// Configure SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const EMAIL_FROM = process.env.FROM_EMAIL || process.env.EMAIL_FROM; // Support both FROM_EMAIL and EMAIL_FROM

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/test-email - Test SendGrid configuration
export async function GET(request: NextRequest) {
  try {
    const testEmail = request.nextUrl.searchParams.get("email") || "test@example.com";

    if (!SENDGRID_API_KEY) {
      return NextResponse.json({
        configured: false,
        message: "SENDGRID_API_KEY is not set",
        testEmail,
      });
    }

    if (!EMAIL_FROM) {
      return NextResponse.json({
        configured: false,
        message: "FROM_EMAIL (or EMAIL_FROM) environment variable is required but not set",
        testEmail,
      }, { status: 500 });
    }

    const msg = {
      to: testEmail,
      from: EMAIL_FROM,
      subject: "Test Email from Asset Organizer",
      text: "This is a test email to verify SendGrid is working correctly.",
      html: "<p>This is a <strong>test email</strong> to verify SendGrid is working correctly.</p>",
    };

    try {
      await sgMail.send(msg);
      return NextResponse.json({
        configured: true,
        sent: true,
        message: "Test email sent successfully",
        to: testEmail,
        from: EMAIL_FROM,
      });
    } catch (error: any) {
      const sendGridError = error.response?.body || error.message;
      let errorMessage = "Failed to send test email";
      let errorDetails = sendGridError;

      // Parse SendGrid error for helpful messages
      if (sendGridError?.errors && Array.isArray(sendGridError.errors)) {
        const firstError = sendGridError.errors[0];
        if (firstError?.message) {
          errorMessage = firstError.message;
          
          // Provide specific guidance for common errors
          if (firstError.message.includes("sender") || firstError.message.includes("from") || firstError.message.includes("verified")) {
            errorMessage = `Sender email "${EMAIL_FROM}" is not verified in SendGrid. Please verify this email address in SendGrid Dashboard → Settings → Sender Authentication.`;
          } else if (firstError.message.includes("permission") || firstError.message.includes("unauthorized")) {
            errorMessage = "SendGrid API key lacks 'Mail Send' permission or is invalid. Check your API key permissions in SendGrid.";
          } else if (firstError.message.includes("credits") || firstError.message.includes("quota") || firstError.message.includes("exceeded")) {
            errorMessage = "SendGrid account has exceeded email sending limits. Check your SendGrid account usage.";
          } else if (firstError.message.includes("Forbidden")) {
            errorMessage = "SendGrid API request forbidden. Check API key permissions and sender verification.";
          }
        }
      }

      return NextResponse.json({
        configured: true,
        sent: false,
        message: errorMessage,
        error: errorMessage,
        details: errorDetails,
        to: testEmail,
        from: EMAIL_FROM,
        troubleshooting: {
          checkSenderVerification: "Verify EMAIL_FROM address in SendGrid Dashboard → Settings → Sender Authentication",
          checkApiKeyPermissions: "Ensure API key has 'Mail Send' permission in SendGrid Dashboard → Settings → API Keys",
          checkAccountLimits: "Check SendGrid account usage and limits in SendGrid Dashboard",
        },
      }, { status: 500 });
    }

  } catch (error: any) {
    return NextResponse.json({
      configured: !!SENDGRID_API_KEY,
      sent: false,
      message: "Error testing email",
      error: error.message,
    }, { status: 500 });
  }
}
