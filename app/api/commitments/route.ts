/**
 * Pre-Trade Commitments API
 *
 * Server-side API endpoint for managing pre-trade commitments
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createPreTradeCommitment, lockPreTradeCommitment, getPreTradeCommitment } from '@/lib/commitment-utils';

/**
 * Create a new pre-trade commitment
 * @param request Request object
 * @returns Created commitment
 */
export async function POST(request: Request) {
  try {
    const { user_id, commitment_data } = await request.json();

    if (!user_id) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    if (!commitment_data) {
      return NextResponse.json(
        { error: 'Commitment data is required' },
        { status: 400 }
      );
    }

    // Validate required fields
    const requiredFields = [
      'thesis', 'setup_type', 'expected_outcome',
      'invalidation_reason', 'confidence_score', 'selected_rules'
    ];

    for (const field of requiredFields) {
      if (!commitment_data[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Create the commitment
    const commitment = await createPreTradeCommitment(user_id, commitment_data);

    return NextResponse.json({
      success: true,
      commitment
    });

  } catch (error) {
    console.error('Create commitment error:', error);
    return NextResponse.json(
      { error: 'Failed to create pre-trade commitment' },
      { status: 500 }
    );
  }
}

/**
 * Get pre-trade commitment by ID or user's unlocked commitments
 * @param request Request object
 * @returns Pre-trade commitment data or array of commitments
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const commitment_id = searchParams.get('commitment_id');
    const user_id = searchParams.get('user_id');

    if (commitment_id) {
      // Get specific commitment by ID
      const commitment = await getPreTradeCommitment(parseInt(commitment_id));
      return NextResponse.json({
        success: true,
        commitment
      });
    } else if (user_id) {
      // Get user's unlocked commitments
      const { getUnlockedCommitments } = await import('@/lib/commitment-utils');
      const commitments = await getUnlockedCommitments(user_id);
      return NextResponse.json({
        success: true,
        commitments
      });
    } else {
      return NextResponse.json(
        { error: 'Either commitment_id or user_id is required' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Get commitment error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch commitment data' },
      { status: 500 }
    );
  }
}

/**
 * Lock a pre-trade commitment
 * @param request Request object
 * @returns Updated commitment
 */
export async function PUT(request: Request) {
  try {
    const { commitment_id } = await request.json();

    if (!commitment_id) {
      return NextResponse.json(
        { error: 'Commitment ID is required' },
        { status: 400 }
      );
    }

    const commitment = await lockPreTradeCommitment(parseInt(commitment_id));

    return NextResponse.json({
      success: true,
      commitment
    });

  } catch (error) {
    console.error('Lock commitment error:', error);
    return NextResponse.json(
      { error: 'Failed to lock pre-trade commitment' },
      { status: 500 }
    );
  }
}
