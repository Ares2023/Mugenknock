import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ color: "#232f3e", textAlign: "center" }}>AWS資格問題サービス</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 32 }}>
        <button
          onClick={() => navigate("/exercise/setup")}
          style={{ padding: "16px", fontSize: 18, background: "#ff9900", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}>
          演習モードを始める
        </button>
        <button
          onClick={() => navigate("/questions")}
          style={{ padding: "16px", fontSize: 18, background: "#232f3e", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}>
          問題一覧を見る
        </button>
      </div>
    </div>
  );
}
