"use client";

import { useMemo } from "react";

interface ReplayEvent {
  timestamp: string;
  title: string;
  description: string;
}

interface ReplayTimelineProps {
  events: ReplayEvent[];
  currentEventIndex: number;
  onEventClick: (index: number) => void;
}

export function ReplayTimeline({ events, currentEventIndex, onEventClick }: ReplayTimelineProps) {
  // Format events with time information
  const formattedEvents = useMemo(() => {
    return events.map(event => {
      const time = new Date(event.timestamp);
      return {
        ...event,
        formattedTime: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
    });
  }, [events]);

  if (formattedEvents.length === 0) {
    return (
      <div className="text-center text-white/60 py-8">
        <p className="text-sm">No replay events available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {formattedEvents.map((event, index) => (
        <div
          key={index}
          className={`relative pl-8 border-l-2 ${
            index === currentEventIndex
              ? 'border-emerald-500 bg-emerald-500/10'
              : 'border-white/20 hover:border-white/40'
          } cursor-pointer transition-colors`}
          onClick={() => onEventClick(index)}
        >
          {/* Time marker */}
          <div className="absolute -left-4 w-8 h-8 rounded-full flex items-center justify-center">
            <span className={`text-xs font-mono ${
              index === currentEventIndex ? 'text-emerald-400' : 'text-white/60'
            }`}>
              {event.formattedTime}
            </span>
          </div>

          {/* Event content */}
          <div className="py-3 pr-4">
            <h4 className={`font-semibold ${
              index === currentEventIndex ? 'text-emerald-400' : 'text-white'
            }`}>
              {event.title}
            </h4>
            <p className={`text-sm mt-1 ${
              index === currentEventIndex ? 'text-white' : 'text-white/80'
            }`}>
              {event.description}
            </p>

            {/* Current event indicator */}
            {index === currentEventIndex && (
              <div className="absolute -right-4 top-1/2 transform -translate-y-1/2 w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}