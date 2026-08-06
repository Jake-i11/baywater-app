"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { GraduationCap, User, TrendingUp, TrendingDown, ShieldCheck, Target, BarChart3, Award, Star, Search } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPL, formatNumber } from "@/lib/utils"
import Link from "next/link"
import { Input } from "@/components/ui/input"

interface Student {
  id: string
  username: string
  email: string
  profile_score: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  total_pl: number
  win_rate: number
  discipline_score: number
  consistency_score: number
  execution_score: number
  last_active: string
  behavior_tags: string[]
}

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
  student_id: string
  student_name: string
}

export default function CoachPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [studentTrades, setStudentTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [timeFrame, setTimeFrame] = useState<"week" | "month" | "quarter" | "all">("month")

  useEffect(() => {
    fetchCoachData()
  }, [])

  async function fetchCoachData() {
    try {
      setLoading(true)

      // Fetch students data (in a real app, this would be filtered by coach ID)
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('*')
        .order('last_active', { ascending: false })

      if (studentsError) {
        console.error("Error fetching students:", studentsError)
        return
      }

      if (studentsData) {
        setStudents(studentsData)

        // Select the first student by default if there are students
        if (studentsData.length > 0) {
          setSelectedStudent(studentsData[0])
          await fetchStudentTrades(studentsData[0].id)
        }
      }
    } catch (error) {
      console.error("Error fetching coach data:", error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchStudentTrades(studentId: string) {
    try {
      // Fetch trades for the selected student
      const { data: tradesData, error: tradesError } = await supabase
        .from('trades')
        .select('*, profiles:students (username)')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })

      if (tradesError) {
        console.error("Error fetching student trades:", tradesError)
        return
      }

      if (tradesData) {
        setStudentTrades(tradesData)
      }
    } catch (error) {
      console.error("Error fetching student trades:", error)
    }
  }

  function handleStudentSelect(student: Student) {
    setSelectedStudent(student)
    fetchStudentTrades(student.id)
  }

  // Filter students based on search term
  const filteredStudents = students.filter(student =>
    student.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Filter trades by time frame
  const filteredTrades = studentTrades.filter(trade => {
    const tradeDate = new Date(trade.created_at)
    const now = new Date()

    if (timeFrame === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      return tradeDate >= weekAgo
    } else if (timeFrame === "month") {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      return tradeDate >= monthAgo
    } else if (timeFrame === "quarter") {
      const quarterAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      return tradeDate >= quarterAgo
    }
    return true // "all" time frame
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-text-muted">Loading coach dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Coach Dashboard</h1>
        <div className="flex items-center gap-4">
          <Link href="/settings" className="px-4 py-2 border border-card-border rounded-lg hover:bg-neutral-fill transition-colors">
            Coach Settings
          </Link>
          <Link href="/analytics" className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">
            Team Analytics
          </Link>
        </div>
      </div>

      {/* Students List and Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Students List */}
        <div className="lg:col-span-1">
          <Card className="h-[calc(100vh-200px)] overflow-hidden">
            <CardHeader>
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-text-muted" />
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Your Students</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="p-4 border-b border-card-border">
                <div className="flex items-center gap-2">
                  <Search className="w-5 h-5 text-text-muted" />
                  <Input
                    placeholder="Search students..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="overflow-y-auto h-[calc(100%-100px)]">
                {filteredStudents.length > 0 ? (
                  <div className="space-y-2">
                    {filteredStudents.map((student) => {
                      const isSelected = selectedStudent?.id === student.id
                      const isProfitable = student.total_pl > 0

                      return (
                        <button
                          key={student.id}
                          onClick={() => handleStudentSelect(student)}
                          className={`w-full text-left p-3 border-b border-card-border hover:bg-neutral-fill transition-colors ${isSelected ? 'bg-accent-tint border-l-4 border-accent' : ''}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-neutral-fill rounded-full flex items-center justify-center text-sm font-medium text-text-primary">
                                {student.username.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-text-primary">{student.username}</div>
                                <div className="text-xs text-text-muted">
                                  Last active: {new Date(student.last_active).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                            <div className={`text-lg font-bold ${isProfitable ? 'text-profit-green' : 'text-loss-red'}`}>
                              {formatPL(student.total_pl.toString())}
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-xs mt-1">
                            <div className="flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" />
                              <span>Discipline: {Math.round(student.discipline_score)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" />
                              <span>Win Rate: {student.win_rate.toFixed(1)}%</span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 bg-neutral-fill rounded-full flex items-center justify-center mx-auto mb-2">
                      <User className="w-6 h-6 text-text-muted" />
                    </div>
                    <p className="text-text-muted">No students found</p>
                    <p className="text-xs text-text-muted mt-1">Invite traders to join your coaching program</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Student Details */}
        <div className="lg:col-span-2">
          {selectedStudent ? (
            <div className="flex flex-col gap-4">
              {/* Student Header */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-neutral-fill rounded-full flex items-center justify-center text-2xl font-bold text-text-primary">
                      {selectedStudent.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-text-primary">{selectedStudent.username}</h2>
                      <p className="text-sm text-text-muted">{selectedStudent.email}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Profile Score</div>
                      <div className="text-2xl font-bold text-text-primary">
                        {Math.round(selectedStudent.profile_score)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Total Trades</div>
                      <div className="text-2xl font-bold text-text-primary">
                        {selectedStudent.total_trades}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Win Rate</div>
                      <div className="text-2xl font-bold text-text-primary">
                        {selectedStudent.win_rate.toFixed(1)}%
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Net P&L</div>
                      <div className="text-2xl font-bold tabular-nums text-profit-green">
                        {formatPL(selectedStudent.total_pl.toString())}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Student Performance */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Performance Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Discipline</div>
                      <div className="text-lg font-bold text-text-primary">
                        {Math.round(selectedStudent.discipline_score)}
                      </div>
                      <div className="w-full bg-neutral-fill rounded-full h-2 mt-2">
                        <div
                          className="h-2 rounded-full bg-profit-green"
                          style={{ width: `${selectedStudent.discipline_score}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Consistency</div>
                      <div className="text-lg font-bold text-text-primary">
                        {Math.round(selectedStudent.consistency_score)}
                      </div>
                      <div className="w-full bg-neutral-fill rounded-full h-2 mt-2">
                        <div
                          className="h-2 rounded-full bg-accent"
                          style={{ width: `${selectedStudent.consistency_score}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Execution</div>
                      <div className="text-lg font-bold text-text-primary">
                        {Math.round(selectedStudent.execution_score)}
                      </div>
                      <div className="w-full bg-neutral-fill rounded-full h-2 mt-2">
                        <div
                          className="h-2 rounded-full bg-text-muted"
                          style={{ width: `${selectedStudent.execution_score}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Behavioral Patterns */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-text-muted" />
                    <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Behavioral Patterns</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {selectedStudent.behavior_tags.map((tag, index) => (
                      <span key={index} className="px-3 py-1 rounded-full text-sm font-medium bg-tag-neutral-bg text-tag-neutral-text">
                        {tag}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="h-[calc(100vh-200px)]">
              <CardContent className="flex items-center justify-center h-full">
                <div className="text-center text-text-muted">
                  <div className="w-16 h-16 bg-neutral-fill rounded-full flex items-center justify-center mx-auto mb-4">
                    <GraduationCap className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">No Student Selected</h3>
                  <p className="text-sm">Select a student from the left panel to view their details</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Student Trades */}
      {selectedStudent && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">Recent Trades - {selectedStudent.username}</h2>
            <div className="flex items-center gap-2">
              <span className="text-text-muted">Time Frame:</span>
              <select
                value={timeFrame}
                onChange={(e) => setTimeFrame(e.target.value as "week" | "month" | "quarter" | "all")}
                className="px-3 py-2 border border-card-border rounded-lg bg-card-bg text-text-primary"
              >
                <option value="week">Last Week</option>
                <option value="month">Last Month</option>
                <option value="quarter">Last Quarter</option>
                <option value="all">All Time</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTrades.map((trade) => {
              const isProfitable = trade.realized_pl && parseFloat(trade.realized_pl) > 0
              const entryPrice = trade.entry_price ? parseFloat(trade.entry_price) : 0
              const exitPrice = trade.exit_price ? parseFloat(trade.exit_price) : 0

              return (
                <Card key={trade.id} sentiment={isProfitable ? "profit" : "loss"}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="text-lg font-bold text-text-primary">{trade.ticker}</div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${trade.side === 'SHORT' ? 'bg-loss-tint text-loss-red' : 'bg-profit-tint text-profit-green'}`}>
                          {trade.side}
                        </span>
                      </div>
                      <div className={`text-lg font-bold tabular-nums ${isProfitable ? 'text-profit-green' : 'text-loss-red'}`}>
                        {formatPL(trade.realized_pl)}
                      </div>
                    </div>

                    {/* Mini chart placeholder */}
                    <div className="h-20 bg-neutral-fill rounded-lg mb-3 flex items-end justify-center overflow-hidden">
                      <svg className="w-full h-full" viewBox="0 0 200 60">
                        <path
                          d={`M 0 ${60 - (entryPrice % 60)} L 100 ${60 - (exitPrice % 60)}`}
                          stroke={isProfitable ? "#1DA97F" : "#E5484D"}
                          strokeWidth="2"
                          fill="none"
                        />
                      </svg>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                      <div>
                        <div className="text-text-muted">Entry</div>
                        <div className="text-text-primary font-medium">${entryPrice.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-text-muted">Exit</div>
                        <div className="text-text-primary font-medium">${exitPrice.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-text-muted">Date</div>
                        <div className="text-text-primary font-medium">{new Date(trade.created_at).toLocaleDateString()}</div>
                      </div>
                      <div>
                        <div className="text-text-muted">Size</div>
                        <div className="text-text-primary font-medium">{trade.size}</div>
                      </div>
                    </div>

                    {(trade.behaviorTags ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(trade.behaviorTags ?? []).slice(0, 2).map((tag) => (
                          <span key={tag} className="px-2 py-1 rounded-full text-[10px] font-medium bg-tag-neutral-bg text-tag-neutral-text">
                            {tag}
                          </span>
                        ))}
                        {(trade.behaviorTags ?? []).length > 2 && (
                          <span className="text-[10px] text-text-muted">+{(trade.behaviorTags ?? []).length - 2}</span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}