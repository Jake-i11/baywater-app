"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AIReplayProps {
  replayText: string;
  entryTime: string;
  exitTime: string;
}

export function AIReplay({ replayText, entryTime, exitTime }: AIReplayProps) {
  // Parse replay text into timeline sections
  const timelineItems = useMemo(() => {
    if (!replayText) return [];

    // Split by time patterns or newlines
    const timePattern = /(\d{1,2}:\d{2}\s*(AM|PM)?)/i;
    const sections = replayText.split(/\n+/).filter(section => section.trim() !== '');

    return sections.map((section, index) => {
      const timeMatch = section.match(timePattern);
      const time = timeMatch ? timeMatch[0] : null;
      const content = time ? section.replace(time, '').trim() : section.trim();

      return {
        id: index,
        time,
        content,
        type: getSectionType(section, index, sections.length)
      };
    });
  }, [replayText]);

  return (
    <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="text-white">AI Trade Replay</CardTitle>
        <p className="text-xs text-white/50 mt-1">
          Chronological analysis of your trade execution
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {timelineItems.length === 0 ? (
          <div className="text-center text-white/60 py-4">
            <p className="text-sm">AI replay unavailable for this section</p>
          </div>
        ) : (
          <div className="space-y-3">
            {timelineItems.map((item) => (
              <div key={item.id} className="relative pl-6 border-l border-white/10">
                {/* Time marker */}
                {item.time && (
                  <div className="absolute -left-3.5 w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <span className="text-xs font-mono text-emerald-400">{item.time}</span>
                  </div>
                )}

                {/* Content */}
                <div className={`py-2 ${getContentStyles(item.type)}`}>
                  <p className="text-sm text-white/90">{item.content}</p>

                  {/* Type badge */}
                  {item.type && (
                    <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${getBadgeStyles(item.type)}`}>
                      {item.type}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getSectionType(section: string, index: number, totalSections: number): string | null {
  // Simple heuristic to determine section type
  const lowerSection = section.toLowerCase();

  if (index === 0) return "Market Open";
  if (index === totalSections - 1) return "Lesson";

  if (lowerSection.includes("entry") || lowerSection.includes("enter")) return "Entry";
  if (lowerSection.includes("exit") || lowerSection.includes("cover") || lowerSection.includes("close")) return "Exit";

  if (lowerSection.includes("volume") || lowerSection.includes("spike") || lowerSection.includes("momentum")) return "Market Action";
  if (lowerSection.includes("violation") || lowerSection.includes("rule") || lowerSection.includes("mistake")) return "Violation";

  return "Execution";
}

function getContentStyles(type: string | null): string {
  switch (type) {
    case "Entry": return "border-l-2 border-emerald-500 pl-4";
    case "Exit": return "border-l-2 border-red-500 pl-4";
    case "Violation": return "border-l-2 border-amber-500 pl-4";
    case "Lesson": return "border-l-2 border-blue-500 pl-4 bg-blue-500/10";
    case "Market Open": return "border-l-2 border-white/30 pl-4";
    default: return "border-l-2 border-white/20 pl-4";
  }
}

function getBadgeStyles(type: string | null): string {
  switch (type) {
    case "Entry": return "bg-emerald-500/20 text-emerald-400";
    case "Exit": return "bg-red-500/20 text-red-400";
    case "Violation": return "bg-amber-500/20 text-amber-400";
    case "Lesson": return "bg-blue-500/20 text-blue-400";
    case "Market Open": return "bg-white/10 text-white/70";
    case "Market Action": return "bg-purple-500/20 text-purple-400";
    case "Execution": return "bg-white/10 text-white/70";
    default: return "bg-white/10 text-white/70";
  }
}