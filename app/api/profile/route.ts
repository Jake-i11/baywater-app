import { NextResponse } from "next/server";
import { hasCompletedOnboarding, completeOnboarding } from "@/lib/profile-utils";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Missing userId parameter" },
        { status: 400 }
      );
    }

    // Check onboarding status
    const onboardingCompleted = await hasCompletedOnboarding(userId);

    return NextResponse.json({
      success: true,
      hasCompletedOnboarding: onboardingCompleted
    });

  } catch (error) {
    console.error("Profile API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to check profile status",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { userId, action } = await request.json();

    if (!userId || !action) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters: userId, action" },
        { status: 400 }
      );
    }

    if (action === "completeOnboarding") {
      await completeOnboarding(userId);
      return NextResponse.json({
        success: true,
        message: "Onboarding completed successfully"
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Invalid action" },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error("Profile API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to complete onboarding",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
