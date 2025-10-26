/*import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import _ from 'lodash'; // ADDED LODASH IMPORT

// ==========================================================
// HELPER FUNCTIONS
// ==========================================================

// Simple common English stop words for filtering
const STOP_WORDS = [
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", 
  "for", "of", "is", "was", "be", "it", "that", "this", "have", "with",
];

// Extracts keywords from text: removes punctuation, converts to lower case, filters stop words, and filters short words
function extractKeywords(text) {
  if (typeof text !== "string") return [];
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with space
    .split(/\s+/)            // Split by one or more spaces
    .filter(word => word.length > 3 && !STOP_WORDS.includes(word));
}

// Counts keyword frequency across an array of keyword arrays
const countKeywordFrequency = (keywordArrays) => {
  const wordCounts = {};
  keywordArrays.forEach(keywords => {
    keywords.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
  });
  
  // Convert to array and sort by frequency (descending)
  return Object.entries(wordCounts)
    .sort(([, countA], [, countB]) => countB - countA)
    .map(([word, count]) => ({ word, count }));
};

// Turn "HH:MM:SS" into total seconds
function parseHMS(hms) {
  if (!hms || typeof hms !== "string") return 0;
  const parts = hms.split(":").map(Number);
  if (parts.length === 3) {
    const [hh, mm, ss] = parts;
    if ([hh, mm, ss].some(Number.isNaN)) return 0;
    return hh * 3600 + mm * 60 + ss;
  } else if (parts.length === 2) {
    const [mm, ss] = parts;
    if ([mm, ss].some(Number.isNaN)) return 0;
    return mm * 60 + ss;
  } else if (parts.length === 1 && !Number.isNaN(parts[0])) {
    return parts[0];
  }
  return 0;
}

// Turn seconds back into "HH:MM:SS"
function formatSecondsToHMS(totalSeconds) {
  const pad = (n) => String(n).padStart(2, "0");
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return pad(hh) + ":" + pad(mm) + ":" + pad(ss);
}

// Convert "HH:MM:SS" to total minutes (rounded to 2 decimal places)
function hmsToMinutes(hms) {
  if (typeof hms !== "string") return 0;
  const parts = hms.split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const s = parseInt(parts[2], 10) || 0;
  
  const totalSeconds = h * 3600 + m * 60 + s;
  return Math.round((totalSeconds / 60) * 100) / 100;
}

// Categorize duration
function categorizeDuration(minutes) {
  if (minutes < 2) return "Short";
  if (minutes <= 5) return "Medium";
  return "Long";
}

// Normalize boolean values
function toBool(v) {
  if (v === true || v === false) return v;
  const s = String(v || "").trim().toLowerCase();
  return s === "y" || s === "yes" || s === "true" || s === "1";
}

// Extract hour from time string (assuming HH:MM:SS)
function extractHour(timeStr) {
  if (typeof timeStr !== 'string') return 0;
  const timeParts = timeStr.split(':');
  // Returns 0 if parsing fails, which acts as an 'Unknown' hour bin
  return parseInt(timeParts[0], 10) || 0; 
}

// StatCard component
function StatCard({ label, value }) {
  return (
    <div
      style={{
        border: "1px solid #eee",
        borderRadius: 8,
        padding: 12,
        background: "white",
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
        color: "#333",
      }}
    >
      <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

// ==========================================================
// MAIN COMPONENT
// ==========================================================

export default function CallsSummary() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    setLoading(true);
    setErrorMsg("");
    Papa.parse("./riddhiproject.csv", {
      header: true,
      download: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => {
        setRows(results.data || []);
        setLoading(false);
      },
      error: (err) => {
        setErrorMsg(err?.message || "Failed to load CSV");
        setLoading(false);
      },
    });
  }, []);

  const stats = useMemo(() => {
    if (!rows.length) {
      return {
        total: 0,
        avgHMS: "00:00:00",
        ptpCounts: { true: 0, false: 0 },
        rtpCounts: { true: 0, false: 0 },
        escCounts: { true: 0, false: 0 },
        successRate: 0,
        escalationRate: 0,
        durationCategoryCounts: { Short: 0, Medium: 0, Long: 0 },
        topKeywordsEscalated: [],
        topKeywordsNonEscalated: [],
        successRateByHour: [], // ADDED
        escalationRateByDuration: [], // ADDED
        avgDurationByPtpStatus: [], // ADDED
      };
    }

    // ==========================================================
    // FEATURE ENGINEERING & DATA TRANSFORMATION
    // ==========================================================
    const processedRows = rows.map((row) => {
      const durationMinutes = hmsToMinutes(row.call_duration);
      const durationCategory = categorizeDuration(durationMinutes);
      const attemptHour = extractHour(row.attempt_time); // RE-ADDED attempt_hour

      return {
        ...row,
        call_duration_minutes: durationMinutes,
        duration_category: durationCategory,
        attempt_hour: attemptHour, // Added to row
        is_ptp: toBool(row.ptp), // Added for lodash filtering
        is_escalated: toBool(row.escalation), // Added for lodash filtering
        keywords: extractKeywords(row.call_summary), 
      };
    });
    // ==========================================================
    
    // STATS CALCULATION using processedRows
    const total = processedRows.length;
    
    // Average duration
    const secs = processedRows.map((r) => parseHMS(r.call_duration));
    const sumSecs = secs.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    const avgSecs = total > 0 ? sumSecs / total : 0;
    const avgHMS = formatSecondsToHMS(avgSecs);

    // Boolean distributions
    const ptpBools = processedRows.map((r) => r.is_ptp); // Use processed bool
    const rtpBools = processedRows.map((r) => r.rtp);
    const escBools = processedRows.map((r) => r.is_escalated); // Use processed bool

    const countTrueFalse = (arr) => ({
      true: arr.filter(Boolean).length,
      false: arr.filter((x) => !x).length,
    });
    
    // Helper to count category occurrences
    const countCategories = (arr) => arr.reduce((acc, val) => {
        acc[val] = (acc[val] || 0) + 1;
        return acc;
    }, { Short: 0, Medium: 0, Long: 0 });

    const ptpCounts = countTrueFalse(ptpBools);
    const rtpCounts = countTrueFalse(rtpBools);
    const escCounts = countTrueFalse(escBools);

    // New Statistic
    const durationCategoryCounts = countCategories(processedRows.map(r => r.duration_category));

    // Rates
    const successRate = total ? (ptpCounts.true / total) * 100 : 0;
    const escalationRate = total ? (escCounts.true / total) * 100 : 0;

    // ==========================================================
    // TEXT ANALYSIS (Existing)
    // ==========================================================
    const escalatedCalls = processedRows.filter(r => r.is_escalated);
    const nonEscalatedCalls = processedRows.filter(r => !r.is_escalated);

    const keywordsEscalated = escalatedCalls.map(r => r.keywords);
    const keywordsNonEscalated = nonEscalatedCalls.map(r => r.keywords);

    const topKeywordsEscalated = countKeywordFrequency(keywordsEscalated).slice(0, 10);
    const topKeywordsNonEscalated = countKeywordFrequency(keywordsNonEscalated).slice(0, 10);

    // ==========================================================
    // 4. BASIC STATISTICAL ANALYSIS (NEW)
    // ==========================================================

    // 1. Success rate by time of day
    const successRateByHour = _.chain(processedRows)
      .groupBy('attempt_hour')
      .map((calls, hour) => ({
        hour: parseInt(hour, 10),
        successRate: (_.filter(calls, { is_ptp: true }).length / calls.length) * 100,
        totalCalls: calls.length
      }))
      .sortBy('hour')
      .value();

    // 2. Escalation rate by call duration category
    const escalationRateByDuration = _.chain(processedRows)
      .groupBy('duration_category')
      .map((calls, category) => ({
        category: category,
        escalationRate: (_.filter(calls, { is_escalated: true }).length / calls.length) * 100,
        totalCalls: calls.length
      }))
      .value();

    // 3. Average duration by PTP status
    const avgDurationByPtpStatus = _.chain(processedRows)
      .groupBy('is_ptp')
      .map((calls, isPtp) => ({
        ptpStatus: isPtp === 'true' ? 'PTP Captured' : 'No PTP',
        avgDurationMinutes: _.sumBy(calls, 'call_duration_minutes') / calls.length,
        totalCalls: calls.length
      }))
      .value();


    return {
      total,
      avgHMS,
      ptpCounts,
      rtpCounts,
      escCounts,
      successRate,
      escalationRate,
      durationCategoryCounts,
      topKeywordsEscalated,
      topKeywordsNonEscalated,
      successRateByHour, // ADDED
      escalationRateByDuration, // ADDED
      avgDurationByPtpStatus, // ADDED
    };
  }, [rows]); 


  if (loading) {
    return (
      <div style={{ padding: 16, background: "#212121", color: "white" }}>
        Loading CSV…
      </div>
    );
  }
  if (errorMsg) {
    return (
      <div style={{ padding: 16, color: "crimson", background: "#212121" }}>
        Error: {errorMsg}
      </div>
    );
  }

  // ==========================================================
  // JSX RENDERING (OUTPUT)
  // ==========================================================
  return (
    <div
      style={{
        padding: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        background: "#212121",
        color: "white",
      }}
    >
      <h2 style={{ marginTop: 0 }}>Calls Summary</h2>

      {/* Basic Stat Cards */ /*}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <StatCard label="Total Calls" value={stats.total} />
        <StatCard label="Average Call Duration" value={stats.avgHMS} />
        <StatCard
          label="PTP: True / False"
          value={String(stats.ptpCounts.true) + " / " + String(stats.ptpCounts.false)}
        />
        <StatCard
          label="RTP: True / False"
          value={String(stats.rtpCounts.true) + " / " + String(stats.rtpCounts.false)}
        />
        <StatCard
          label="Escalations: True / False"
          value={String(stats.escCounts.true) + " / " + String(stats.escCounts.false)}
        />
        <StatCard
          label="Success Rate (PTP %)"
          value={stats.successRate.toFixed(1) + "%"}
        />
        <StatCard
          label="Escalation Rate (%)"
          value={stats.escalationRate.toFixed(1) + "%"}
        />
        {/* Duration Stats */ /*}
        <StatCard
          label="Short Calls (< 2 min)"
          value={stats.durationCategoryCounts.Short}
        />
        <StatCard
          label="Medium Calls (2-5 min)"
          value={stats.durationCategoryCounts.Medium}
        />
        <StatCard
          label="Long Calls (> 5 min)"
          value={stats.durationCategoryCounts.Long}
        />
      </div>

      <h3 style={{ marginTop: 32 }}>Basic Statistical Analysis</h3>
      <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", 
          gap: 16 
        }}>
        <AnalysisBox title="Success Rate by Hour of Day" data={stats.successRateByHour} />
        <AnalysisBox title="Escalation Rate by Duration Category" data={stats.escalationRateByDuration} />
        <AnalysisBox title="Average Duration by PTP Status" data={stats.avgDurationByPtpStatus} />
      </div>


      {/* Text Analysis Output */ /*}
      <h3 style={{ marginTop: 32 }}>Call Summary Keyword Analysis</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <KeywordList 
          title="Top 10 Keywords in ESCALATED Calls" 
          keywords={stats.topKeywordsEscalated} 
          isEscalated={true} 
        />
        <KeywordList 
          title="Top 10 Keywords in NON-ESCALATED Calls" 
          keywords={stats.topKeywordsNonEscalated} 
          isEscalated={false} 
        />
      </div>


      {/* Sample Rows */ /*}
      <h3 style={{ marginTop: 24 }}>Sample Rows</h3>
      <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>
        Showing the first 5 rows so you can confirm columns look right.
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          textAlign: "left",
          color: "white",
        }}
      >
        <thead>
          <tr style={{ backgroundColor: "#424242" }}>
            <th style={{ padding: "8px" }}>customer_id</th>
            <th style={{ padding: "8px" }}>ptp</th>
            <th style={{ padding: "8px" }}>rtp</th>
            <th style={{ padding: "8px" }}>call_duration</th>
            <th style={{ padding: "8px" }}>escalation</th>
            <th style={{ padding: "8px" }}>Minutes</th>
            <th style={{ padding: "8px" }}>Category</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((r, idx) => {
            const durationMinutes = hmsToMinutes(r.call_duration);
            const durationCategory = categorizeDuration(durationMinutes);
            
            return (
              <tr
                key={idx}
                style={{
                  borderBottom: "1px solid #666",
                  backgroundColor: idx % 2 === 0 ? "#303030" : "#212121",
                }}
              >
                <td style={{ padding: "8px" }}>{r.customer_id}</td>
                <td style={{ padding: "8px" }}>{String(r.ptp)}</td>
                <td style={{ padding: "8px" }}>{String(r.rtp)}</td>
                <td style={{ padding: "8px" }}>{r.call_duration}</td>
                <td style={{ padding: "8px" }}>{String(r.escalation)}</td>
                <td style={{ padding: "8px" }}>{durationMinutes.toFixed(2)}</td>
                <td style={{ padding: "8px" }}>{durationCategory}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ==========================================================
// NEW COMPONENTS FOR DISPLAY
// ==========================================================

// Keyword List Component (moved here for cleaner main component)
function KeywordList({ title, keywords }) {
  const isTrigger = (word) => ["fraud", "paid", "issue", "refund", "complaint", "manager"].includes(word);

  return (
    <div style={{ padding: 12, border: '1px solid #333', borderRadius: 8 }}>
      <h4 style={{ margin: 0, marginBottom: 10, color: '#FFD700' }}>{title}</h4>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {keywords.length > 0 ? keywords.map(({ word, count }, index) => (
          <li 
            key={index} 
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              fontSize: 14, 
              padding: '4px 0',
              borderBottom: '1px dotted #444',
              color: isTrigger(word) ? '#FF4500' : 'white' 
            }}
          >
            <span style={{ fontWeight: isTrigger(word) ? 700 : 400 }}>{word}</span>
            <span style={{ color: '#aaa' }}>{count}</span>
          </li>
        )) : <li style={{ color: '#aaa' }}>No keywords found. (Check 'call_summary' column data)</li>}
      </ul>
    </div>
  );
}

// Analysis Box Component to display the Lodash results cleanly
function AnalysisBox({ title, data }) {
  return (
    <div style={{ padding: 12, border: '1px solid #333', borderRadius: 8 }}>
      <h4 style={{ margin: 0, marginBottom: 10, color: '#00BFFF' }}>{title}</h4>
      {data.length > 0 ? (
        <pre style={{ 
            fontSize: 12, 
            backgroundColor: '#333', 
            padding: 8, 
            borderRadius: 4, 
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
        }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <p style={{ fontSize: 14, color: '#aaa' }}>No data to display. (Check 'attempt_time' column)</p>
      )}
    </div>
  );
}
*/


import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import _ from "lodash";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ResponsiveContainer,
} from "recharts";

// ==========================================================
// HELPER FUNCTIONS
// ==========================================================

// Simple common English stop words for filtering
const STOP_WORDS = [
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "is",
  "was",
  "be",
  "it",
  "that",
  "this",
  "have",
  "with",
];

// Extracts keywords from text
function extractKeywords(text) {
  if (typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.includes(word));
}

// Counts keyword frequency
const countKeywordFrequency = (keywordArrays) => {
  const wordCounts = {};
  keywordArrays.forEach((keywords) => {
    keywords.forEach((word) => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
  });

  return Object.entries(wordCounts)
    .sort(([, countA], [, countB]) => countB - countA)
    .map(([word, count]) => ({ word, count }));
};

// Turn "HH:MM:SS" into total seconds
function parseHMS(hms) {
  if (!hms || typeof hms !== "string") return 0;
  const parts = hms.split(":").map(Number);
  if (parts.length === 3) {
    const [hh, mm, ss] = parts;
    if ([hh, mm, ss].some(Number.isNaN)) return 0;
    return hh * 3600 + mm * 60 + ss;
  } else if (parts.length === 2) {
    const [mm, ss] = parts;
    if ([mm, ss].some(Number.isNaN)) return 0;
    return mm * 60 + ss;
  } else if (parts.length === 1 && !Number.isNaN(parts[0])) {
    return parts[0];
  }
  return 0;
}

// Turn seconds back into "HH:MM:SS"
function formatSecondsToHMS(totalSeconds) {
  const pad = (n) => String(n).padStart(2, "0");
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return pad(hh) + ":" + pad(mm) + ":" + pad(ss);
}

// Convert "HH:MM:SS" to total minutes
function hmsToMinutes(hms) {
  if (typeof hms !== "string") return 0;
  const parts = hms.split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const s = parseInt(parts[2], 10) || 0;

  const totalSeconds = h * 3600 + m * 60 + s;
  return Math.round((totalSeconds / 60) * 100) / 100;
}

// Categorize duration
function categorizeDuration(minutes) {
  if (minutes < 2) return "Short"; // <2 min [cite: 52]
  if (minutes <= 5) return "Medium"; // 2-5 min [cite: 52]
  return "Long"; // >5 min [cite: 52]
}

// Normalize boolean values
function toBool(v) {
  if (v === true || v === false) return v;
  const s = String(v || "")
    .trim()
    .toLowerCase();
  return s === "y" || s === "yes" || s === "true" || s === "1";
}

// Extract hour from time string (assuming HH:MM:SS)
function extractHour(timeStr) {
  if (typeof timeStr !== "string") return 0;
  const timeParts = timeStr.split(":");
  return parseInt(timeParts[0], 10) || 0;
}

// StatCard component (Task 1: Overview/KPI Cards) [cite: 96]
function StatCard({ label, value }) {
  return (
    <div
      style={{
        border: "1px solid #eee",
        borderRadius: 8,
        padding: 12,
        background: "white",
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
        color: "#333",
      }}
    >
      <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

// ==========================================================
// NEW COMPONENTS FOR DISPLAY (Task 2, 3, 4)
// ==========================================================

// Helper to structure chart data
const getChartData = (stats, rows) => {
  // 1. Outcome Bar Chart Data (PTP, RTP, Escalation) [cite: 103]
  const outcomeChartData = [
    { name: "PTP Captured", count: stats.ptpCounts.true },
    { name: "RTP Flagged", count: stats.rtpCounts.true },
    { name: "Escalated", count: stats.escCounts.true },
  ];

  // 2. Duration Pie Chart Data [cite: 106]
  const durationChartData = Object.entries(stats.durationCategoryCounts)
    .map(([name, value]) => ({
      name,
      value,
    }))
    .filter((d) => d.value > 0);

  // 3. Keyword Bar Chart Data (Top 10 Escalated Keywords) [cite: 105]
  const keywordChartData = stats.topKeywordsEscalated.map((item) => ({
    word: item.word,
    count: item.count,
  }));

  // 4. Calls Over Time (Daily Trend) [cite: 104]
  const callsByDate = _.chain(rows)
    .groupBy("attempt_date") // Grouping by the date column (assuming it exists)
    .map((calls, date) => ({
      date: date,
      totalCalls: calls.length,
    }))
    .sortBy("date")
    .value();

  return { outcomeChartData, durationChartData, keywordChartData, callsByDate };
};

// --- CHART COMPONENTS (using Recharts) ---

// Pie Chart for Duration Distribution (Task 2)
const DurationPieChart = ({ data }) => {
  const COLORS = ["#00C49F", "#FFBB28", "#FF8042"];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={100}
          labelLine={false}
          label={({ name, percent }) =>
            `${name}: ${(percent * 100).toFixed(0)}%`
          }
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value, name) => [`${value} calls`, name]} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
};

// Bar Chart for Outcome Counts (Task 2)
const OutcomeBarChart = ({ data }) => {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ccc" />
        <XAxis dataKey="name" stroke="#333" />
        <YAxis allowDecimals={false} stroke="#333" />
        <Tooltip />
        <Legend />
        <Bar dataKey="count" fill="#8884d8" name="Call Count" />
      </BarChart>
    </ResponsiveContainer>
  );
};

// Bar Chart for Keywords (Task 2)
const KeywordBarChart = ({ data }) => {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        layout="vertical"
        data={data.slice(0, 10)}
        margin={{ top: 20, right: 30, left: 100, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#ccc" />
        <XAxis type="number" stroke="#333" />
        <YAxis dataKey="word" type="category" stroke="#333" width={90} />
        <Tooltip />
        <Bar dataKey="count" fill="#FFC658" name="Frequency" />
      </BarChart>
    </ResponsiveContainer>
  );
};

// Line Chart for Calls Over Time (Task 2)
const CallsOverTimeChart = ({ data }) => {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" stroke="#333" />
        <YAxis allowDecimals={false} stroke="#333" />
        <Tooltip />
        <Legend />
        <Line
          type="monotone"
          dataKey="totalCalls"
          stroke="#82ca9d"
          name="Total Calls"
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

// Analysis Box Component (for raw data display)
function AnalysisBox({ title, data }) {
  return (
    <div style={{ padding: 12, border: "1px solid #333", borderRadius: 8 }}>
      <h4 style={{ margin: 0, marginBottom: 10, color: "#00BFFF" }}>{title}</h4>
      {data.length > 0 ? (
        <pre
          style={{
            fontSize: 12,
            backgroundColor: "#333",
            padding: 8,
            borderRadius: 4,
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <p style={{ fontSize: 14, color: "#aaa" }}>
          No data to display. (Check 'attempt_time' column)
        </p>
      )}
    </div>
  );
}

// Keyword List Component (for text analysis display)
function KeywordList({ title, keywords }) {
  const isTrigger = (word) =>
    ["fraud", "paid", "issue", "refund", "complaint", "manager"].includes(word);

  return (
    <div style={{ padding: 12, border: "1px solid #333", borderRadius: 8 }}>
      <h4 style={{ margin: 0, marginBottom: 10, color: "#FFD700" }}>{title}</h4>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {keywords.length > 0 ? (
          keywords.map(({ word, count }, index) => (
            <li
              key={index}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 14,
                padding: "4px 0",
                borderBottom: "1px dotted #444",
                color: isTrigger(word) ? "#FF4500" : "white",
              }}
            >
              <span style={{ fontWeight: isTrigger(word) ? 700 : 400 }}>
                {word}
              </span>
              <span style={{ color: "#aaa" }}>{count}</span>
            </li>
          ))
        ) : (
          <li style={{ color: "#aaa" }}>
            No keywords found. (Check 'call_summary' column data)
          </li>
        )}
      </ul>
    </div>
  );
}

// Insight Card Component (Task 4: Insights Section) [cite: 110]
function InsightCard({ title, text }) {
  return (
    <div
      style={{
        padding: 12,
        border: "1px solid #444",
        borderRadius: 8,
        background: "#333",
      }}
    >
      <h5 style={{ margin: 0, color: "#00BFFF" }}>{title}</h5>
      <p style={{ margin: 0, fontSize: 13, color: "#aaa" }}>{text}</p>
    </div>
  );
}

// ==========================================================
// MAIN COMPONENT
// ==========================================================

export default function CallsSummary() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  // States for simple filters (Task 3)
  const [selectedOutcome, setSelectedOutcome] = useState("All");
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  useEffect(() => {
    setLoading(true);
    setErrorMsg("");
    Papa.parse("./riddhiproject.csv", {
      header: true,
      download: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => {
        setRows(results.data || []);
        setLoading(false);
      },
      error: (err) => {
        setErrorMsg(err?.message || "Failed to load CSV");
        setLoading(false);
      },
    });
  }, []);

  const stats = useMemo(() => {
    if (!rows.length) {
      return {
        total: 0,
        avgHMS: "00:00:00",
        ptpCounts: { true: 0, false: 0 },
        rtpCounts: { true: 0, false: 0 },
        escCounts: { true: 0, false: 0 },
        successRate: 0,
        escalationRate: 0,
        durationCategoryCounts: { Short: 0, Medium: 0, Long: 0 },
        topKeywordsEscalated: [],
        topKeywordsNonEscalated: [],
        successRateByHour: [],
        escalationRateByDuration: [],
        avgDurationByPtpStatus: [],
        outcomeChartData: [],
        durationChartData: [],
        keywordChartData: [],
        callsByDate: [],
      };
    }

    // ==========================================================
    // FEATURE ENGINEERING & DATA TRANSFORMATION
    // ==========================================================
    const processedRows = rows.map((row) => {
      const durationMinutes = hmsToMinutes(row.call_duration);
      const durationCategory = categorizeDuration(durationMinutes);
      const attemptHour = extractHour(row.attempt_time);
      const is_ptp = toBool(row.ptp_captured || row.ptp); // Assuming ptp_captured or ptp column [cite: 19]
      const is_escalated = toBool(row.escalation); // [cite: 21]

      return {
        ...row,
        call_duration_minutes: durationMinutes,
        duration_category: durationCategory,
        attempt_hour: attemptHour,
        is_ptp: is_ptp,
        is_escalated: is_escalated,
        keywords: extractKeywords(row.call_summary),
      };
    });

    // STATS CALCULATION using processedRows
    const total = processedRows.length;
    const secs = processedRows.map((r) => parseHMS(r.call_duration));
    const sumSecs = secs.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    const avgSecs = total > 0 ? sumSecs / total : 0;
    const avgHMS = formatSecondsToHMS(avgSecs);

    const ptpBools = processedRows.map((r) => r.is_ptp);
    const rtpBools = processedRows.map((r) => toBool(r.rtp_flagged || r.rtp)); // Assuming rtp_flagged or rtp column [cite: 20]
    const escBools = processedRows.map((r) => r.is_escalated);

    const countTrueFalse = (arr) => ({
      true: arr.filter(Boolean).length,
      false: arr.filter((x) => !x).length,
    });

    const countCategories = (arr) =>
      arr.reduce(
        (acc, val) => {
          acc[val] = (acc[val] || 0) + 1;
          return acc;
        },
        { Short: 0, Medium: 0, Long: 0 }
      );

    const ptpCounts = countTrueFalse(ptpBools);
    const rtpCounts = countTrueFalse(rtpBools);
    const escCounts = countTrueFalse(escBools);

    const durationCategoryCounts = countCategories(
      processedRows.map((r) => r.duration_category)
    );
    const successRate = total ? (ptpCounts.true / total) * 100 : 0; // [cite: 31]
    const escalationRate = total ? (escCounts.true / total) * 100 : 0; // [cite: 32]

    // TEXT ANALYSIS
    const escalatedCalls = processedRows.filter((r) => r.is_escalated);
    const nonEscalatedCalls = processedRows.filter((r) => !r.is_escalated);
    const topKeywordsEscalated = countKeywordFrequency(
      escalatedCalls.map((r) => r.keywords)
    ).slice(0, 10);
    const topKeywordsNonEscalated = countKeywordFrequency(
      nonEscalatedCalls.map((r) => r.keywords)
    ).slice(0, 10);

    // BASIC STATISTICAL ANALYSIS (Lodash)
    const successRateByHour = _.chain(processedRows)
      .groupBy("attempt_hour")
      .map((calls, hour) => ({
        hour: parseInt(hour, 10),
        successRate:
          (_.filter(calls, { is_ptp: true }).length / calls.length) * 100,
        totalCalls: calls.length,
      }))
      .sortBy("hour")
      .value();

    const escalationRateByDuration = _.chain(processedRows)
      .groupBy("duration_category")
      .map((calls, category) => ({
        category: category,
        escalationRate:
          (_.filter(calls, { is_escalated: true }).length / calls.length) * 100,
        totalCalls: calls.length,
      }))
      .value();

    const avgDurationByPtpStatus = _.chain(processedRows)
      .groupBy("is_ptp")
      .map((calls, isPtp) => ({
        ptpStatus: isPtp === "true" ? "PTP Captured" : "No PTP",
        avgDurationMinutes:
          _.sumBy(calls, "call_duration_minutes") / calls.length,
        totalCalls: calls.length,
      }))
      .value();

    // CHART DATA STRUCTURES
    const {
      outcomeChartData,
      durationChartData,
      keywordChartData,
      callsByDate,
    } = getChartData(
      {
        ptpCounts,
        rtpCounts,
        escCounts,
        durationCategoryCounts,
        topKeywordsEscalated,
      },
      rows
    );

    return {
      total,
      avgHMS,
      ptpCounts,
      rtpCounts,
      escCounts,
      successRate,
      escalationRate,
      durationCategoryCounts,
      topKeywordsEscalated,
      topKeywordsNonEscalated,
      successRateByHour,
      escalationRateByDuration,
      avgDurationByPtpStatus,
      outcomeChartData,
      durationChartData,
      keywordChartData,
      callsByDate,
    };
  }, [rows]);

  if (loading) {
    return (
      <div style={{ padding: 16, background: "#212121", color: "white" }}>
        Loading CSV…
      </div>
    );
  }
  if (errorMsg) {
    return (
      <div style={{ padding: 16, color: "crimson", background: "#212121" }}>
        Error: {errorMsg}
      </div>
    );
  }

  // ==========================================================
  // JSX RENDERING (OUTPUT)
  // ==========================================================
 /* return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        background: "#212121",
        color: "white",
        minHeight: '100vh',
        width: '100vw',
        boxSizing: 'border-box',
        padding: '16px', 
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: 20}}>DEBT COLLECTION CALL DATA</h2>
      <h3 style={{ marginTop: 24, marginBottom: 16 }}>Basic Filters</h3>
      <div
        style={{
          display: "flex",
          gap: 20,
          padding: 10,
          border: "1px solid #333",
          borderRadius: 8,
          flexWrap: "wrap", 
          marginBottom: 20,
        }}
      >
        <select
          style={{
            padding: 8,
            background: "#333",
            color: "white",
            border: "none",
          }}
          value={selectedOutcome}
          onChange={(e) => setSelectedOutcome(e.target.value)}
        >
          <option value="All">All Outcomes</option>
          <option value="PTP">PTP Captured (TRUE)</option>
          <option value="Escalation">Escalation (TRUE)</option>
          <option value="RTP">RTP Flagged (TRUE)</option>
        </select>
        <div style={{ color: "#aaa", display: "flex", alignItems: "center" }}>
          Date Range: [Date Picker UI Placeholder]
        </div>
      </div>
      {/* Task 1: Basic Stat Cards */ /*}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginTop: 20,
          marginBottom: 40,
        }}
      >
        <StatCard label="Total Calls" value={stats.total} /> {/* [cite: 97] */ /*}
        <StatCard label="Average Call Duration" value={stats.avgHMS} />{" "}
        {/* [cite: 100] */ /*}
        <StatCard
          label="PTP: True / False"
          value={
            String(stats.ptpCounts.true) + " / " + String(stats.ptpCounts.false)
          }
        />
        <StatCard
          label="RTP: True / False"
          value={
            String(stats.rtpCounts.true) + " / " + String(stats.rtpCounts.false)
          }
        />
        <StatCard
          label="Escalations: True / False"
          value={
            String(stats.escCounts.true) + " / " + String(stats.escCounts.false)
          }
        />
        <StatCard
          label="Success Rate (PTP %)"
          value={stats.successRate.toFixed(1) + "%"}
        />
        <StatCard
          label="Escalation Rate (%)"
          value={stats.escalationRate.toFixed(1) + "%"}
        />
        {/* Duration Stats */ /*}
        <StatCard
          label="Short Calls (< 2 min)"
          value={stats.durationCategoryCounts.Short}
        />
        <StatCard
          label="Medium Calls (2-5 min)"
          value={stats.durationCategoryCounts.Medium}
        />
        <StatCard
          label="Long Calls (> 5 min)"
          value={stats.durationCategoryCounts.Long}
        />
      </div>
      {/* Task 2: Core Visualizations */ /*}
      <h3 style={{ marginTop: 40, marginBottom: 20 }}>Core Visualizations</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
          gap: 24,
          background: "#333",
          padding: 20,
          borderRadius: 8,
          marginBottom: 40,
        }}
      >
        {/* Bar Chart: PTP, RTP, Escalations Count [cite: 103] */ /*}
        <div
          style={{
            height: 350,
            background: "white",
            padding: 40,
            borderRadius: 4,
            minWidth: 0
          }}
        >
          <h4 style={{ color: "#333", textAlign: "center" }}>
            PTP, RTP, & Escalation Counts
          </h4>
          <OutcomeBarChart data={stats.outcomeChartData} />
        </div>

        {/* Pie Chart: Call Duration Distribution [cite: 106] */ /*} 
        <div
          style={{
            height: 350,
            background: "white",
            padding: 40,
            borderRadius: 4,
minWidth: 0
          }}
        >
          <h4 style={{ color: "#333", textAlign: "center" }}>
            Call Duration Distribution
          </h4>
          <DurationPieChart data={stats.durationChartData} />
        </div>

        {/* Bar Chart: Top 10 Keywords [cite: 105] */ /*}
        <div
          style={{
            height: 350,
            background: "white",
            padding: 60,
            borderRadius: 4,
minWidth: 0
          }}
        >
          <h4 style={{ color: "#333", textAlign: "center" }}>
            Top 10 Keywords (Escalated)
          </h4>
          <KeywordBarChart data={stats.keywordChartData} />
        </div>

        {/* Line Chart: Calls Over Time (Daily Trend) [cite: 104] */ /*}
        <div
          style={{
            height: 350,
            background: "white",
            padding: 40,
            borderRadius: 4,
minWidth: 0
          }}
        >
          <h4 style={{ color: "#333", textAlign: "center" }}>
            Calls Over Time (Daily Trend)
          </h4>
          <CallsOverTimeChart data={stats.callsByDate} />
        </div>
      </div>
      {/* Task 4: Insights Section */ /*}
      <h3 style={{ marginTop: 40, marginBottom: 20 }}>Key Insights</h3> {/* [cite: 110] */ /*}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 12,
marginBottom: 40,
        }}
      >
        <InsightCard
          title="Escalation Risk"
          text={`The overall escalation rate is high (${stats.escalationRate.toFixed(
            1
          )}%). Long calls (> 5 min) have an escalation rate of ${
            stats.escalationRateByDuration
              .find((d) => d.category === "Long")
              ?.escalationRate.toFixed(1) || 0
          }%, suggesting complex issues require supervisor intervention.`}
        />
        <InsightCard
          title="Average Success Duration"
          text={`PTP-captured calls take an average of ${
            stats.avgDurationByPtpStatus
              .find((d) => d.ptpStatus === "PTP Captured")
              ?.avgDurationMinutes.toFixed(2) || 0
          } minutes, indicating that successful resolution requires sustained effort.`}
        />
        <InsightCard
          title="Keyword Focus"
          text={`The top keywords in escalated calls ('payment', 'card', 'credit') confirm that friction is concentrated around financial transaction details and account status.`}
        />
        <InsightCard
          title="PTP Capture Rate"
          text={`Only ${stats.successRate.toFixed(
            1
          )}% of total calls result in a PTP. Compare this to the success rate by hour to find the optimal calling window.`}
        />
        <InsightCard
          title="Short Call Volume"
          text={`The highest volume is in the Short category, at ${stats.durationCategoryCounts.Short} calls. This may indicate abandoned attempts or very quick information transfers.`}
        />
      </div>

      {/* Raw Statistical Analysis (for inspection) */ /*}
      <h3 style={{ marginTop: 32, marginBottom: 20 }}>Basic Statistical Analysis (Raw Data)</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 16,
marginBottom: 40,
        }}
      >
        <AnalysisBox
          title="Success Rate by Hour of Day"
          data={stats.successRateByHour}
        />
        <AnalysisBox
          title="Escalation Rate by Duration Category"
          data={stats.escalationRateByDuration}
        />
        <AnalysisBox
          title="Average Duration by PTP Status"
          data={stats.avgDurationByPtpStatus}
        />
      </div>

      {/* Text Analysis Output */ /*}
      <h3 style={{ marginTop: 32, marginBottom: 20 }}>Call Summary Keyword Analysis</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 40 }}>
        <KeywordList
          title="Top 10 Keywords in ESCALATED Calls"
          keywords={stats.topKeywordsEscalated}
          isEscalated={true}
        />
        <KeywordList
          title="Top 10 Keywords in NON-ESCALATED Calls"
          keywords={stats.topKeywordsNonEscalated}
          isEscalated={false}
        />
      </div>
      {/* Sample Rows */ /*}
      <h3 style={{ marginTop: 24, marginBottom: 8 }}>Sample Rows</h3>
      <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>
        Showing the first 5 rows so you can confirm columns look right.
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          textAlign: "left",
          color: "white",
        }}
      >
        <thead>
          <tr style={{ backgroundColor: "#424242" }}>
            <th style={{ padding: "8px" }}>customer_id</th>
            <th style={{ padding: "8px" }}>ptp</th>
            <th style={{ padding: "8px" }}>rtp</th>
            <th style={{ padding: "8px" }}>call_duration</th>
            <th style={{ padding: "8px" }}>escalation</th>
            <th style={{ padding: "8px" }}>Minutes</th>
            <th style={{ padding: "8px" }}>Category</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((r, idx) => {
            const durationMinutes = hmsToMinutes(r.call_duration);
            const durationCategory = categorizeDuration(durationMinutes);

            return (
              <tr
                key={idx}
                style={{
                  borderBottom: "1px solid #666",
                  backgroundColor: idx % 2 === 0 ? "#303030" : "#212121",
                }}
              >
                <td style={{ padding: "8px" }}>{r.customer_id}</td>
                <td style={{ padding: "8px" }}>{String(r.ptp)}</td>
                <td style={{ padding: "8px" }}>{String(r.rtp)}</td>
                <td style={{ padding: "8px" }}>{r.call_duration}</td>
                <td style={{ padding: "8px" }}>{String(r.escalation)}</td>
                <td style={{ padding: "8px" }}>{durationMinutes.toFixed(2)}</td>
                <td style={{ padding: "8px" }}>{durationCategory}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
</div>
  ); */

return (
  <div
    style={{
      width: "100vw",
      minHeight: "100vh",
      background: "#212121",
      color: "white",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      boxSizing: "border-box"
    }}
  >
    {/* Center all content with maxWidth and padding for whitespace */}
    <div style={{
      maxWidth: 1200,
      margin: "0 auto",
      padding: "32px 24px 24px 24px",
      width: "100%"
    }}>
      <h2 style={{ fontWeight: 800, marginTop: 0, marginBottom: 10, fontSize: 30, letterSpacing: 1 }}>DEBT COLLECTION CALL DATA</h2>
      <h3 style={{ fontWeight: 600, fontSize: 22, marginTop: 16, marginBottom: 16 }}>Basic Filters</h3>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 20,
          padding: 14,
          border: "1px solid #333",
          borderRadius: 10,
          background: "#232323",
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <select
          style={{
            padding: 10,
            background: "#333",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontSize: 16,
          }}
          value={selectedOutcome}
          onChange={(e) => setSelectedOutcome(e.target.value)}
        >
          <option value="All">All Outcomes</option>
          <option value="PTP">PTP Captured (TRUE)</option>
          <option value="Escalation">Escalation (TRUE)</option>
          <option value="RTP">RTP Flagged (TRUE)</option>
        </select>
        <div style={{ color: "#aaa", display: "flex", alignItems: "center", fontSize: 16 }}>
          Date Range: [Date Picker UI Placeholder]
        </div>
      </div>

      {/* Stat Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 20,
          marginTop: 24,
          marginBottom: 32,
        }}
      >
        {/* Add card styling inside StatCard as shown below */}
        <StatCard label="Total Calls" value={stats.total} />
        <StatCard label="Average Call Duration" value={stats.avgHMS} />
        <StatCard label="PTP: True / False" value={`${stats.ptpCounts.true} / ${stats.ptpCounts.false}`} />
        <StatCard label="RTP: True / False" value={`${stats.rtpCounts.true} / ${stats.rtpCounts.false}`} />
        <StatCard label="Escalations: True / False" value={`${stats.escCounts.true} / ${stats.escCounts.false}`} />
        <StatCard label="Success Rate (PTP %)" value={stats.successRate.toFixed(1) + "%"} />
        <StatCard label="Escalation Rate (%)" value={stats.escalationRate.toFixed(1) + "%"} />
        <StatCard label="Short Calls (< 2 min)" value={stats.durationCategoryCounts.Short} />
        <StatCard label="Medium Calls (2-5 min)" value={stats.durationCategoryCounts.Medium} />
        <StatCard label="Long Calls (> 5 min)" value={stats.durationCategoryCounts.Long} />
      </div>

      {/* Core Visualizations */}
      <h3 style={{ fontWeight: 600, fontSize: 20, marginTop: 32, marginBottom: 16 }}>Core Visualizations</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
          gap: 28,
          marginBottom: 40,
        }}
      >
        {/* Card container for each chart */}
        <div
          style={{
            background: "#232323",
            borderRadius: 10,
            boxShadow: "0 2px 8px #00000012",
            padding: 32,
            minHeight: 380,
            minWidth: 0,
            height: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h4 style={{ color: "#eee", textAlign: "center", marginBottom: 12 }}>
            PTP, RTP, & Escalation Counts
          </h4>
          <OutcomeBarChart data={stats.outcomeChartData} />
        </div>
        <div style={{
          background: "#232323",
          borderRadius: 10,
          boxShadow: "0 2px 8px #00000012",
          padding: 32,
          minHeight: 380,
          minWidth: 0,
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}>
          <h4 style={{ color: "#eee", textAlign: "center", marginBottom: 12 }}>
            Call Duration Distribution
          </h4>
          <DurationPieChart data={stats.durationChartData} />
        </div>
        <div style={{
          background: "#232323",
          borderRadius: 10,
          boxShadow: "0 2px 8px #00000012",
          padding: 32,
          minHeight: 380,
          minWidth: 0,
          height: "100%",
          display: "flex",
          flexDirection: "column"
        }}>
          <h4 style={{ color: "#eee", textAlign: "center", marginBottom: 12 }}>
            Top 10 Keywords (Escalated)
          </h4>
          <KeywordBarChart data={stats.keywordChartData} />
        </div>
        <div style={{
          background: "#232323",
          borderRadius: 10,
          boxShadow: "0 2px 8px #00000012",
          padding: 32,
          minHeight: 380,
          minWidth: 0,
          height: "100%",
          display: "flex",
          flexDirection: "column"
        }}>
          <h4 style={{ color: "#eee", textAlign: "center", marginBottom: 12 }}>
            Calls Over Time (Daily Trend)
          </h4>
          <CallsOverTimeChart data={stats.callsByDate} />
        </div>
      </div>

      {/* Insights Section */}
      <h3 style={{ fontWeight: 600, fontSize: 20, marginTop: 32, marginBottom: 16 }}>Key Insights</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: 20,
          marginBottom: 36,
        }}
      >
        <InsightCard title="Escalation Risk" text={`The overall escalation rate is high (${stats.escalationRate.toFixed(1)}%). Long calls (> 5 min) have an escalation rate of ${stats.escalationRateByDuration.find((d) => d.category === "Long")?.escalationRate.toFixed(1) || 0}%, suggesting complex issues require supervisor intervention.`} />
        <InsightCard title="Average Success Duration" text={`PTP-captured calls take an average of ${stats.avgDurationByPtpStatus.find((d) => d.ptpStatus === "PTP Captured")?.avgDurationMinutes.toFixed(2) || 0} minutes, indicating that successful resolution requires sustained effort.`} />
        <InsightCard title="Keyword Focus" text={`The top keywords in escalated calls ('payment', 'card', 'credit') confirm that friction is concentrated around financial transaction details and account status.`} />
        <InsightCard title="PTP Capture Rate" text={`Only ${stats.successRate.toFixed(1)}% of total calls result in a PTP. Compare this to the success rate by hour to find the optimal calling window.`} />
        <InsightCard title="Short Call Volume" text={`The highest volume is in the Short category, at ${stats.durationCategoryCounts.Short} calls. This may indicate abandoned attempts or very quick information transfers.`} />
      </div>

      {/* Basic Statistical Analysis (Raw Data) */}
      <h3 style={{ fontWeight: 600, fontSize: 20, marginTop: 32, marginBottom: 16 }}>Basic Statistical Analysis (Raw Data)</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 18,
          marginBottom: 36,
        }}
      >
        <AnalysisBox title="Success Rate by Hour of Day" data={stats.successRateByHour} />
        <AnalysisBox title="Escalation Rate by Duration Category" data={stats.escalationRateByDuration} />
        <AnalysisBox title="Average Duration by PTP Status" data={stats.avgDurationByPtpStatus} />
      </div>

      {/* Call Summary Keyword Analysis */}
      <h3 style={{ fontWeight: 600, fontSize: 20, marginTop: 32, marginBottom: 16 }}>Call Summary Keyword Analysis</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          marginBottom: 36
        }}
      >
        <KeywordList title="Top 10 Keywords in ESCALATED Calls" keywords={stats.topKeywordsEscalated} isEscalated={true} />
        <KeywordList title="Top 10 Keywords in NON-ESCALATED Calls" keywords={stats.topKeywordsNonEscalated} isEscalated={false} />
      </div>

      {/* Sample Rows */}
      <h3 style={{ fontWeight: 600, fontSize: 20, marginTop: 28, marginBottom: 8 }}>Sample Rows</h3>
      <div style={{ fontSize: 13, color: "#999", marginBottom: 10 }}>
        Showing the first 5 rows so you can confirm columns look right.
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          textAlign: "left",
          color: "white",
          borderRadius: "8px",
          overflow: "hidden",
          background: "#232323",
          marginBottom: 36
        }}
      >
        <thead>
          <tr style={{ backgroundColor: "#353535" }}>
            <th style={{ padding: "10px", fontWeight: 700 }}>customer_id</th>
            <th style={{ padding: "10px", fontWeight: 700 }}>ptp</th>
            <th style={{ padding: "10px", fontWeight: 700 }}>rtp</th>
            <th style={{ padding: "10px", fontWeight: 700 }}>call_duration</th>
            <th style={{ padding: "10px", fontWeight: 700 }}>escalation</th>
            <th style={{ padding: "10px", fontWeight: 700 }}>Minutes</th>
            <th style={{ padding: "10px", fontWeight: 700 }}>Category</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((r, idx) => {
            const durationMinutes = hmsToMinutes(r.call_duration);
            const durationCategory = categorizeDuration(durationMinutes);
            return (
              <tr
                key={idx}
                style={{
                  borderBottom: "1px solid #494949",
                  backgroundColor: idx % 2 === 0 ? "#303030" : "#232323",
                }}
              >
                <td style={{ padding: "10px" }}>{r.customer_id}</td>
                <td style={{ padding: "10px" }}>{String(r.ptp)}</td>
                <td style={{ padding: "10px" }}>{String(r.rtp)}</td>
                <td style={{ padding: "10px" }}>{r.call_duration}</td>
                <td style={{ padding: "10px" }}>{String(r.escalation)}</td>
                <td style={{ padding: "10px" }}>{durationMinutes.toFixed(2)}</td>
                <td style={{ padding: "10px" }}>{durationCategory}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);


}