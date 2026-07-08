/**
 * Centralized AI Model Configuration
 *
 * This file defines the AI models used throughout the application.
 * All AI calls should import from this file instead of hardcoding model names.
 */

export const AI_MODELS = {
  /**
   * Default model for text-based AI tasks:
   * - Trade analysis
   * - CSV parsing
   * - Rule violation detection
   * - Summaries
   * - AI coach responses
   * - Reasoning tasks
   */
  default: "openrouter/free",

  /**
   * Model for image/screenshot parsing and vision tasks
   * Using the same free model for testing vision routing
   */
  vision: "openrouter/free",
};