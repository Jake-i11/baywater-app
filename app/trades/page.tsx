"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function TradesPage() {
  const [trades, setTrades] = useState<any[]>([]);

  useEffect(() => {
    async function loadTrades() {
      const { data } = await supabase
        .from("trades")
        .select("*")
        .order("created_at", { ascending: false });

      setTrades(data || []);
    }

    loadTrades();
  }, []);

  return (
    <div style={{ padding: 40, color: "white", background: "#0b0f17", minHeight: "100vh" }}>
      <h1>Trade History</h1>

      <div style={{ marginTop: 20 }}>
        {trades.map((t) => (
          <div
            key={t.id}
            style={{
              padding: 15,
              border: "1px solid #1f2a44",
              borderRadius: 10,
              marginBottom: 10,
              background: "#121a2a",
            }}
          >
            <p><b>Ticker:</b> {t.ticker}</p>
            <p><b>Size:</b> {t.size}</p>
            <p><b>Time:</b> {t.time}</p>
            <p><b>Violations:</b> {t.violations}</p>
          </div>
        ))}
      </div>
    </div>
  );
}