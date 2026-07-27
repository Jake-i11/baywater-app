import { NextResponse } from "next/server";
import {
  createPreTradeCommitment,
  lockPreTradeCommitment,
  getUnlockedCommitments
} from "@/lib/commitment-utils";

export async function POST(request: Request) {
  try {
    const { action, ...data } = await request.json();

    if (!action) {
      return NextResponse.json(
        { success: false, error: "Missing action parameter" },
        { status: 400 }
      );
    }

    switch (action) {
      case "create": {
        const { userId, commitmentData } = data;
        if (!userId || !commitmentData) {
          return NextResponse.json(
            { success: false, error: "Missing userId or commitmentData" },
            { status: 400 }
          );
        }

        const commitment = await createPreTradeCommitment(userId, commitmentData);
        return NextResponse.json({
          success: true,
          commitment
        });
      }

      case "lock": {
        const { commitmentId } = data;
        if (!commitmentId) {
          return NextResponse.json(
            { success: false, error: "Missing commitmentId" },
            { status: 400 }
          );
        }

        const commitment = await lockPreTradeCommitment(commitmentId);
        return NextResponse.json({
          success: true,
          commitment
        });
      }

      case "getUnlocked": {
        const { userId } = data;
        if (!userId) {
          return NextResponse.json(
            { success: false, error: "Missing userId" },
            { status: 400 }
          );
        }

        const commitments = await getUnlockedCommitments(userId);
        return NextResponse.json({
          success: true,
          commitments
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: "Invalid action" },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error("Commitments API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to process commitment request",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}