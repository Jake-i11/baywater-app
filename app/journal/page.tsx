"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { BookOpen, Edit, Save, Calendar, Tag, TrendingUp, TrendingDown, Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPL, formatNumber } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"

interface Trade {
  id: string
  ticker: string
  realized_pl: string | null
  entry_price: string | null
  exit_price: string | null
  entry_time: string | null
  exit_time: string | null
  side: string
  size: string
  discipline_score: number | null
  violations: string[]
  behaviorTags: string[]
  created_at: string
}

interface JournalEntry {
  id: string
  trade_id: string
  date: string
  title: string
  content: string
  emotional_state: string
  lessons_learned: string
  plan_for_improvement: string
  created_at: string
  trade: Trade
}

export default function JournalPage() {
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState("")
  const [editTitle, setEditTitle] = useState("")
  const [editEmotionalState, setEditEmotionalState] = useState("")
  const [editLessonsLearned, setEditLessonsLearned] = useState("")
  const [editPlanForImprovement, setEditPlanForImprovement] = useState("")

  useEffect(() => {
    fetchJournalEntries()
  }, [])

  async function fetchJournalEntries() {
    try {
      setLoading(true)

      // Fetch journal entries with associated trades
      const { data: entriesData, error: entriesError } = await supabase
        .from('journal_entries')
        .select(`
          *,
          trade:trades (*)
        `)
        .order('created_at', { ascending: false })

      if (entriesError) {
        console.error("Error fetching journal entries:", entriesError)
        return
      }

      if (entriesData) {
        setJournalEntries(entriesData)

        // Select the first entry by default if there are entries
        if (entriesData.length > 0) {
          setSelectedEntry(entriesData[0])
          setEditContent(entriesData[0].content)
          setEditTitle(entriesData[0].title)
          setEditEmotionalState(entriesData[0].emotional_state)
          setEditLessonsLearned(entriesData[0].lessons_learned)
          setEditPlanForImprovement(entriesData[0].plan_for_improvement)
        }
      }
    } catch (error) {
      console.error("Error fetching journal entries:", error)
    } finally {
      setLoading(false)
    }
  }

  function handleEntrySelect(entry: JournalEntry) {
    setSelectedEntry(entry)
    setIsEditing(false)
    setEditContent(entry.content)
    setEditTitle(entry.title)
    setEditEmotionalState(entry.emotional_state)
    setEditLessonsLearned(entry.lessons_learned)
    setEditPlanForImprovement(entry.plan_for_improvement)
  }

  function handleEditClick() {
    setIsEditing(true)
  }

  async function handleSaveClick() {
    if (!selectedEntry) return

    try {
      setLoading(true)

      const { error } = await supabase
        .from('journal_entries')
        .update({
          content: editContent,
          title: editTitle,
          emotional_state: editEmotionalState,
          lessons_learned: editLessonsLearned,
          plan_for_improvement: editPlanForImprovement
        })
        .eq('id', selectedEntry.id)

      if (error) {
        console.error("Error saving journal entry:", error)
        return
      }

      // Refresh the entries
      await fetchJournalEntries()
      setIsEditing(false)
    } catch (error) {
      console.error("Error saving journal entry:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-text-muted">Loading journal...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Trading Journal</h1>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          <span>New Entry</span>
        </Button>
      </div>

      {/* Journal Entries List and Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Entries List */}
        <div className="lg:col-span-1">
          <Card className="h-[calc(100vh-200px)] overflow-hidden">
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Journal Entries</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-y-auto h-[calc(100%-60px)]">
                {journalEntries.length > 0 ? (
                  <div className="space-y-2">
                    {journalEntries.map((entry) => {
                      const isSelected = selectedEntry?.id === entry.id
                      const trade = entry.trade
                      const isProfitable = trade?.realized_pl && parseFloat(trade.realized_pl) > 0

                      return (
                        <button
                          key={entry.id}
                          onClick={() => handleEntrySelect(entry)}
                          className={`w-full text-left p-3 border-b border-card-border hover:bg-neutral-fill transition-colors ${isSelected ? 'bg-accent-tint border-l-4 border-accent' : ''}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-sm font-medium text-text-primary">{entry.title || "Untitled Entry"}</div>
                            <div className="text-xs text-text-muted">
                              {new Date(entry.date).toLocaleDateString()}
                            </div>
                          </div>

                          {trade && (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-medium text-text-primary">{trade.ticker}</span>
                              <span className={`font-bold ${isProfitable ? 'text-profit-green' : 'text-loss-red'}`}>
                                {formatPL(trade.realized_pl)}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-[10px] font-medium ${trade.side === 'SHORT' ? 'bg-loss-tint text-loss-red' : 'bg-profit-tint text-profit-green'}`}>
                                {trade.side}
                              </span>
                            </div>
                          )}

                          <div className="text-xs text-text-muted mt-1 line-clamp-2">
                            {entry.content || "No content"}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 bg-neutral-fill rounded-full flex items-center justify-center mx-auto mb-2">
                      <BookOpen className="w-6 h-6 text-text-muted" />
                    </div>
                    <p className="text-text-muted">No journal entries found</p>
                    <p className="text-xs text-text-muted mt-1">Start documenting your trades to build your trading journal</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Entry Editor */}
        <div className="lg:col-span-2">
          {selectedEntry ? (
            <Card className="h-[calc(100vh-200px)] overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-lg font-semibold text-text-primary">
                    {isEditing ? (
                        <Input
                          value={editTitle}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditTitle(e.target.value)}
                          className="text-lg font-semibold p-0 border-none focus:ring-0"
                        />
                    ) : (
                      editTitle || "Untitled Entry"
                    )}
                  </CardTitle>
                  {selectedEntry.trade && (
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${selectedEntry.trade.side === 'SHORT' ? 'bg-loss-tint text-loss-red' : 'bg-profit-tint text-profit-green'}`}>
                      {selectedEntry.trade.side} {selectedEntry.trade.ticker}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Button onClick={handleSaveClick} className="gap-1">
                      <Save className="w-4 h-4" />
                      <span>Save</span>
                    </Button>
                  ) : (
                    <Button onClick={handleEditClick} className="gap-1">
                      <Edit className="w-4 h-4" />
                      <span>Edit</span>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-y-auto h-[calc(100%-120px)] p-4">
                  {/* Trade Information */}
                  {selectedEntry.trade && (
                    <div className="mb-6 p-4 bg-neutral-fill rounded-lg">
                      <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted mb-3">Associated Trade</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <div className="text-xs text-text-muted">Ticker</div>
                          <div className="text-lg font-bold text-text-primary">{selectedEntry.trade.ticker}</div>
                        </div>
                        <div>
                          <div className="text-xs text-text-muted">P&L</div>
                          <div className={`text-lg font-bold ${selectedEntry.trade.realized_pl && parseFloat(selectedEntry.trade.realized_pl) > 0 ? 'text-profit-green' : 'text-loss-red'}`}>
                            {formatPL(selectedEntry.trade.realized_pl)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-text-muted">Entry</div>
                          <div className="text-lg font-bold text-text-primary">
                            ${selectedEntry.trade.entry_price ? parseFloat(selectedEntry.trade.entry_price).toFixed(2) : '\u2014'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-text-muted">Exit</div>
                          <div className="text-lg font-bold text-text-primary">
                            ${selectedEntry.trade.exit_price ? parseFloat(selectedEntry.trade.exit_price).toFixed(2) : '\u2014'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Emotional State */}
                  <div className="mb-6">
                    <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted mb-2">Emotional State</h3>
                    {isEditing ? (
                      <Input
                        value={editEmotionalState}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditEmotionalState(e.target.value)}
                        placeholder="How did you feel during this trade?"
                      />
                    ) : (
                      <div className="p-3 bg-neutral-fill rounded-lg">
                        <p>{editEmotionalState || "No emotional state recorded"}</p>
                      </div>
                    )}
                  </div>

                  {/* Main Content */}
                  <div className="mb-6">
                    <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted mb-2">Trade Notes</h3>
                    {isEditing ? (
                      <Textarea
                        value={editContent}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditContent(e.target.value)}
                        className="min-h-[200px] w-full"
                        placeholder="Describe your trade, what you learned, and how you can improve..."
                      />
                    ) : (
                      <div className="p-3 bg-neutral-fill rounded-lg min-h-[200px] prose max-w-none">
                        <p>{editContent || "No content recorded for this trade."}</p>
                      </div>
                    )}
                  </div>

                  {/* Lessons Learned */}
                  <div className="mb-6">
                    <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted mb-2">Lessons Learned</h3>
                    {isEditing ? (
                      <Textarea
                        value={editLessonsLearned}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditLessonsLearned(e.target.value)}
                        className="min-h-[100px] w-full"
                        placeholder="What did you learn from this trade?"
                      />
                    ) : (
                      <div className="p-3 bg-neutral-fill rounded-lg">
                        <p>{editLessonsLearned || "No lessons learned recorded"}</p>
                      </div>
                    )}
                  </div>

                  {/* Plan for Improvement */}
                  <div className="mb-6">
                    <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted mb-2">Plan for Improvement</h3>
                    {isEditing ? (
                      <Textarea
                        value={editPlanForImprovement}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditPlanForImprovement(e.target.value)}
                        className="min-h-[100px] w-full"
                        placeholder="What will you do differently next time?"
                      />
                    ) : (
                      <div className="p-3 bg-neutral-fill rounded-lg">
                        <p>{editPlanForImprovement || "No improvement plan recorded"}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-[calc(100vh-200px)]">
              <CardContent className="flex items-center justify-center h-full">
                <div className="text-center text-text-muted">
                  <div className="w-16 h-16 bg-neutral-fill rounded-full flex items-center justify-center mx-auto mb-4">
                    <BookOpen className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">No Entry Selected</h3>
                  <p className="text-sm">Select a journal entry from the left panel or create a new one</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}