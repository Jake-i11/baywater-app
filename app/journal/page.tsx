"use client"

import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { BookOpen, Edit, Save, Plus, ChevronDown, Trash2, X, Check, ShieldCheck, ShieldX, MinusCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPL } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { loadUserRules } from "@/lib/rules"
import type { UserRule } from "@/lib/rules"

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
  trade_id: string | null
  journal_id: string | null
  date: string
  title: string
  content: string | null
  emotional_state: string | null
  lessons_learned: string | null
  plan_for_improvement: string | null
  created_at: string
  trade: Trade | null
}

interface Journal {
  id: string
  name: string
  created_at: string
}

type RuleStatus = 'followed' | 'violated' | 'not_applicable'

interface EntryRule {
  rule_id: string
  status: RuleStatus
  notes: string
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function JournalPage() {
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState("")
  const [editTitle, setEditTitle] = useState("")
  const [editEmotionalState, setEditEmotionalState] = useState("")
  const [editLessonsLearned, setEditLessonsLearned] = useState("")
  const [editPlanForImprovement, setEditPlanForImprovement] = useState("")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Journals
  const [journals, setJournals] = useState<Journal[]>([])
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(null)
  const [showJournalMenu, setShowJournalMenu] = useState(false)
  const [creatingJournal, setCreatingJournal] = useState(false)
  const [newJournalName, setNewJournalName] = useState("")
  const [journalSaving, setJournalSaving] = useState(false)

  // Create entry
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createTitle, setCreateTitle] = useState("")
  const [createDate, setCreateDate] = useState(today())
  const [createContent, setCreateContent] = useState("")
  const [createEmotional, setCreateEmotional] = useState("")
  const [createLessons, setCreateLessons] = useState("")
  const [createPlan, setCreatePlan] = useState("")
  const [createTradeId, setCreateTradeId] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [availableTrades, setAvailableTrades] = useState<Trade[]>([])
  const [createRules, setCreateRules] = useState<EntryRule[]>([])

  // Rule tracking for selected entry
  const [userRules, setUserRules] = useState<UserRule[]>([])
  const [entryRules, setEntryRules] = useState<EntryRule[]>([])
  const [rulesSaving, setRulesSaving] = useState(false)

  const fetchJournals = useCallback(async () => {
    const { data, error } = await supabase
      .from('journals')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      console.error("Error fetching journals:", { message: error.message, code: error.code })
      return
    }
    setJournals(data ?? [])
  }, [])

  const fetchJournalEntries = useCallback(async () => {
    try {
      setLoading(true)
      setFetchError(null)

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        setFetchError("Not authenticated")
        return
      }

      const query = supabase
        .from('journal_entries')
        .select('*, trade:trades(id, ticker, realized_pl, entry_price, exit_price, side, created_at)')
        .order('created_at', { ascending: false })

      if (selectedJournalId) {
        query.eq('journal_id', selectedJournalId)
      }

      const { data, error } = await query

      if (error) {
        console.error("Error fetching journal entries:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        })
        setFetchError(`Failed to load entries: ${error.message}`)
        return
      }

      setJournalEntries(data ?? [])

      if (data && data.length > 0 && !selectedEntry) {
        const first = data[0]
        setSelectedEntry(first)
        populateEditor(first)
      }
    } catch (err) {
      console.error("Unexpected error fetching journal entries:", err)
      setFetchError("Unexpected error loading entries")
    } finally {
      setLoading(false)
    }
  }, [selectedJournalId]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchEntryRules = useCallback(async (entryId: string) => {
    const { data, error } = await supabase
      .from('journal_entry_rules')
      .select('rule_id, status, notes')
      .eq('journal_entry_id', entryId)

    if (error) {
      console.error("Error fetching entry rules:", { message: error.message })
      return
    }

    setEntryRules((data ?? []).map(r => ({
      rule_id: r.rule_id,
      status: r.status as RuleStatus,
      notes: r.notes ?? ''
    })))
  }, [])

  const fetchTrades = useCallback(async () => {
    const { data } = await supabase
      .from('trades')
      .select('id, ticker, realized_pl, entry_price, exit_price, side, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
    setAvailableTrades(data ?? [])
  }, [])

  useEffect(() => {
    Promise.all([
      fetchJournals(),
      fetchJournalEntries(),
      fetchTrades(),
      loadUserRules().then(setUserRules),
    ])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchJournalEntries()
  }, [selectedJournalId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedEntry) {
      fetchEntryRules(selectedEntry.id)
    }
  }, [selectedEntry, fetchEntryRules])

  // Seed createRules from userRules whenever the form opens
  useEffect(() => {
    if (showCreateForm) {
      setCreateRules(userRules.filter(r => r.enabled).map(r => ({
        rule_id: r.id,
        status: 'not_applicable' as RuleStatus,
        notes: ''
      })))
    }
  }, [showCreateForm, userRules])

  function populateEditor(entry: JournalEntry) {
    setEditTitle(entry.title || "")
    setEditContent(entry.content || "")
    setEditEmotionalState(entry.emotional_state || "")
    setEditLessonsLearned(entry.lessons_learned || "")
    setEditPlanForImprovement(entry.plan_for_improvement || "")
  }

  function handleEntrySelect(entry: JournalEntry) {
    setSelectedEntry(entry)
    setIsEditing(false)
    setSaveError(null)
    populateEditor(entry)
  }

  async function handleSaveClick() {
    if (!selectedEntry) return
    setSaving(true)
    setSaveError(null)
    const { error } = await supabase
      .from('journal_entries')
      .update({
        content: editContent,
        title: editTitle,
        emotional_state: editEmotionalState,
        lessons_learned: editLessonsLearned,
        plan_for_improvement: editPlanForImprovement,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedEntry.id)

    setSaving(false)
    if (error) {
      console.error("Error saving entry:", { message: error.message, code: error.code })
      setSaveError(`Failed to save: ${error.message}`)
      return
    }

    // Update local state immediately
    const updated: JournalEntry = {
      ...selectedEntry,
      title: editTitle,
      content: editContent,
      emotional_state: editEmotionalState,
      lessons_learned: editLessonsLearned,
      plan_for_improvement: editPlanForImprovement,
    }
    setJournalEntries(prev => prev.map(e => e.id === selectedEntry.id ? updated : e))
    setSelectedEntry(updated)
    setIsEditing(false)
  }

  async function handleSaveEntryRules() {
    if (!selectedEntry) return
    setRulesSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setRulesSaving(false); return }

    const upserts = entryRules.map(r => ({
      user_id: user.id,
      journal_entry_id: selectedEntry.id,
      rule_id: r.rule_id,
      status: r.status,
      notes: r.notes,
      updated_at: new Date().toISOString(),
    }))

    if (upserts.length > 0) {
      const { error } = await supabase
        .from('journal_entry_rules')
        .upsert(upserts, { onConflict: 'journal_entry_id,rule_id' })

      if (error) {
        console.error("Error saving rule tracking:", { message: error.message })
      }
    }
    setRulesSaving(false)
  }

  function setEntryRuleStatus(ruleId: string, status: RuleStatus) {
    setEntryRules(prev =>
      prev.some(r => r.rule_id === ruleId)
        ? prev.map(r => r.rule_id === ruleId ? { ...r, status } : r)
        : [...prev, { rule_id: ruleId, status, notes: '' }]
    )
  }

  function getEntryRuleStatus(ruleId: string): RuleStatus {
    return entryRules.find(r => r.rule_id === ruleId)?.status ?? 'not_applicable'
  }

  function setCreateRuleStatus(ruleId: string, status: RuleStatus) {
    setCreateRules(prev => prev.map(r => r.rule_id === ruleId ? { ...r, status } : r))
  }

  async function handleCreateEntry() {
    if (!createTitle.trim()) {
      setCreateError("Title is required")
      return
    }
    setCreateError(null)
    setCreating(true)

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      setCreateError("Not authenticated. Please sign in again.")
      setCreating(false)
      return
    }

    const { data: newEntry, error: insertError } = await supabase
      .from('journal_entries')
      .insert({
        user_id: user.id,
        title: createTitle.trim(),
        date: createDate || today(),
        content: createContent || null,
        emotional_state: createEmotional || null,
        lessons_learned: createLessons || null,
        plan_for_improvement: createPlan || null,
        trade_id: createTradeId || null,
        journal_id: selectedJournalId || null,
      })
      .select('*, trade:trades(id, ticker, realized_pl, entry_price, exit_price, side, created_at)')
      .single()

    if (insertError) {
      console.error("Error creating entry:", {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
      })
      setCreateError(`Failed to create entry: ${insertError.message}`)
      setCreating(false)
      return
    }

    // Save rule tracking if any rules are set
    const rulesWithStatus = createRules.filter(r => r.status !== 'not_applicable')
    if (rulesWithStatus.length > 0) {
      const ruleRows = rulesWithStatus.map(r => ({
        user_id: user.id,
        journal_entry_id: newEntry.id,
        rule_id: r.rule_id,
        status: r.status,
        notes: r.notes,
      }))
      await supabase.from('journal_entry_rules').insert(ruleRows)
    }

    // Prepend new entry and select it
    setJournalEntries(prev => [newEntry, ...prev])
    setSelectedEntry(newEntry)
    populateEditor(newEntry)
    setIsEditing(false)

    // Reset form
    setCreateTitle("")
    setCreateDate(today())
    setCreateContent("")
    setCreateEmotional("")
    setCreateLessons("")
    setCreatePlan("")
    setCreateTradeId("")
    setShowCreateForm(false)
    setCreating(false)

    // Load rule tracking for the new entry
    fetchEntryRules(newEntry.id)
  }

  async function handleDeleteEntry(id: string) {
    const { error } = await supabase.from('journal_entries').delete().eq('id', id)
    if (error) {
      console.error("Error deleting entry:", { message: error.message })
      return
    }
    setJournalEntries(prev => prev.filter(e => e.id !== id))
    if (selectedEntry?.id === id) {
      const remaining = journalEntries.filter(e => e.id !== id)
      if (remaining.length > 0) {
        setSelectedEntry(remaining[0])
        populateEditor(remaining[0])
      } else {
        setSelectedEntry(null)
      }
    }
  }

  async function handleCreateJournal() {
    if (!newJournalName.trim()) return
    setJournalSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setJournalSaving(false); return }

    const { data, error } = await supabase
      .from('journals')
      .insert({ user_id: user.id, name: newJournalName.trim() })
      .select()
      .single()

    setJournalSaving(false)
    if (error) {
      console.error("Error creating journal:", { message: error.message })
      return
    }
    setJournals(prev => [...prev, data])
    setSelectedJournalId(data.id)
    setNewJournalName("")
    setCreatingJournal(false)
    setShowJournalMenu(false)
  }

  async function handleDeleteJournal(id: string) {
    const { error } = await supabase.from('journals').delete().eq('id', id)
    if (error) {
      console.error("Error deleting journal:", { message: error.message })
      return
    }
    setJournals(prev => prev.filter(j => j.id !== id))
    if (selectedJournalId === id) {
      setSelectedJournalId(null)
    }
  }

  const selectedJournal = journals.find(j => j.id === selectedJournalId)

  const ruleStatusIcon = (status: RuleStatus) => {
    if (status === 'followed') return <ShieldCheck className="w-4 h-4 text-profit-green" />
    if (status === 'violated') return <ShieldX className="w-4 h-4 text-loss-red" />
    return <MinusCircle className="w-4 h-4 text-text-muted" />
  }

  const ruleStatusClass = (status: RuleStatus, target: RuleStatus) => {
    const active = status === target
    if (target === 'followed') return active ? 'bg-profit-tint text-profit-green border-profit-green' : 'border-card-border text-text-muted hover:border-profit-green/50'
    if (target === 'violated') return active ? 'bg-loss-tint text-loss-red border-loss-red' : 'border-card-border text-text-muted hover:border-loss-red/50'
    return active ? 'bg-neutral-fill text-text-primary border-card-border' : 'border-card-border text-text-muted'
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

        <div className="flex items-center gap-3">
          {/* New Entry Button */}
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Entry
          </button>

          {/* Journal Selector */}
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
                {/* All entries option */}
                <div
                  className={`flex items-center px-4 py-2 hover:bg-neutral-fill cursor-pointer ${!selectedJournalId ? 'bg-accent-tint border-l-4 border-accent' : ''}`}
                  onClick={() => { setSelectedJournalId(null); setShowJournalMenu(false) }}
                >
                  <span className="text-sm text-text-primary">All Entries</span>
                </div>

                {journals.map(j => (
                  <div
                    key={j.id}
                    className={`flex items-center justify-between px-4 py-2 hover:bg-neutral-fill cursor-pointer ${selectedJournalId === j.id ? 'bg-accent-tint border-l-4 border-accent' : ''}`}
                  >
                    <span
                      className="flex-1 text-sm text-text-primary"
                      onClick={() => { setSelectedJournalId(j.id); setShowJournalMenu(false) }}
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
                      <button
                        onClick={handleCreateJournal}
                        disabled={journalSaving}
                        className="px-2 py-1 text-xs bg-accent text-white rounded"
                      >
                        {journalSaving ? "..." : "Create"}
                      </button>
                      <button
                        onClick={() => { setCreatingJournal(false); setNewJournalName("") }}
                        className="px-2 py-1 text-xs border border-card-border rounded"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCreatingJournal(true)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-accent hover:bg-neutral-fill rounded transition-colors"
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

      {fetchError && (
        <div className="p-4 bg-loss-tint border border-loss-red rounded-lg text-sm text-loss-red">
          {fetchError}
        </div>
      )}

      {/* Create Entry Form */}
      {showCreateForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold text-text-primary">New Journal Entry</CardTitle>
            <button onClick={() => setShowCreateForm(false)} className="text-text-muted hover:text-text-primary">
              <X className="w-5 h-5" />
            </button>
          </CardHeader>
          <CardContent className="space-y-4">
            {createError && (
              <div className="p-3 bg-loss-tint border border-loss-red rounded-lg text-sm text-loss-red">
                {createError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-text-muted uppercase tracking-wider">Title *</label>
                <Input
                  value={createTitle}
                  onChange={e => setCreateTitle(e.target.value)}
                  placeholder="e.g. NVDA breakout trade"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted uppercase tracking-wider">Date</label>
                <Input
                  type="date"
                  value={createDate}
                  onChange={e => setCreateDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider">Linked Trade (optional)</label>
              <select
                value={createTradeId}
                onChange={e => setCreateTradeId(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-card-border rounded-lg bg-card-bg text-text-primary text-sm"
              >
                <option value="">— No trade linked —</option>
                {availableTrades.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.ticker} — {new Date(t.created_at).toLocaleDateString()} — {t.realized_pl ? formatPL(t.realized_pl) : "no P&L"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider">Trade Notes</label>
              <Textarea
                value={createContent}
                onChange={e => setCreateContent(e.target.value)}
                placeholder="Describe your trade, setup, and reasoning..."
                className="mt-1 min-h-[100px]"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-text-muted uppercase tracking-wider">Emotional State</label>
                <Input
                  value={createEmotional}
                  onChange={e => setCreateEmotional(e.target.value)}
                  placeholder="How did you feel?"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted uppercase tracking-wider">Lessons Learned</label>
                <Input
                  value={createLessons}
                  onChange={e => setCreateLessons(e.target.value)}
                  placeholder="What did you learn?"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider">Plan for Improvement</label>
              <Textarea
                value={createPlan}
                onChange={e => setCreatePlan(e.target.value)}
                placeholder="What will you do differently?"
                className="mt-1 min-h-[60px]"
              />
            </div>

            {/* Rule Tracking */}
            {createRules.length > 0 && (
              <div>
                <label className="text-xs text-text-muted uppercase tracking-wider mb-2 block">Rule Adherence</label>
                <div className="space-y-2">
                  {createRules.map(cr => {
                    const rule = userRules.find(r => r.id === cr.rule_id)
                    if (!rule) return null
                    return (
                      <div key={cr.rule_id} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-neutral-fill/50">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {ruleStatusIcon(cr.status)}
                          <span className="text-sm text-text-primary truncate">{rule.name}</span>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {(['followed', 'violated', 'not_applicable'] as RuleStatus[]).map(s => (
                            <button
                              key={s}
                              onClick={() => setCreateRuleStatus(cr.rule_id, s)}
                              className={`px-2 py-1 text-xs rounded border transition-colors ${ruleStatusClass(cr.status, s)}`}
                            >
                              {s === 'followed' ? '✓' : s === 'violated' ? '✗' : '—'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button onClick={handleCreateEntry} disabled={creating || !createTitle.trim()}>
                {creating ? "Saving..." : "Save Entry"}
              </Button>
              <Button variant="outline" onClick={() => { setShowCreateForm(false); setCreateError(null) }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entries + Editor layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Entries List */}
        <div className="lg:col-span-1">
          <Card className="h-[calc(100vh-200px)] overflow-hidden">
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">
                {selectedJournal ? selectedJournal.name : "All Entries"}
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
                        <div
                          key={entry.id}
                          className={`group w-full text-left p-3 border-b border-card-border hover:bg-neutral-fill transition-colors cursor-pointer ${isSelected ? 'bg-accent-tint border-l-4 border-accent' : ''}`}
                          onClick={() => handleEntrySelect(entry)}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-sm font-medium text-text-primary truncate flex-1">{entry.title || "Untitled Entry"}</div>
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              <span className="text-xs text-text-muted">
                                {new Date(entry.date || entry.created_at).toLocaleDateString()}
                              </span>
                              <button
                                onClick={e => { e.stopPropagation(); handleDeleteEntry(entry.id) }}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:text-loss-red text-text-muted transition-opacity"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
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
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 px-4">
                    <BookOpen className="w-10 h-10 text-text-muted mx-auto mb-2" />
                    <p className="text-text-muted text-sm">No entries yet</p>
                    <button
                      onClick={() => setShowCreateForm(true)}
                      className="mt-3 px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 transition-colors"
                    >
                      Create your first entry
                    </button>
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
                      <Button onClick={handleSaveClick} size="sm" className="gap-1" disabled={saving}>
                        <Save className="w-4 h-4" />
                        {saving ? "Saving..." : "Save"}
                      </Button>
                      <Button onClick={() => { setIsEditing(false); setSaveError(null); populateEditor(selectedEntry) }} size="sm" variant="outline">
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
                  {saveError && (
                    <div className="p-3 bg-loss-tint border border-loss-red rounded-lg text-sm text-loss-red">
                      {saveError}
                    </div>
                  )}

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

                  {/* Rule Tracking */}
                  {userRules.filter(r => r.enabled).length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">Rule Adherence</h3>
                        <button
                          onClick={handleSaveEntryRules}
                          disabled={rulesSaving}
                          className="flex items-center gap-1 px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-50"
                        >
                          <Check className="w-3 h-3" />
                          {rulesSaving ? "Saving..." : "Save Rules"}
                        </button>
                      </div>
                      <div className="space-y-2">
                        {userRules.filter(r => r.enabled).map(rule => {
                          const status = getEntryRuleStatus(rule.id)
                          return (
                            <div key={rule.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-neutral-fill/50">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {ruleStatusIcon(status)}
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-text-primary truncate">{rule.name}</div>
                                  {rule.description && <div className="text-xs text-text-muted truncate">{rule.description}</div>}
                                </div>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                {(['followed', 'violated', 'not_applicable'] as RuleStatus[]).map(s => (
                                  <button
                                    key={s}
                                    onClick={() => setEntryRuleStatus(rule.id, s)}
                                    title={s === 'followed' ? 'Followed' : s === 'violated' ? 'Violated' : 'N/A'}
                                    className={`px-2 py-1 text-xs rounded border transition-colors ${ruleStatusClass(status, s)}`}
                                  >
                                    {s === 'followed' ? '✓' : s === 'violated' ? '✗' : '—'}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-[calc(100vh-200px)] flex items-center justify-center">
              <div className="text-center text-text-muted">
                <BookOpen className="w-12 h-12 mx-auto mb-4" />
                <h3 className="font-medium mb-2 text-text-primary">No Entry Selected</h3>
                <p className="text-sm mb-4">Select an entry from the left, or create a new one.</p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 transition-colors"
                >
                  <Plus className="w-4 h-4 inline mr-1" />
                  New Entry
                </button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
