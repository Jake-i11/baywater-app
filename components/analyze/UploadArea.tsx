"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { UploadCloud } from "lucide-react"

interface UploadAreaProps {
  file: File | null
  setFile: (file: File | null) => void
  loading: boolean
  analysisPhase: string | null
  analysisResult: {
    success: boolean
    message: string
    tradeCount?: number
  } | null
  showFailureMessage: string | null
  handleUpload: (uploadedFile?: File | null) => Promise<void>
}

export default function UploadArea({
  file,
  setFile,
  loading,
  analysisPhase,
  analysisResult,
  showFailureMessage,
  handleUpload
}: UploadAreaProps) {
  return (
    <Card className="border-2 border-dashed border-card-border">
      <div className="p-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-accent-tint rounded-full flex items-center justify-center">
            <UploadCloud className="w-6 h-6 text-accent" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary">Upload Trade Data</h3>
          <p className="text-text-muted text-sm">Drop CSV file or trade screenshot to analyze</p>

          <div className="flex gap-4 mt-4">
            <Input
              type="file"
              accept="image/*,.csv"
              onChange={async (e) => {
                console.log("[UPLOAD] file selected", e.target.files)
                const selectedFile = e.target.files?.[0] || null
                setFile(selectedFile)

                // Auto-trigger upload for CSV files (restore pre-redesign behavior)
                if (selectedFile && selectedFile.name.endsWith('.csv')) {
                  console.log("[UPLOAD] Auto-triggering CSV upload")
                  await handleUpload(selectedFile)
                }
              }}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="px-4 py-2 bg-card-bg border border-card-border rounded-lg cursor-pointer hover:bg-neutral-fill transition-colors"
            >
              Choose File
            </label>
            <Button
              onClick={() => handleUpload()}
              disabled={loading || !file}
              className="bg-accent hover:bg-accent/90 text-white"
            >
              {loading ? "Analyzing..." : "Analyze Trades"}
            </Button>
          </div>

          {analysisPhase && (
            <div className="mt-2 text-sm text-text-muted">
              {analysisPhase}
            </div>
          )}
          {analysisResult && (
            <div className="mt-2 p-3 bg-profit-tint border border-profit-green rounded-lg text-profit-green text-sm">
              {analysisResult.message}
            </div>
          )}
          {showFailureMessage && (
            <div className="mt-2 p-3 bg-loss-tint border border-loss-red rounded-lg text-loss-red text-sm">
              {showFailureMessage}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}