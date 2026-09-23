"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { BookOpen, Edit, Save, Plus, ChevronDown, Trash2, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPL } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"

interface Trade {
  id: string
  ticker: string
  realized_pl: string | null
  entry_price: string | null
  exit_price: string | null
  side: string
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

interface Journal {
  id: string
  name: string
  createdAt: string
}

const JOURNALS_KEY = 'baywater_journals'
const SELECTED_JOURNAL_KEY = 'baywater_selected_journal'

function loadJournals(): Journal[] {
  try {
    const s = localStorage.getItem(JOURNALS_KEY)
    return s ? JSON.parse(s) : []
  } catch { return [] }
}

function saveJournals(journals: Journal[]) {
  try { localStorage.setItem(JOURNALS_KEY, JSON.stringify(journals)) } catch {}
}

function getSelectedJournal(): string | null {
  try { return localStorage.getItem(SELECTED_JOURNAL_KEY) } catch { return null }
}

function setSelectedJournalInStorage(id: string | null) {
  try {
    if (id) localStorage.setItem(SELECTED_JOURNAL_KEY, id)
    else localStorage.removeItem(SELECTED_JOURNAL_KEY)
  } catch {}
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

  // Journal management
  const [journals, setJournals] = useState<Journal[]>([])
  const [selectedJournalId, setSelectedJournalIdState] = useState<string | null>(null)
  const [showJournalMenu, setShowJournalMenu] = useState(false)
  const [creatingJournal, setCreatingJournal] = useState(false)
  const [newJournalName, setNewJournalName] = useState("")

  useEffect(() => {
    const saved = loadJournals()
    setJournals(saved)
    const sel = getSelectedJournal()
    if (sel && saved.find((j: Journal) => j.id === sel)) {
      setSelectedJournalIdState(sel)
    } else if (saved.length > 0) {
      setSelectedJournalIdState(saved[0].id)
      setSelectedJournalInStorage(saved[0].id)
    }
    fetchJournalEntries()
  }, [])

  async function fetchJournalEntries() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*, trade:trades (*)')
        .order('created_at', { ascending: false })

      if (error) { console.error("Error fetching journal entries:", error); return }
      if (data) {
        setJournalEntries(data)
        if (data.length > 0 && !selectedEntry) {
          const first = data[0]
          setSelectedEntry(first)
          setEditContent(first.content || "")
          setEditTitle(first.title || "")
          setEditEmotionalState(first.emotional_state || "")
          setEditLessonsLearned(first.lessons_learned || "")
          setEditPlanForImprovement(first.plan_for_improvement || "")
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
    setEditContent(entry.content || "")
    setEditTitle(entry.title || "")
    setEditEmotionalState(entry.emotional_state || "")
    setEditLessonsLearned(entry.lessons_learned || "")
    setEditPlanForImprovement(entry.plan_for_improvement || "")
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

      if (error) { console.error("Error saving:", error); return }
      await fetchJournalEntries()
      setIsEditing(false)
    } catch (error) {
      console.error("Error saving:", error)
    } finally {
      setLoading(false)
    }
  }

  function handleCreateJournal() {
    if (!newJournalName.trim()) return
    const journal: Journal = {
      id: `journal_${Date.now()}`,
      name: newJournalName.trim(),
      createdAt: new Date().toISOString()
    }
    const updated = [...journals, journal]
    saveJournals(updated)
    setJournals(updated)
    setSelectedJournalIdState(journal.id)
    setSelectedJournalInStorage(journal.id)
    setNewJournalName("")
    setCreatingJournal(false)
    setShowJournalMenu(false)
  }

  function handleSelectJournal(id: string) {
    setSelectedJournalIdState(id)
    setSelectedJournalInStorage(id)
    setShowJournalMenu(false)
  }

  function handleDeleteJournal(id: string) {
    const updated = journals.filter(j => j.id !== id)
    saveJournals(updated)
    setJournals(updated)
    if (selectedJournalId === id) {
      const next = updated[0]?.id ?? null
      setSelectedJournalIdState(next)
      setSelectedJournalInStorage(next)
    }
  }

  const selectedJournal = journals.find(j => j.id === selectedJournalId)

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

        {/* Journal Selector */}
        <div className="flex items-center gap-3 relative">
          <div className="relative">
            <button
              onClick={() => setShowJournalMenu(!showJournalMenu)}
              className="flex items-center gap-2 px-4 py-2 border border-card-border rounded-lg bg-card-bg hover:bg-neutral-fill transition-colors"
            >
              <BookOpen className="w-4 h-4 text-text-muted" />
              <span className="text-sm font-medium text-text-primary">
                {selectedJournal?.name ?? "All Entries"}
              </span>
              <ChevronDown className="w-4 h-4 text-text-muted" />
            </button>

            {showJournalMenu && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-card-bg border border-card-border rounded-lg shadow-lg z-10 overflow-hidden">
                {journals.length === 0 ? (
                  <div className="p-4 text-sm text-text-muted text-center">No journals yet</div>
                ) : (
                  <div>
                    {journals.map(j => (
                      <div
                        key={j.id}
                        className={`flex items-center justify-between px-4 py-2 hover:bg-neutral-fill cursor-pointer ${selectedJournalId === j.id ? 'bg-accent-tint border-l-4 border-accent' : ''}`}
                      >
                        <span
                          className="flex-1 text-sm text-text-primary"
                          onClick={() => handleSelectJournal(j.id)}
                        >
                          {j.name}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteJournal(j.id) }}
                          className="ml-2 p-1 hover:text-loss-red transition-colors text-text-muted"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t border-card-border p-2">
                  {creatingJournal ? (
                    <div className="flex gap-2">
                      <Input
                        value={newJournalName}
                        onChange={e => setNewJournalName(e.target.value)}
                        placeholder="Journal name..."
                        className="flex-1 text-sm"
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateJournal() }}
                        autoFocus
                      />
                      <button onClick={handleCreateJournal} className="px-2 py-1 text-xs bg-accent text-white rounded">Create</button>
                      <button onClick={() => { setCreatingJournal(false); setNewJournalName("") }} className="px-2 py-1 text-xs border border-card-border rounded">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCreatingJournal(true)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-accent-green hover:bg-neutral-fill rounded transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>New Journal</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* No journals state */}
      {journals.length === 0 && (
        <div className="p-6 border border-dashed border-card-border rounded-lg text-center">
          <BookOpen className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <h3 className="font-medium text-text-primary mb-1">Create your first journal</h3>
          <p className="text-sm text-text-muted mb-4">Organize your trade notes into named journals.</p>
          <button
            onClick={() => setShowJournalMenu(true)}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 transition-colors"
          >
            Create Journal
          </button>
        </div>
      )}

      {/* Entries + Editor layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Entries List */}
        <div className="lg:col-span-1">
          <Card className="h-[calc(100vh-200px)] overflow-hidden">
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">
                {selectedJournal ? selectedJournal.name : "Entries"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-y-auto h-[calc(100%-60px)]">
                {journalEntries.length > 0 ? (
                  <div className="space-y-0">
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
                            <div className="text-sm font-medium text-text-primary truncate">{entry.title || "Untitled Entry"}</div>
                            <div className="text-xs text-text-muted shrink-0 ml-2">
                              {new Date(entry.date || entry.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          {trade && (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-medium text-text-primary">{trade.ticker}</span>
                              <span className={`font-bold ${isProfitable ? 'text-profit-green' : 'text-loss-red'}`}>
                                {formatPL(trade.realized_pl)}
                              </span>
                            </div>
                          )}
                          <div className="text-xs text-text-muted mt-1 line-clamp-1">
                            {entry.content || "No notes"}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <BookOpen className="w-10 h-10 text-text-muted mx-auto mb-2" />
                    <p className="text-text-muted text-sm">No entries yet</p>
                    <p className="text-xs text-text-muted mt-1">Journal entries are created when you analyze trades</p>
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
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {isEditing ? (
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="text-lg font-semibold border-none focus:ring-0 p-0 flex-1"
                    />
                  ) : (
                    <div className="text-lg font-semibold text-text-primary truncate">{editTitle || "Untitled Entry"}</div>
                  )}
                  {selectedEntry.trade && (
                    <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${selectedEntry.trade.side === 'SHORT' ? 'bg-loss-tint text-loss-red' : 'bg-profit-tint text-profit-green'}`}>
                      {selectedEntry.trade.side} {selectedEntry.trade.ticker}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isEditing ? (
                    <>
                      <Button onClick={handleSaveClick} size="sm" className="gap-1">
                        <Save className="w-4 h-4" />
                        Save
                      </Button>
                      <Button onClick={() => setIsEditing(false)} size="sm" variant="outline">
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => setIsEditing(true)} size="sm" className="gap-1">
                      <Edit className="w-4 h-4" />
                      Edit
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-y-auto h-[calc(100%-80px)] p-4 space-y-6">
                  {/* Trade Info */}
                  {selectedEntry.trade && (
                    <div className="p-4 bg-neutral-fill rounded-lg">
                      <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">Associated Trade</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <div className="text-xs text-text-muted">Ticker</div>
                          <div className="text-lg font-bold text-text-primary">{selectedEntry.trade.ticker}</div>
                        </div>
                        <div>
                          <div className="text-xs text-text-muted">P&amp;L</div>
                          <div className={`text-lg font-bold ${selectedEntry.trade.realized_pl && parseFloat(selectedEntry.trade.realized_pl) > 0 ? 'text-profit-green' : 'text-loss-red'}`}>
                            {formatPL(selectedEntry.trade.realized_pl)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-text-muted">Entry</div>
                          <div className="text-lg font-bold text-text-primary">
                            {selectedEntry.trade.entry_price ? `$${parseFloat(selectedEntry.trade.entry_price).toFixed(2)}` : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-text-muted">Exit</div>
                          <div className="text-lg font-bold text-text-primary">
                            {selectedEntry.trade.exit_price ? `$${parseFloat(selectedEntry.trade.exit_price).toFixed(2)}` : "—"}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Emotional State */}
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-2">Emotional State</h3>
                    {isEditing ? (
                      <Input value={editEmotionalState} onChange={e => setEditEmotionalState(e.target.value)} placeholder="How did you feel during this trade?" />
                    ) : (
                      <p className="text-sm text-text-primary">{editEmotionalState || <span className="text-text-muted">Not recorded</span>}</p>
                    )}
                  </div>

                  {/* Trade Notes */}
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-2">Trade Notes</h3>
                    {isEditing ? (
                      <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="min-h-[160px] w-full" placeholder="Describe your trade..." />
                    ) : (
                      <p className="text-sm text-text-primary whitespace-pre-wrap">{editContent || <span className="text-text-muted">No notes</span>}</p>
                    )}
                  </div>

                  {/* Lessons Learned */}
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-2">Lessons Learned</h3>
                    {isEditing ? (
                      <Textarea value={editLessonsLearned} onChange={e => setEditLessonsLearned(e.target.value)} className="min-h-[80px] w-full" placeholder="What did you learn?" />
                    ) : (
                      <p className="text-sm text-text-primary">{editLessonsLearned || <span className="text-text-muted">None recorded</span>}</p>
                    )}
                  </div>

                  {/* Plan for Improvement */}
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-2">Plan for Improvement</h3>
                    {isEditing ? (
                      <Textarea value={editPlanForImprovement} onChange={e => setEditPlanForImprovement(e.target.value)} className="min-h-[80px] w-full" placeholder="What will you do differently?" />
                    ) : (
                      <p className="text-sm text-text-primary">{editPlanForImprovement || <span className="text-text-muted">None recorded</span>}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-[calc(100vh-200px)] flex items-center justify-center">
              <div className="text-center text-text-muted">
                <BookOpen className="w-12 h-12 mx-auto mb-4" />
                <h3 className="font-medium mb-2">No Entry Selected</h3>
                <p className="text-sm">Select an entry from the left panel</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
