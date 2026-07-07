/**
 * Trade Pattern Analysis API
 *
 * Server-side API endpoint for generating AI pattern analysis
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { generateTradePatternAnalysis } from '@/lib/commitment-utils';

/**
 * Generate pattern analysis for a trade
 * @param request Request object
 * @returns Pattern analysis results
 */
export async function POST(request: Request) {
  try {
    const { trade_id, commitment_id } = await request.json();

    if (!trade_id) {
      return NextResponse.json(
        { error: 'Trade ID is required' },
        { status: 400 }
      );
    }

    if (!commitment_id) {
      return NextResponse.json(
        { error: 'Commitment ID is required' },
        { status: 400 }
      );
    }

    // Generate the pattern analysis
    const analysis = await generateTradePatternAnalysis(trade_id, commitment_id);

    return NextResponse.json({
      success: true,
      analysis
    });

  } catch (error) {
    console.error('Pattern analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to generate pattern analysis' },
      { status: 500 }
    );
  }
}

/**
 * Get pattern analysis for a trade
 * @param request Request object
 * @returns Pattern analysis data
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const trade_id = searchParams.get('trade_id');

    if (!trade_id) {
      return NextResponse.json(
        { error: 'Trade ID is required' },
        { status: 400 }
      );
    }

    // Fetch the pattern analysis from Supabase
    const { data: analysis, error } = await supabase
      .from('trade_pattern_analysis')
      .select('*')
      .eq('trade_id', trade_id)
      .single();

    if (error) {
      console.error('Error fetching pattern analysis:', error);
      return NextResponse.json(
        { error: 'Pattern analysis not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      analysis
    });

  } catch (error) {
    console.error('Get pattern analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pattern analysis' },
      { status: 500 }
    );
  }
}