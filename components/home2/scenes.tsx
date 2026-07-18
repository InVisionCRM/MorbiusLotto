import * as React from "react";

/**
 * Faithful port of the game-scene SVG artwork from public/home-nav-lab.html.
 * SceneDefs is the hidden shared material library (filters + gradients) that
 * every scene references via url(#...) — render it once on the page.
 */

export function SceneDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <filter id="fS" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#000" floodOpacity=".55" /></filter>
        <filter id="fS2" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.5" floodColor="#000" floodOpacity=".5" /></filter>
        <filter id="glGold" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#fbbf24" floodOpacity=".6" /></filter>
        <filter id="glCyan" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#22d3ee" floodOpacity=".6" /></filter>
        <filter id="glPink" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#ec4899" floodOpacity=".6" /></filter>
        <filter id="glGreen" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#34d399" floodOpacity=".6" /></filter>
        <filter id="glViolet" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#a78bfa" floodOpacity=".6" /></filter>
        <filter id="glRed" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#f87171" floodOpacity=".6" /></filter>
        <filter id="glOrange" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#fb923c" floodOpacity=".65" /></filter>

        <linearGradient id="gCard" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset=".55" stopColor="#f1f5f9" /><stop offset="1" stopColor="#cbd5e1" /></linearGradient>
        <linearGradient id="gGloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset=".4" stopColor="#fff" stopOpacity=".06" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <radialGradient id="gGold" cx=".32" cy=".25" r="1"><stop offset="0" stopColor="#fff7cc" /><stop offset=".35" stopColor="#fcd34d" /><stop offset=".72" stopColor="#f59e0b" /><stop offset="1" stopColor="#92400e" /></radialGradient>
        <linearGradient id="gGoldEdge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b45309" /><stop offset=".5" stopColor="#fbbf24" /><stop offset="1" stopColor="#78350f" /></linearGradient>
        <radialGradient id="gChipR" cx=".35" cy=".25" r="1"><stop offset="0" stopColor="#fecaca" /><stop offset=".4" stopColor="#ef4444" /><stop offset="1" stopColor="#7f1d1d" /></radialGradient>
        <radialGradient id="gChipC" cx=".35" cy=".25" r="1"><stop offset="0" stopColor="#cffafe" /><stop offset=".4" stopColor="#22d3ee" /><stop offset="1" stopColor="#155e75" /></radialGradient>
        <radialGradient id="gChipV" cx=".35" cy=".25" r="1"><stop offset="0" stopColor="#ede9fe" /><stop offset=".4" stopColor="#a78bfa" /><stop offset="1" stopColor="#4c1d95" /></radialGradient>
        <radialGradient id="gChipE" cx=".35" cy=".25" r="1"><stop offset="0" stopColor="#d1fae5" /><stop offset=".4" stopColor="#34d399" /><stop offset="1" stopColor="#065f46" /></radialGradient>

        <radialGradient id="feltG" cx=".5" cy=".3" r="1"><stop offset="0" stopColor="#166534" /><stop offset=".65" stopColor="#0b2e1c" /><stop offset="1" stopColor="#051710" /></radialGradient>
        <radialGradient id="feltB" cx=".5" cy=".3" r="1"><stop offset="0" stopColor="#0e4a68" /><stop offset=".65" stopColor="#082c40" /><stop offset="1" stopColor="#041520" /></radialGradient>
        <radialGradient id="feltP" cx=".5" cy=".3" r="1"><stop offset="0" stopColor="#4c1d95" /><stop offset=".65" stopColor="#2b1065" /><stop offset="1" stopColor="#140838" /></radialGradient>
        <radialGradient id="feltR" cx=".5" cy=".3" r="1"><stop offset="0" stopColor="#7f1d1d" /><stop offset=".65" stopColor="#450a0a" /><stop offset="1" stopColor="#210404" /></radialGradient>

        <radialGradient id="gOrbC" cx=".33" cy=".28" r="1"><stop offset="0" stopColor="#ecfeff" /><stop offset=".3" stopColor="#67e8f9" /><stop offset=".75" stopColor="#0891b2" /><stop offset="1" stopColor="#164e63" /></radialGradient>
        <radialGradient id="gOrbP" cx=".33" cy=".28" r="1"><stop offset="0" stopColor="#fdf2f8" /><stop offset=".3" stopColor="#f9a8d4" /><stop offset=".75" stopColor="#db2777" /><stop offset="1" stopColor="#831843" /></radialGradient>
        <radialGradient id="gGem" cx=".35" cy=".3" r="1"><stop offset="0" stopColor="#ecfdf5" /><stop offset=".35" stopColor="#6ee7b7" /><stop offset=".8" stopColor="#059669" /><stop offset="1" stopColor="#064e3b" /></radialGradient>

        <linearGradient id="gDiceTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#d5deea" /></linearGradient>
        <linearGradient id="gDiceFront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#eef3f9" /><stop offset="1" stopColor="#a9b9cd" /></linearGradient>
        <linearGradient id="gDiceSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c6d2e1" /><stop offset="1" stopColor="#7e90a8" /></linearGradient>
        <linearGradient id="gVDiceTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f3f0ff" /><stop offset="1" stopColor="#c4b5fd" /></linearGradient>
        <linearGradient id="gVDiceFront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c4b5fd" /><stop offset="1" stopColor="#7c3aed" /></linearGradient>
        <linearGradient id="gVDiceSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#5b21b6" /></linearGradient>
        <linearGradient id="gRDiceTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fecaca" /><stop offset="1" stopColor="#f87171" /></linearGradient>
        <linearGradient id="gRDiceFront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f87171" /><stop offset="1" stopColor="#b91c1c" /></linearGradient>
        <linearGradient id="gRDiceSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#dc2626" /><stop offset="1" stopColor="#7f1d1d" /></linearGradient>
        <linearGradient id="gGDiceTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fef3c7" /><stop offset="1" stopColor="#fbbf24" /></linearGradient>
        <linearGradient id="gGDiceFront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fbbf24" /><stop offset="1" stopColor="#b45309" /></linearGradient>
        <linearGradient id="gGDiceSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d97706" /><stop offset="1" stopColor="#92400e" /></linearGradient>

        <linearGradient id="gSteel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#94a3b8" /><stop offset=".5" stopColor="#475569" /><stop offset="1" stopColor="#1e293b" /></linearGradient>
        <radialGradient id="gSteelR" cx=".4" cy=".35" r="1"><stop offset="0" stopColor="#cbd5e1" /><stop offset=".5" stopColor="#64748b" /><stop offset="1" stopColor="#1e293b" /></radialGradient>
        <radialGradient id="gPeg" cx=".35" cy=".3" r="1"><stop offset="0" stopColor="#f8fafc" /><stop offset=".6" stopColor="#94a3b8" /><stop offset="1" stopColor="#334155" /></radialGradient>
        <linearGradient id="gScreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#10283b" /><stop offset="1" stopColor="#050d14" /></linearGradient>
        <linearGradient id="gFlame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fde68a" /><stop offset=".55" stopColor="#fb923c" /><stop offset="1" stopColor="#ea580c" /></linearGradient>
        <linearGradient id="gShaft" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fde68a" stopOpacity=".75" /><stop offset="1" stopColor="#fde68a" stopOpacity="0" /></linearGradient>
        <linearGradient id="gCurve" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#fb7185" /></linearGradient>
        <linearGradient id="gAreaPink" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fb7185" stopOpacity=".45" /><stop offset="1" stopColor="#fb7185" stopOpacity="0" /></linearGradient>
        <linearGradient id="gTile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#33415c" /><stop offset="1" stopColor="#17203a" /></linearGradient>
        <radialGradient id="gMine" cx=".38" cy=".3" r="1"><stop offset="0" stopColor="#64748b" /><stop offset=".55" stopColor="#1e293b" /><stop offset="1" stopColor="#020617" /></radialGradient>
      </defs>
    </svg>
  );
}

/* ── TONIGHT'S TABLE (spot-grid) scenes ─────────────────────────────── */

export function PlinkoScene() {
  return (
    <svg viewBox="0 0 240 170">
      <path d="M120 4 L232 138 L8 138 Z" fill="#0d1526" stroke="#22364f" strokeWidth="1.5" />
      <path d="M120 4 L232 138 L8 138 Z" fill="none" stroke="#3b82f6" strokeOpacity=".12" strokeWidth="4" />
      <path d="M120 6 L166 138 L74 138 Z" fill="#22d3ee" opacity=".05" />
      <g>
        <circle cx="120" cy="30" r="4.5" fill="url(#gPeg)" />
        <circle cx="100" cy="54" r="4.5" fill="url(#gPeg)" /><circle cx="140" cy="54" r="4.5" fill="url(#gOrbC)" filter="url(#glCyan)" />
        <circle cx="80" cy="78" r="4.5" fill="url(#gPeg)" /><circle cx="120" cy="78" r="4.5" fill="url(#gOrbC)" filter="url(#glCyan)" /><circle cx="160" cy="78" r="4.5" fill="url(#gPeg)" />
        <circle cx="60" cy="102" r="4.5" fill="url(#gPeg)" /><circle cx="100" cy="102" r="4.5" fill="url(#gPeg)" /><circle cx="140" cy="102" r="4.5" fill="url(#gPeg)" /><circle cx="180" cy="102" r="4.5" fill="url(#gPeg)" />
        <circle cx="40" cy="126" r="4.5" fill="url(#gPeg)" /><circle cx="80" cy="126" r="4.5" fill="url(#gPeg)" /><circle cx="120" cy="126" r="4.5" fill="url(#gPeg)" /><circle cx="160" cy="126" r="4.5" fill="url(#gPeg)" /><circle cx="200" cy="126" r="4.5" fill="url(#gPeg)" />
      </g>
      <circle cx="150" cy="40" r="7" fill="url(#gOrbC)" opacity=".18" />
      <circle cx="140" cy="56" r="8" fill="url(#gOrbC)" opacity=".3" />
      <circle cx="126" cy="76" r="9" fill="url(#gOrbC)" opacity=".5" />
      <g filter="url(#glCyan)">
        <circle cx="108" cy="104" r="10" fill="url(#gOrbC)">
          
        </circle>
        <ellipse cx="104" cy="99" rx="3.4" ry="2.2" fill="#fff" opacity=".85">
          
        </ellipse>
      </g>
      <ellipse cx="108" cy="132" rx="11" ry="2.6" fill="#000" opacity=".45" />
      <g filter="url(#fS2)" fontSize="8.5" fontWeight="800" textAnchor="middle">
        <g opacity=".65"><rect x="26" y="146" width="38" height="16" rx="4" fill="url(#gGoldEdge)" /><rect x="26" y="142" width="38" height="10" rx="4" fill="url(#gGold)" /><text x="45" y="151" fill="#57340a">×16</text></g>
        <g opacity=".85"><rect x="69" y="146" width="38" height="16" rx="4" fill="url(#gGoldEdge)" /><rect x="69" y="142" width="38" height="10" rx="4" fill="url(#gGold)" /><text x="88" y="151" fill="#57340a">×2</text></g>
        <g filter="url(#glGold)"><rect x="112" y="146" width="38" height="16" rx="4" fill="url(#gGoldEdge)" /><rect x="112" y="142" width="38" height="10" rx="4" fill="url(#gGold)" /><text x="131" y="151" fill="#57340a">×1000</text></g>
        <g opacity=".85"><rect x="155" y="146" width="38" height="16" rx="4" fill="url(#gGoldEdge)" /><rect x="155" y="142" width="38" height="10" rx="4" fill="url(#gGold)" /><text x="174" y="151" fill="#57340a">×2</text></g>
        <g opacity=".65"><rect x="198" y="146" width="30" height="16" rx="4" fill="url(#gGoldEdge)" /><rect x="198" y="142" width="30" height="10" rx="4" fill="url(#gGold)" /><text x="213" y="151" fill="#57340a">×16</text></g>
      </g>
    </svg>
  );
}

export function CrashScene() {
  return (
    <svg viewBox="0 0 200 140">
      <g stroke="#182238" strokeWidth="1">
        <path d="M16 24 H186 M16 56 H186 M16 88 H186" />
        <path d="M50 14 V122 M96 14 V122 M142 14 V122" />
      </g>
      <g fontSize="7" fontWeight="700" fill="#3b4a63"><text x="6" y="27">10×</text><text x="6" y="59">5×</text><text x="6" y="91">2×</text></g>
      <path d="M14 120 Q90 114 128 72 T184 16 L184 120 Z" fill="url(#gAreaPink)" />
      <path d="M14 120 Q90 114 128 72 T184 16" stroke="url(#gCurve)" strokeWidth="4.5" fill="none" strokeLinecap="round" filter="url(#glPink)" />
      <g transform="translate(176,22) rotate(38)" filter="url(#fS2)">
        <ellipse cx="0" cy="0" rx="7.5" ry="15" fill="url(#gSteel)" />
        <path d="M-7.5 -4 Q0 -22 7.5 -4 Q0 -10 -7.5 -4Z" fill="url(#gGoldEdge)" />
        <circle cx="0" cy="-3" r="3.4" fill="url(#gOrbC)" />
        <path d="M-7 8 L-13 17 L-5 13 Z" fill="#fb7185" /><path d="M7 8 L13 17 L5 13 Z" fill="#fb7185" />
        <path d="M-3.5 14 Q0 26 3.5 14 Q0 18 -3.5 14Z" fill="url(#gFlame)"></path>
      </g>
      <circle cx="158" cy="44" r="1.6" fill="#fbbf24"></circle>
      <circle cx="146" cy="58" r="1.3" fill="#fb7185"></circle>
      <text x="24" y="38" fontSize="24" fill="#fda4af" fontFamily="'Bowlby One SC'" filter="url(#glPink)">12.4×</text>
    </svg>
  );
}

export function MinesScene() {
  return (
    <svg viewBox="0 0 200 140">
      <g>
        <rect x="28" y="22" width="40" height="40" rx="7" fill="#0b1322" /><rect x="28" y="18" width="40" height="40" rx="7" fill="url(#gTile)" stroke="#2b3a55" /><rect x="28" y="18" width="40" height="20" rx="7" fill="url(#gGloss)" opacity=".25" />
        <rect x="80" y="22" width="40" height="40" rx="7" fill="#0b1322" /><rect x="80" y="18" width="40" height="40" rx="7" fill="url(#gTile)" stroke="#2b3a55" /><rect x="80" y="18" width="40" height="20" rx="7" fill="url(#gGloss)" opacity=".25" />
        <rect x="132" y="22" width="40" height="40" rx="7" fill="#0b1322" /><rect x="132" y="18" width="40" height="40" rx="7" fill="#0a2018" stroke="#155e46" />
        <g filter="url(#glGreen)">
          <path d="M152 24 L164 38 L152 54 L140 38 Z" fill="url(#gGem)" />
          <path d="M152 24 L158 38 L152 54 L146 38 Z" fill="#fff" opacity=".22" />
          <path d="M140 38 L164 38 L152 54 Z" fill="#022c22" opacity=".3" />
          <circle cx="147" cy="31" r="1.6" fill="#fff" opacity=".9"></circle>
        </g>
        <rect x="28" y="74" width="40" height="40" rx="7" fill="#0b1322" /><rect x="28" y="70" width="40" height="40" rx="7" fill="#0a2018" stroke="#155e46" />
        <path d="M48 76 L60 90 L48 106 L36 90 Z" fill="url(#gGem)" /><path d="M48 76 L54 90 L48 106 L42 90 Z" fill="#fff" opacity=".22" /><path d="M36 90 L60 90 L48 106 Z" fill="#022c22" opacity=".3" />
        <rect x="80" y="74" width="40" height="40" rx="7" fill="#0b1322" /><rect x="80" y="70" width="40" height="40" rx="7" fill="#220b10" stroke="#7f1d1d" />
        <g>
          <circle cx="100" cy="92" r="11" fill="url(#gMine)" />
          <ellipse cx="96" cy="87" rx="3.6" ry="2.4" fill="#cbd5e1" opacity=".5" />
          <path d="M100 78 v-6" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="100" cy="70" r="2.4" fill="url(#gFlame)" filter="url(#glOrange)"></circle>
          <circle cx="100" cy="92" r="14" fill="none" stroke="#fb7185" strokeWidth="1.5" opacity=".4"></circle>
        </g>
        <rect x="132" y="74" width="40" height="40" rx="7" fill="#0b1322" /><rect x="132" y="70" width="40" height="40" rx="7" fill="url(#gTile)" stroke="#2b3a55" /><rect x="132" y="70" width="40" height="20" rx="7" fill="url(#gGloss)" opacity=".25" />
      </g>
    </svg>
  );
}

/* ── THE FLOOR (floor-grid) scenes ──────────────────────────────────── */

export function BlackjackScene() {
  return (
    <svg viewBox="0 0 200 140">
      <ellipse cx="100" cy="112" rx="92" ry="24" fill="url(#feltG)" />
      <path d="M30 118 Q100 96 170 118" stroke="#fbbf24" strokeOpacity=".3" strokeWidth="1.2" fill="none" />
      <text x="100" y="128" fontSize="5.5" fontWeight="700" fill="#86efac" fillOpacity=".5" textAnchor="middle" letterSpacing="2">BLACKJACK PAYS 3 TO 2</text>
      <g transform="rotate(-9 73 55)" filter="url(#fS2)">
        <rect x="52" y="26" width="42" height="58" rx="5" fill="url(#gCard)" stroke="#94a3b8" strokeOpacity=".4" />
        <rect x="52" y="26" width="42" height="58" rx="5" fill="url(#gGloss)" />
        <text x="57" y="42" fontSize="13" fontWeight="800" fill="#dc2626">A</text>
        <text x="57" y="52" fontSize="9" fill="#dc2626">♥</text>
        <text x="73" y="66" fontSize="20" fill="#dc2626" textAnchor="middle">♥</text>
      </g>
      <g transform="rotate(8 123 53)" filter="url(#fS2)">
        <rect x="102" y="24" width="42" height="58" rx="5" fill="url(#gCard)" stroke="#94a3b8" strokeOpacity=".4" />
        <rect x="102" y="24" width="42" height="58" rx="5" fill="url(#gGloss)" />
        <text x="107" y="40" fontSize="13" fontWeight="800" fill="#0f172a">J</text>
        <text x="107" y="50" fontSize="9" fill="#0f172a">♠</text>
        <text x="123" y="64" fontSize="20" fill="#0f172a" textAnchor="middle">♠</text>
      </g>
      <g filter="url(#fS2)">
        <ellipse cx="160" cy="108" rx="14" ry="5.5" fill="#78350f" /><ellipse cx="160" cy="104" rx="14" ry="5.5" fill="#b45309" />
        <ellipse cx="160" cy="100" rx="14" ry="5.5" fill="url(#gGold)" />
        <ellipse cx="160" cy="100" rx="14" ry="5.5" fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray="4 5" opacity=".8" />
        <ellipse cx="160" cy="100" rx="7.5" ry="3" fill="none" stroke="#78350f" strokeOpacity=".5" strokeWidth=".8" />
      </g>
      <g filter="url(#fS2)">
        <ellipse cx="36" cy="110" rx="12" ry="4.8" fill="#155e75" />
        <ellipse cx="36" cy="106" rx="12" ry="4.8" fill="url(#gChipC)" />
        <ellipse cx="36" cy="106" rx="12" ry="4.8" fill="none" stroke="#fff" strokeWidth="1.3" strokeDasharray="3.5 4.5" opacity=".8" />
      </g>
    </svg>
  );
}

export function PokerScene() {
  return (
    <svg viewBox="0 0 200 140">
      <ellipse cx="100" cy="112" rx="92" ry="24" fill="url(#feltP)" />
      <path d="M30 118 Q100 98 170 118" stroke="#a78bfa" strokeOpacity=".25" strokeWidth="1.2" fill="none" />
      <g filter="url(#fS2)">
        <g transform="rotate(-16 51 58)"><rect x="34" y="34" width="34" height="48" rx="4" fill="url(#gCard)" stroke="#94a3b8" strokeOpacity=".4" /><rect x="34" y="34" width="34" height="48" rx="4" fill="url(#gGloss)" /><text x="39" y="48" fontSize="10" fontWeight="800" fill="#0f172a">A</text><text x="39" y="57" fontSize="8" fill="#0f172a">♣</text></g>
        <g transform="rotate(-7 81 52)"><rect x="64" y="28" width="34" height="48" rx="4" fill="url(#gCard)" stroke="#94a3b8" strokeOpacity=".4" /><rect x="64" y="28" width="34" height="48" rx="4" fill="url(#gGloss)" /><text x="69" y="42" fontSize="10" fontWeight="800" fill="#dc2626">K</text><text x="69" y="51" fontSize="8" fill="#dc2626">♥</text></g>
        <g><rect x="96" y="26" width="34" height="48" rx="4" fill="url(#gCard)" stroke="#94a3b8" strokeOpacity=".4" /><rect x="96" y="26" width="34" height="48" rx="4" fill="url(#gGloss)" /><text x="101" y="40" fontSize="10" fontWeight="800" fill="#dc2626">Q</text><text x="101" y="49" fontSize="8" fill="#dc2626">♦</text><text x="113" y="60" fontSize="13" fill="#dc2626" textAnchor="middle">♦</text></g>
        <g transform="rotate(7 145 52)"><rect x="128" y="28" width="34" height="48" rx="4" fill="url(#gCard)" stroke="#94a3b8" strokeOpacity=".4" /><rect x="128" y="28" width="34" height="48" rx="4" fill="url(#gGloss)" /><text x="133" y="42" fontSize="10" fontWeight="800" fill="#0f172a">J</text><text x="133" y="51" fontSize="8" fill="#0f172a">♠</text></g>
      </g>
      <g filter="url(#fS2)">
        <ellipse cx="76" cy="106" rx="13" ry="5" fill="#4c1d95" />
        <ellipse cx="76" cy="102" rx="13" ry="5" fill="url(#gChipV)" />
        <ellipse cx="76" cy="102" rx="13" ry="5" fill="none" stroke="#fff" strokeWidth="1.4" strokeDasharray="4 5" opacity=".8" />
      </g>
      <g filter="url(#fS2)">
        <circle cx="126" cy="103" r="8" fill="url(#gCard)" />
        <circle cx="126" cy="103" r="8" fill="none" stroke="#94a3b8" strokeOpacity=".6" />
        <text x="126" y="106.5" fontSize="8.5" fontWeight="800" fill="#0f172a" textAnchor="middle">D</text>
      </g>
    </svg>
  );
}

export function KenoScene() {
  return (
    <svg viewBox="0 0 200 140">
      <ellipse cx="100" cy="116" rx="88" ry="18" fill="url(#feltB)" />
      <g textAnchor="middle">
        <g filter="url(#fS2)"><circle cx="52" cy="46" r="17" fill="url(#gOrbC)" /><ellipse cx="46" cy="39" rx="5.5" ry="3.5" fill="#fff" opacity=".8" /><text x="52" y="51" fontSize="13" fontWeight="800" fill="#03242e">7</text></g>
        <g filter="url(#fS2)"><circle cx="100" cy="34" r="17" fill="url(#gOrbC)" /><ellipse cx="94" cy="27" rx="5.5" ry="3.5" fill="#fff" opacity=".8" /><text x="100" y="39" fontSize="13" fontWeight="800" fill="#03242e">23</text></g>
        <g filter="url(#fS2)"><circle cx="148" cy="48" r="17" fill="url(#gOrbC)" /><ellipse cx="142" cy="41" rx="5.5" ry="3.5" fill="#fff" opacity=".8" /><text x="148" y="53" fontSize="13" fontWeight="800" fill="#03242e">41</text></g>
        <g filter="url(#glGold)"><circle cx="72" cy="92" r="18" fill="url(#gGold)"></circle><ellipse cx="65" cy="84" rx="6" ry="3.8" fill="#fff" opacity=".85" /><text x="72" y="97" fontSize="13" fontWeight="800" fill="#57340a">55</text></g>
        <g filter="url(#fS2)"><circle cx="126" cy="94" r="17" fill="url(#gOrbC)" /><ellipse cx="120" cy="87" rx="5.5" ry="3.5" fill="#fff" opacity=".8" /><text x="126" y="99" fontSize="13" fontWeight="800" fill="#03242e">12</text></g>
      </g>
      <ellipse cx="72" cy="116" rx="14" ry="3" fill="#000" opacity=".4" />
    </svg>
  );
}

export function DiceScene() {
  return (
    <svg viewBox="0 0 200 140">
      <ellipse cx="100" cy="114" rx="86" ry="20" fill="url(#feltB)" />
      <g transform="rotate(-10 70 68)" filter="url(#fS)">
        <path d="M46 46 L58 34 L102 34 L90 46 Z" fill="url(#gDiceTop)" />
        <path d="M90 46 L102 34 L102 78 L90 90 Z" fill="url(#gDiceSide)" />
        <rect x="46" y="46" width="44" height="44" rx="6" fill="url(#gDiceFront)" />
        <g fill="#1e293b"><circle cx="58" cy="58" r="4.2" /><circle cx="78" cy="58" r="4.2" /><circle cx="58" cy="78" r="4.2" /><circle cx="78" cy="78" r="4.2" /><circle cx="68" cy="68" r="4.2" /></g>
        <g fill="#334155" opacity=".8"><circle cx="66" cy="40" r="2.6" /><circle cx="82" cy="40" r="2.6" /></g>
      </g>
      <g transform="rotate(9 136 64)" filter="url(#fS)">
        <path d="M112 42 L124 30 L168 30 L156 42 Z" fill="url(#gGDiceTop)" />
        <path d="M156 42 L168 30 L168 74 L156 86 Z" fill="url(#gGDiceSide)" />
        <rect x="112" y="42" width="44" height="44" rx="6" fill="url(#gGDiceFront)" />
        <g fill="#57340a"><circle cx="124" cy="54" r="4.2" /><circle cx="144" cy="74" r="4.2" /><circle cx="134" cy="64" r="4.2" /></g>
        <g fill="#78350f" opacity=".85"><circle cx="140" cy="36" r="2.6" /></g>
      </g>
      <ellipse cx="70" cy="112" rx="26" ry="4.5" fill="#000" opacity=".4" />
      <ellipse cx="136" cy="108" rx="26" ry="4.5" fill="#000" opacity=".4" />
    </svg>
  );
}

export function RouletteScene() {
  return (
    <svg viewBox="0 0 200 140">
      <g transform="translate(100,72)">
        <circle r="60" fill="#0b0e16" filter="url(#fS)" />
        <circle r="58" fill="none" stroke="url(#gGoldEdge)" strokeWidth="5" />
        <circle r="53" fill="#1c2333" />
        <g>
          <g>
            <path d="M0 0 L0 -50 A50 50 0 0 1 25 -43.3 Z" fill="#b91c1c" /><path d="M0 0 L25 -43.3 A50 50 0 0 1 43.3 -25 Z" fill="#111827" />
            <path d="M0 0 L43.3 -25 A50 50 0 0 1 50 0 Z" fill="#b91c1c" /><path d="M0 0 L50 0 A50 50 0 0 1 43.3 25 Z" fill="#111827" />
            <path d="M0 0 L43.3 25 A50 50 0 0 1 25 43.3 Z" fill="#b91c1c" /><path d="M0 0 L25 43.3 A50 50 0 0 1 0 50 Z" fill="#111827" />
            <path d="M0 0 L0 50 A50 50 0 0 1 -25 43.3 Z" fill="#b91c1c" /><path d="M0 0 L-25 43.3 A50 50 0 0 1 -43.3 25 Z" fill="#111827" />
            <path d="M0 0 L-43.3 25 A50 50 0 0 1 -50 0 Z" fill="#b91c1c" /><path d="M0 0 L-50 0 A50 50 0 0 1 -43.3 -25 Z" fill="#111827" />
            <path d="M0 0 L-43.3 -25 A50 50 0 0 1 -25 -43.3 Z" fill="#b91c1c" /><path d="M0 0 L-25 -43.3 A50 50 0 0 1 0 -50 Z" fill="#15803d" />
          </g>
          <circle r="50" fill="none" stroke="#fbbf24" strokeOpacity=".35" strokeWidth="1" />
        </g>
        <circle r="30" fill="#141a2b" stroke="#39465f" strokeWidth="1.5" />
        <circle r="19" fill="url(#gSteelR)" />
        <circle r="7" fill="url(#gGold)" />
        <g stroke="url(#gGoldEdge)" strokeWidth="3.5" strokeLinecap="round"><path d="M0 -16 V-7 M0 7 V16 M-16 0 H-7 M7 0 H16" /></g>
        <g>
          <circle cx="0" cy="-41" r="4.5" fill="url(#gDiceTop)" filter="url(#fS2)" />
          <ellipse cx="-1.5" cy="-42.5" rx="1.6" ry="1.1" fill="#fff" />
        </g>
        <path d="M-60 -18 A60 60 0 0 1 -18 -60" fill="none" stroke="#fff" strokeOpacity=".12" strokeWidth="8" />
      </g>
    </svg>
  );
}

export function DiceX2Scene() {
  return (
    <svg viewBox="0 0 200 140">
      <ellipse cx="100" cy="114" rx="86" ry="20" fill="url(#feltP)" />
      <g transform="rotate(-9 68 66)" filter="url(#fS)">
        <path d="M46 48 L57 37 L97 37 L86 48 Z" fill="url(#gVDiceTop)" />
        <path d="M86 48 L97 37 L97 77 L86 88 Z" fill="url(#gVDiceSide)" />
        <rect x="46" y="48" width="40" height="40" rx="6" fill="url(#gVDiceFront)" />
        <g fill="#2e1065"><circle cx="57" cy="59" r="3.8" /><circle cx="75" cy="77" r="3.8" /><circle cx="66" cy="68" r="3.8" /></g>
      </g>
      <g transform="rotate(9 134 62)" filter="url(#fS)">
        <path d="M112 44 L123 33 L163 33 L152 44 Z" fill="url(#gVDiceTop)" />
        <path d="M152 44 L163 33 L163 73 L152 84 Z" fill="url(#gVDiceSide)" />
        <rect x="112" y="44" width="40" height="40" rx="6" fill="url(#gVDiceFront)" />
        <g fill="#2e1065"><circle cx="123" cy="55" r="3.8" /><circle cx="141" cy="55" r="3.8" /><circle cx="123" cy="73" r="3.8" /><circle cx="141" cy="73" r="3.8" /><circle cx="132" cy="64" r="3.8" /></g>
      </g>
      <ellipse cx="68" cy="110" rx="24" ry="4.5" fill="#000" opacity=".4" />
      <ellipse cx="134" cy="106" rx="24" ry="4.5" fill="#000" opacity=".4" />
      <text x="100" y="30" fontSize="17" fill="#c4b5fd" textAnchor="middle" fontFamily="'Bowlby One SC'" filter="url(#glViolet)">×2
        
      </text>
    </svg>
  );
}

export function TowersScene() {
  return (
    <svg viewBox="0 0 200 140">
      <ellipse cx="100" cy="122" rx="88" ry="12" fill="#0b1120" />
      <g filter="url(#fS2)">
        <path d="M30 104 L38 96 L178 96 L170 104 Z" fill="#3b4a63" /><rect x="30" y="104" width="140" height="16" rx="3" fill="url(#gTile)" />
        <path d="M46 82 L54 74 L162 74 L154 82 Z" fill="#43536e" /><rect x="46" y="82" width="108" height="16" rx="3" fill="url(#gTile)" />
        <path d="M62 60 L70 52 L146 52 L138 60 Z" fill="#4b5c78" /><rect x="62" y="60" width="76" height="16" rx="3" fill="url(#gTile)" />
        <path d="M78 38 L86 30 L130 30 L122 38 Z" fill="#566a88" /><rect x="78" y="38" width="44" height="16" rx="3" fill="url(#gTile)" />
      </g>
      <g stroke="#a78bfa" strokeOpacity=".2" strokeWidth="1"><path d="M30 112 H170 M46 90 H154 M62 68 H138" /></g>
      <g filter="url(#glViolet)">
        <circle cx="100" cy="22" r="9" fill="url(#gChipV)"></circle>
        <ellipse cx="97" cy="19" rx="3" ry="2" fill="#fff" opacity=".8"></ellipse>
      </g>
      <ellipse cx="100" cy="36" rx="9" ry="2" fill="#000" opacity=".45" />
    </svg>
  );
}

export function LimboScene() {
  return (
    <svg viewBox="0 0 200 140">
      <g stroke="#233047" strokeWidth="2" strokeLinecap="round">
        <path d="M28 96 l-6 3 M36 74 l-6 -3 M52 56 l-4 -5 M74 44 l-3 -6 M100 40 v-7 M126 44 l3 -6 M148 56 l4 -5 M164 74 l6 -3 M172 96 l6 3" />
      </g>
      <path d="M30 110 A76 76 0 0 1 170 110" stroke="#1f2937" strokeWidth="11" fill="none" strokeLinecap="round" />
      <path d="M30 110 A76 76 0 0 1 170 110" stroke="#000" strokeOpacity=".4" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M30 110 A76 76 0 0 1 128 46" stroke="url(#gGem)" strokeWidth="11" fill="none" strokeLinecap="round" filter="url(#glGreen)">
        
      </path>
      <circle cx="128" cy="46" r="7" fill="url(#gGem)" filter="url(#glGreen)" />
      <ellipse cx="126" cy="43.5" rx="2.4" ry="1.6" fill="#fff" opacity=".85" />
      <text x="100" y="100" fontSize="29" fill="#6ee7b7" textAnchor="middle" fontFamily="'Bowlby One SC'" filter="url(#glGreen)">2.87×</text>
      <text x="100" y="120" fontSize="7.5" fontWeight="800" letterSpacing="2" fill="#475569" textAnchor="middle">TARGET 2.00×</text>
    </svg>
  );
}

export function BaccaratScene() {
  return (
    <svg viewBox="0 0 200 140">
      <ellipse cx="100" cy="112" rx="92" ry="24" fill="url(#feltR)" />
      <path d="M28 116 Q100 96 172 116" stroke="#fbbf24" strokeOpacity=".3" strokeWidth="1.2" fill="none" />
      <g transform="rotate(-6 53 61)" filter="url(#fS2)">
        <rect x="34" y="34" width="38" height="54" rx="5" fill="url(#gCard)" stroke="#94a3b8" strokeOpacity=".4" />
        <rect x="34" y="34" width="38" height="54" rx="5" fill="url(#gGloss)" />
        <text x="39" y="48" fontSize="10" fontWeight="800" fill="#0f172a">9</text><text x="39" y="57" fontSize="8" fill="#0f172a">♠</text>
        <text x="53" y="68" fontSize="14" fill="#0f172a" textAnchor="middle">♠</text>
      </g>
      <g transform="rotate(6 147 61)" filter="url(#fS2)">
        <rect x="128" y="34" width="38" height="54" rx="5" fill="url(#gCard)" stroke="#94a3b8" strokeOpacity=".4" />
        <rect x="128" y="34" width="38" height="54" rx="5" fill="url(#gGloss)" />
        <text x="133" y="48" fontSize="10" fontWeight="800" fill="#dc2626">8</text><text x="133" y="57" fontSize="8" fill="#dc2626">♥</text>
        <text x="147" y="68" fontSize="14" fill="#dc2626" textAnchor="middle">♥</text>
      </g>
      <g filter="url(#glGold)">
        <circle cx="100" cy="62" r="13" fill="url(#gGold)" />
        <circle cx="100" cy="62" r="13" fill="none" stroke="#78350f" strokeOpacity=".4" />
        <text x="100" y="66" fontSize="9" fontWeight="800" fill="#57340a" textAnchor="middle">VS</text>
      </g>
      <g fontSize="7" fontWeight="800" letterSpacing="1.5" textAnchor="middle">
        <text x="53" y="104" fill="#cbd5e1">PLAYER</text><text x="147" y="104" fill="#fca5a5">BANKER</text>
      </g>
    </svg>
  );
}

export function VideoPokerScene() {
  return (
    <svg viewBox="0 0 200 140">
      <g filter="url(#fS)">
        <rect x="20" y="12" width="160" height="106" rx="13" fill="url(#gSteel)" />
        <rect x="23" y="15" width="154" height="100" rx="11" fill="#141b2b" />
      </g>
      <g fill="#0b1120"><circle cx="30" cy="22" r="1.6" /><circle cx="170" cy="22" r="1.6" /><circle cx="30" cy="108" r="1.6" /><circle cx="170" cy="108" r="1.6" /></g>
      <rect x="30" y="22" width="140" height="78" rx="7" fill="url(#gScreen)" stroke="#22d3ee" strokeOpacity=".4" />
      <g stroke="#22d3ee" strokeOpacity=".05" strokeWidth="1"><path d="M30 32 H170 M30 44 H170 M30 56 H170 M30 68 H170 M30 80 H170 M30 92 H170" /></g>
      <text x="100" y="35" fontSize="8" fill="#22d3ee" textAnchor="middle" letterSpacing="2.5" fontWeight="800" filter="url(#glCyan)">ROYAL FLUSH PAYS 800</text>
      <g filter="url(#fS2)">
        <g><rect x="38" y="42" width="22" height="32" rx="3" fill="url(#gCard)" /><rect x="38" y="42" width="22" height="32" rx="3" fill="url(#gGloss)" /><text x="41" y="54" fontSize="8" fontWeight="800" fill="#0f172a">A♠</text></g>
        <g><rect x="64" y="42" width="22" height="32" rx="3" fill="url(#gCard)" /><rect x="64" y="42" width="22" height="32" rx="3" fill="url(#gGloss)" /><text x="67" y="54" fontSize="8" fontWeight="800" fill="#dc2626">K♥</text></g>
        <g><rect x="90" y="42" width="22" height="32" rx="3" fill="url(#gCard)" /><rect x="90" y="42" width="22" height="32" rx="3" fill="url(#gGloss)" /><text x="93" y="54" fontSize="8" fontWeight="800" fill="#dc2626">Q♦</text></g>
        <g><rect x="116" y="42" width="22" height="32" rx="3" fill="url(#gCard)" /><rect x="116" y="42" width="22" height="32" rx="3" fill="url(#gGloss)" /><text x="119" y="54" fontSize="8" fontWeight="800" fill="#0f172a">J♣</text></g>
        <g opacity=".5"><rect x="142" y="42" width="22" height="32" rx="3" fill="url(#gCard)" /><text x="145" y="54" fontSize="8" fontWeight="800" fill="#475569">9♠</text></g>
      </g>
      <g textAnchor="middle">
        <g filter="url(#glGold)"><rect x="40" y="82" width="18" height="8" rx="4" fill="url(#gGold)" /><rect x="66" y="82" width="18" height="8" rx="4" fill="url(#gGold)" /><rect x="92" y="82" width="18" height="8" rx="4" fill="url(#gGold)" /><rect x="118" y="82" width="18" height="8" rx="4" fill="url(#gGold)" />
          </g>
        <text x="49" y="88" fontSize="5" fontWeight="800" fill="#57340a">HOLD</text><text x="75" y="88" fontSize="5" fontWeight="800" fill="#57340a">HOLD</text><text x="101" y="88" fontSize="5" fontWeight="800" fill="#57340a">HOLD</text><text x="127" y="88" fontSize="5" fontWeight="800" fill="#57340a">HOLD</text>
      </g>
      <rect x="82" y="106" width="36" height="7" rx="3.5" fill="url(#gChipC)" filter="url(#fS2)" />
    </svg>
  );
}

export function CrapsScene() {
  return (
    <svg viewBox="0 0 200 140">
      <ellipse cx="100" cy="112" rx="94" ry="26" fill="url(#feltG)" />
      <path d="M16 118 Q100 88 184 118" stroke="#fbbf24" strokeOpacity=".35" strokeWidth="1.5" fill="none" />
      <path d="M22 124 Q100 96 178 124" stroke="#fff" strokeOpacity=".12" strokeWidth="1" fill="none" />
      <text x="100" y="114" fontSize="8" fontWeight="800" fill="#86efac" fillOpacity=".7" textAnchor="middle" letterSpacing="3.5">PASS LINE</text>
      <g transform="rotate(-14 68 52)" filter="url(#fS)">
        <path d="M48 34 L58 24 L94 24 L84 34 Z" fill="url(#gRDiceTop)" />
        <path d="M84 34 L94 24 L94 60 L84 70 Z" fill="url(#gRDiceSide)" />
        <rect x="48" y="34" width="36" height="36" rx="6" fill="url(#gRDiceFront)" />
        <g fill="#fff"><circle cx="58" cy="44" r="3.4" /><circle cx="74" cy="60" r="3.4" /><circle cx="66" cy="52" r="3.4" /></g>
        
      </g>
      <g transform="rotate(12 132 46)" filter="url(#fS)">
        <path d="M112 30 L122 20 L158 20 L148 30 Z" fill="url(#gRDiceTop)" />
        <path d="M148 30 L158 20 L158 56 L148 66 Z" fill="url(#gRDiceSide)" />
        <rect x="112" y="30" width="36" height="36" rx="6" fill="url(#gRDiceFront)" />
        <g fill="#fff"><circle cx="122" cy="40" r="3.4" /><circle cx="138" cy="40" r="3.4" /><circle cx="122" cy="56" r="3.4" /><circle cx="138" cy="56" r="3.4" /></g>
        
      </g>
      <ellipse cx="66" cy="92" rx="20" ry="4" fill="#000" opacity=".4" />
      <ellipse cx="132" cy="86" rx="20" ry="4" fill="#000" opacity=".4" />
      <g filter="url(#fS2)">
        <ellipse cx="36" cy="100" rx="11" ry="4.4" fill="#78350f" />
        <ellipse cx="36" cy="96" rx="11" ry="4.4" fill="url(#gGold)" />
        <ellipse cx="36" cy="96" rx="11" ry="4.4" fill="none" stroke="#fff" strokeWidth="1.2" strokeDasharray="3 4" opacity=".8" />
      </g>
    </svg>
  );
}

export function DragonTigerScene() {
  return (
    <svg viewBox="0 0 200 140">
      <ellipse cx="100" cy="114" rx="92" ry="20" fill="url(#feltR)" />
      <g transform="rotate(-7 56 63)" filter="url(#fS)">
        <rect x="30" y="26" width="52" height="74" rx="6" fill="url(#feltR)" stroke="url(#gGoldEdge)" strokeWidth="2" />
        <rect x="35" y="31" width="42" height="64" rx="4" fill="none" stroke="#f87171" strokeOpacity=".45" />
        <path d="M44 78 Q40 62 52 54 Q64 46 58 36 Q72 44 64 58 Q58 68 66 76" stroke="#fca5a5" strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="60" cy="38" r="2.4" fill="#fde68a" />
        <text x="56" y="92" fontSize="9" fontWeight="800" fill="#fca5a5" textAnchor="middle" letterSpacing="1">DRAGON</text>
        <rect x="30" y="26" width="52" height="30" rx="6" fill="url(#gGloss)" opacity=".22" />
      </g>
      <g transform="rotate(7 144 63)" filter="url(#fS)">
        <rect x="118" y="26" width="52" height="74" rx="6" fill="url(#feltP)" stroke="url(#gGoldEdge)" strokeWidth="2" />
        <rect x="123" y="31" width="42" height="64" rx="4" fill="none" stroke="#fbbf24" strokeOpacity=".45" />
        <g stroke="url(#gGoldEdge)" strokeWidth="4" fill="none" strokeLinecap="round">
          <path d="M128 46 Q144 54 160 44" /><path d="M126 60 Q144 68 162 58" /><path d="M128 74 Q144 82 160 72" />
        </g>
        <text x="144" y="92" fontSize="9" fontWeight="800" fill="#fde68a" textAnchor="middle" letterSpacing="1.5">TIGER</text>
        <rect x="118" y="26" width="52" height="30" rx="6" fill="url(#gGloss)" opacity=".22" />
      </g>
      <path d="M104 30 L94 60 L102 60 L92 92 L112 56 L103 56 Z" fill="url(#gGold)" filter="url(#glGold)">
        
      </path>
    </svg>
  );
}

export function AndarBaharScene() {
  return (
    <svg viewBox="0 0 200 140">
      <ellipse cx="100" cy="112" rx="92" ry="22" fill="url(#feltB)" />
      <g filter="url(#fS2)">
        <rect x="24" y="42" width="38" height="54" rx="5" fill="#0c4a5e" />
        <rect x="28" y="38" width="38" height="54" rx="5" fill="#11607a" />
        <rect x="32" y="34" width="38" height="54" rx="5" fill="url(#gChipC)" stroke="#a5f3fc" strokeOpacity=".4" />
        <g stroke="#04121a" strokeOpacity=".25" strokeWidth="1"><path d="M36 40 L66 82 M42 36 L70 74 M36 52 L60 86" /></g>
        <circle cx="51" cy="61" r="11" fill="#04121a" fillOpacity=".55" />
        <text x="51" y="65" fontSize="12" fontWeight="800" fill="#a5f3fc" textAnchor="middle">A</text>
      </g>
      <g filter="url(#fS2)">
        <rect x="138" y="42" width="38" height="54" rx="5" fill="#7a0f2e" />
        <rect x="134" y="38" width="38" height="54" rx="5" fill="#9c1239" />
        <rect x="130" y="34" width="38" height="54" rx="5" fill="url(#gOrbP)" stroke="#fbcfe8" strokeOpacity=".4" />
        <g stroke="#3f0716" strokeOpacity=".25" strokeWidth="1"><path d="M134 40 L164 82 M140 36 L168 74 M134 52 L158 86" /></g>
        <circle cx="149" cy="61" r="11" fill="#3f0716" fillOpacity=".55" />
        <text x="149" y="65" fontSize="12" fontWeight="800" fill="#fbcfe8" textAnchor="middle">B</text>
      </g>
      <g filter="url(#fS)">
        <rect x="82" y="24" width="36" height="52" rx="5" fill="url(#gCard)" stroke="#94a3b8" strokeOpacity=".4" />
        <rect x="82" y="24" width="36" height="52" rx="5" fill="url(#gGloss)" />
        <text x="87" y="38" fontSize="9" fontWeight="800" fill="#dc2626">7</text><text x="87" y="46" fontSize="7" fill="#dc2626">♥</text>
        <text x="100" y="58" fontSize="14" fill="#dc2626" textAnchor="middle">♥</text>
      </g>
      <path d="M84 106 h-9 m0 0 l5 -4 m-5 4 l5 4" stroke="#22d3ee" strokeWidth="2.5" fill="none" strokeLinecap="round" filter="url(#glCyan)">
        
      </path>
      <path d="M116 106 h9 m0 0 l-5 -4 m5 4 l-5 4" stroke="#fb7185" strokeWidth="2.5" fill="none" strokeLinecap="round" filter="url(#glPink)">
        
      </path>
      <text x="100" y="110" fontSize="9" fontWeight="800" fill="#94a3b8" textAnchor="middle">VS</text>
    </svg>
  );
}

export function PachinkoScene() {
  return (
    <svg viewBox="0 0 200 140">
      <rect x="24" y="10" width="152" height="120" rx="14" fill="#160d22" stroke="#3b2f4d" />
      <path d="M34 34 Q100 8 166 34" stroke="#f472b6" strokeWidth="3" fill="none" opacity=".6" filter="url(#glPink)" />
      <g>
        <circle cx="70" cy="48" r="3.6" fill="url(#gPeg)" /><circle cx="100" cy="48" r="3.6" fill="url(#gPeg)" /><circle cx="130" cy="48" r="3.6" fill="url(#gPeg)" />
        <circle cx="55" cy="68" r="3.6" fill="url(#gPeg)" /><circle cx="85" cy="68" r="3.6" fill="url(#gPeg)" /><circle cx="115" cy="68" r="3.6" fill="url(#gOrbP)" filter="url(#glPink)" /><circle cx="145" cy="68" r="3.6" fill="url(#gPeg)" />
        <circle cx="70" cy="88" r="3.6" fill="url(#gPeg)" /><circle cx="100" cy="88" r="3.6" fill="url(#gPeg)" /><circle cx="130" cy="88" r="3.6" fill="url(#gPeg)" />
      </g>
      <circle cx="123" cy="56" r="5.5" fill="url(#gSteelR)" opacity=".5" />
      <circle cx="112" cy="76" r="6" fill="url(#gSteelR)" opacity=".75" />
      <g filter="url(#glPink)">
        <circle cx="100" cy="98" r="7" fill="url(#gOrbP)"></circle>
        <ellipse cx="97.5" cy="95" rx="2.2" ry="1.5" fill="#fff" opacity=".85"></ellipse>
      </g>
      <g filter="url(#fS2)">
        <rect x="50" y="112" width="28" height="13" rx="3" fill="#4a1d5f" />
        <rect x="86" y="112" width="28" height="13" rx="3" fill="url(#gOrbP)" filter="url(#glPink)"></rect>
        <rect x="122" y="112" width="28" height="13" rx="3" fill="#4a1d5f" />
        <text x="100" y="121.5" fontSize="6.5" fontWeight="800" fill="#fdf2f8" textAnchor="middle">★777</text>
      </g>
    </svg>
  );
}

export function CascadeScene() {
  return (
    <svg viewBox="0 0 200 140">
      <g filter="url(#fS2)">
        <g opacity=".9"><path d="M59 14 L72 27 L59 42 L46 27 Z" fill="url(#gGem)" /><path d="M59 14 L65 27 L59 42 L53 27 Z" fill="#fff" opacity=".2" />
          </g>
        <g opacity=".75"><path d="M125 6 L138 19 L125 34 L112 19 Z" fill="url(#gOrbC)" /><path d="M112 19 L138 19 L125 34 Z" fill="#0c4a6e" opacity=".4" />
          </g>
      </g>
      <g filter="url(#fS2)">
        <path d="M59 58 L74 73 L59 92 L44 73 Z" fill="url(#gGem)" /><path d="M59 58 L66 73 L59 92 L52 73 Z" fill="#fff" opacity=".22" /><path d="M44 73 L74 73 L59 92 Z" fill="#064e3b" opacity=".35" />
        <path d="M92 58 L107 73 L92 92 L77 73 Z" fill="#11302b" /><path d="M77 73 L107 73 L92 92 Z" fill="#0a1f1c" />
        <path d="M125 58 L140 73 L125 92 L110 73 Z" fill="url(#gOrbC)" /><path d="M125 58 L132 73 L125 92 L118 73 Z" fill="#fff" opacity=".22" /><path d="M110 73 L140 73 L125 92 Z" fill="#0c4a6e" opacity=".35" />
        <path d="M59 96 L74 111 L59 130 L44 111 Z" fill="#11302b" />
        <path d="M125 96 L140 111 L125 130 L110 111 Z" fill="#11302b" />
        <g filter="url(#glViolet)"><path d="M158 96 L173 111 L158 130 L143 111 Z" fill="url(#gChipV)" /><path d="M158 96 L165 111 L158 130 L151 111 Z" fill="#fff" opacity=".22" /></g>
      </g>
      <g stroke="#5eead4" strokeWidth="2.5" strokeLinecap="round" filter="url(#glGreen)">
        <path d="M92 106 l-7 -8 m7 8 l7 -8 m-7 8 v-17"></path>
      </g>
      <g filter="url(#glGold)"><rect x="150" y="20" width="30" height="15" rx="7.5" fill="url(#gGold)" /><text x="165" y="30.5" fontSize="8.5" fontWeight="800" fill="#57340a" textAnchor="middle">×3</text></g>
    </svg>
  );
}

export function FirewalkScene() {
  return (
    <svg viewBox="0 0 200 140">
      <ellipse cx="100" cy="126" rx="90" ry="10" fill="#0d0705" />
      <g filter="url(#fS2)">
        <ellipse cx="100" cy="122" rx="44" ry="12" fill="#57230c" />
        <ellipse cx="100" cy="118" rx="44" ry="12" fill="#7c2d12" />
        <path d="M64 116 q10 4 20 1 M96 122 q12 3 22 -1 M126 114 q8 3 12 1" stroke="#fb923c" strokeOpacity=".5" strokeWidth="1.5" fill="none"></path>
        <ellipse cx="100" cy="94" rx="34" ry="9.5" fill="#3f1503" />
        <ellipse cx="100" cy="90" rx="34" ry="9.5" fill="url(#gGoldEdge)"></ellipse>
        <path d="M72 88 q14 6 28 2 M104 92 q14 3 24 -2" stroke="#fde68a" strokeOpacity=".6" strokeWidth="1.5" fill="none" />
        <ellipse cx="100" cy="70" rx="25" ry="7" fill="#2c0e02" />
        <ellipse cx="100" cy="66" rx="25" ry="7" fill="#7c2d12" />
        <ellipse cx="100" cy="48" rx="18" ry="5.5" fill="#1c1917" />
        <ellipse cx="100" cy="45" rx="18" ry="5.5" fill="url(#gSteel)" />
      </g>
      <g filter="url(#glOrange)">
        <path d="M100 86 q-8 -13 0 -25 q3 8 8 11 q4 -6 3 -11 q9 11 -1 25 q-5 4 -10 0z" fill="url(#gFlame)">
          
        </path>
        <path d="M100 82 q-3 -7 0 -12 q3 4 4 8 q2 -4 1 -7 q4 7 -1 12 q-2 2 -4 -1z" fill="#fef3c7" />
      </g>
      <circle cx="84" cy="32" r="1.7" fill="#fdba74"></circle>
      <circle cx="118" cy="38" r="1.4" fill="#fdba74"></circle>
      <circle cx="102" cy="26" r="1.2" fill="#fde68a"></circle>
    </svg>
  );
}

export function HeistScene() {
  return (
    <svg viewBox="0 0 200 140">
      <rect x="34" y="12" width="132" height="116" rx="11" fill="#141b2b" filter="url(#fS)" />
      <rect x="38" y="16" width="124" height="108" rx="8" fill="#1c2333" stroke="#2b3651" />
      <path d="M148 24 L188 12 L188 128 L148 116 Z" fill="url(#gShaft)">
        
      </path>
      <circle cx="92" cy="70" r="47" fill="url(#gSteelR)" filter="url(#fS2)" />
      <circle cx="92" cy="70" r="47" fill="none" stroke="#0f172a" strokeWidth="2" />
      <circle cx="92" cy="70" r="40" fill="none" stroke="url(#gSteel)" strokeWidth="6" />
      <g fill="#0f172a">
        <circle cx="92" cy="27" r="2.2" /><circle cx="92" cy="113" r="2.2" /><circle cx="49" cy="70" r="2.2" /><circle cx="135" cy="70" r="2.2" />
        <circle cx="62" cy="40" r="2.2" /><circle cx="122" cy="40" r="2.2" /><circle cx="62" cy="100" r="2.2" /><circle cx="122" cy="100" r="2.2" />
      </g>
      <circle cx="92" cy="70" r="17" fill="url(#gSteel)" stroke="#0f172a" strokeWidth="1.5" />
      <g stroke="url(#gSteel)" strokeWidth="6" strokeLinecap="round">
        <path d="M92 42 v14 M92 84 v14 M64 70 h14 M106 70 h14" />
        
      </g>
      <circle cx="92" cy="70" r="6" fill="url(#gGold)" filter="url(#glGold)" />
      <g filter="url(#glGold)">
        <ellipse cx="166" cy="108" rx="8" ry="3.2" fill="url(#gGold)" />
        <ellipse cx="172" cy="98" rx="6.5" ry="2.6" fill="url(#gGold)"></ellipse>
        <ellipse cx="160" cy="86" rx="5" ry="2" fill="url(#gGold)"></ellipse>
      </g>
    </svg>
  );
}

export function ThreeCardScene() {
  return (
    <svg viewBox="0 0 200 140">
      <ellipse cx="100" cy="112" rx="92" ry="24" fill="url(#feltG)" />
      <path d="M30 118 Q100 98 170 118" stroke="#fbbf24" strokeOpacity=".28" strokeWidth="1.2" fill="none" />
      <g transform="rotate(-13 66 62)" filter="url(#fS2)">
        <rect x="46" y="34" width="40" height="56" rx="5" fill="url(#gCard)" stroke="url(#gGoldEdge)" strokeWidth="1.5" />
        <rect x="46" y="34" width="40" height="56" rx="5" fill="url(#gGloss)" />
        <text x="51" y="48" fontSize="10" fontWeight="800" fill="#dc2626">Q</text><text x="51" y="57" fontSize="8" fill="#dc2626">♥</text>
        <text x="66" y="70" fontSize="15" fill="#dc2626" textAnchor="middle">♥</text>
      </g>
      <g transform="rotate(13 134 62)" filter="url(#fS2)">
        <rect x="114" y="34" width="40" height="56" rx="5" fill="url(#gCard)" stroke="url(#gGoldEdge)" strokeWidth="1.5" />
        <rect x="114" y="34" width="40" height="56" rx="5" fill="url(#gGloss)" />
        <text x="119" y="48" fontSize="10" fontWeight="800" fill="#dc2626">Q</text><text x="119" y="57" fontSize="8" fill="#dc2626">♦</text>
        <text x="134" y="70" fontSize="15" fill="#dc2626" textAnchor="middle">♦</text>
      </g>
      <g filter="url(#fS)">
        <rect x="80" y="26" width="40" height="56" rx="5" fill="url(#gCard)" stroke="url(#gGoldEdge)" strokeWidth="1.5" />
        <rect x="80" y="26" width="40" height="56" rx="5" fill="url(#gGloss)" />
        <text x="85" y="40" fontSize="10" fontWeight="800" fill="#0f172a">Q</text><text x="85" y="49" fontSize="8" fill="#0f172a">♠</text>
        <text x="100" y="62" fontSize="15" fill="#0f172a" textAnchor="middle">♠</text>
      </g>
      <g filter="url(#fS2)">
        <ellipse cx="100" cy="106" rx="14" ry="5" fill="#065f46" />
        <ellipse cx="100" cy="102" rx="14" ry="5" fill="url(#gChipE)" />
        <ellipse cx="100" cy="102" rx="14" ry="5" fill="none" stroke="#fff" strokeWidth="1.3" strokeDasharray="4 5" opacity=".8" />
        <text x="100" y="104.5" fontSize="5.5" fontWeight="800" fill="#03301f" textAnchor="middle">PAIR+</text>
      </g>
      <path d="M100 14 l1.8 4 4.2 .5 -3 3 .8 4.2 -3.8 -2 -3.8 2 .8 -4.2 -3 -3 4.2 -.5z" fill="#fde68a" opacity=".9"></path>
    </svg>
  );
}

export function GreedDiceScene() {
  return (
    <svg viewBox="0 0 200 140">
      <ellipse cx="100" cy="116" rx="88" ry="18" fill="#241a10" />
      <g filter="url(#fS2)">
        <ellipse cx="42" cy="108" rx="13" ry="5" fill="#78350f" /><ellipse cx="42" cy="103" rx="13" ry="5" fill="#b45309" /><ellipse cx="42" cy="98" rx="13" ry="5" fill="url(#gGold)" />
        <ellipse cx="42" cy="98" rx="13" ry="5" fill="none" stroke="#78350f" strokeOpacity=".4" strokeWidth=".8" />
        <ellipse cx="160" cy="110" rx="11" ry="4.5" fill="#78350f" /><ellipse cx="160" cy="105.5" rx="11" ry="4.5" fill="url(#gGold)" />
        <ellipse cx="24" cy="114" rx="7" ry="2.8" fill="url(#gGold)" opacity=".8" />
        <ellipse cx="178" cy="118" rx="6" ry="2.4" fill="url(#gGold)" opacity=".7" />
      </g>
      <g transform="rotate(-9 82 62)" filter="url(#fS)">
        <path d="M58 42 L69 31 L113 31 L102 42 Z" fill="url(#gGDiceTop)" />
        <path d="M102 42 L113 31 L113 75 L102 86 Z" fill="url(#gGDiceSide)" />
        <rect x="58" y="42" width="44" height="44" rx="7" fill="url(#gGDiceFront)" />
        <text x="80" y="73" fontSize="24" fontWeight="800" fill="#713f12" textAnchor="middle">$</text>
        
      </g>
      <g transform="rotate(11 138 76)" filter="url(#fS)">
        <path d="M118 58 L128 48 L166 48 L156 58 Z" fill="url(#gGDiceTop)" />
        <path d="M156 58 L166 48 L166 86 L156 96 Z" fill="url(#gGDiceSide)" />
        <rect x="118" y="58" width="38" height="38" rx="6" fill="url(#gGDiceFront)" />
        <g fill="#713f12"><circle cx="129" cy="69" r="3.6" /><circle cx="145" cy="85" r="3.6" /></g>
      </g>
      <text x="58" y="24" fontSize="11" fontWeight="800" fill="#fde68a" filter="url(#glGold)">+250
        
      </text>
    </svg>
  );
}

export function CipherScene() {
  return (
    <svg viewBox="0 0 200 140">
      <rect x="28" y="12" width="144" height="112" rx="11" fill="url(#gSteel)" filter="url(#fS)" />
      <rect x="31" y="15" width="138" height="106" rx="9" fill="#04120c" />
      <rect x="38" y="24" width="124" height="88" rx="6" fill="#071811" stroke="#34d399" strokeOpacity=".35" />
      <g stroke="#34d399" strokeOpacity=".05" strokeWidth="1"><path d="M38 36 H162 M38 50 H162 M38 64 H162 M38 78 H162 M38 92 H162 M38 106 H162" /></g>
      <g fontSize="11" fontWeight="700" fill="#34d399" fontFamily="monospace" textAnchor="middle">
        <g opacity=".35"><text x="56" y="42">7</text><text x="56" y="60">K</text><text x="56" y="78">2</text><text x="56" y="96">X</text>
          </g>
        <g opacity=".55"><text x="78" y="42">A</text><text x="78" y="60">9</text><text x="78" y="78">F</text><text x="78" y="96">4</text>
          </g>
        <g opacity=".4"><text x="122" y="42">3</text><text x="122" y="60">Z</text><text x="122" y="78">8</text><text x="122" y="96">Q</text>
          </g>
        <g opacity=".3"><text x="144" y="42">E</text><text x="144" y="60">5</text><text x="144" y="78">M</text><text x="144" y="96">1</text>
          </g>
      </g>
      <rect x="38" y="24" width="124" height="10" fill="#34d399" opacity=".1">
        
      </rect>
      <g filter="url(#glGold)">
        <rect x="89" y="60" width="22" height="24" rx="4" fill="rgba(251,191,36,.14)" stroke="#fbbf24" strokeWidth="1.5" />
        <text x="100" y="77" fontSize="13" fontWeight="800" fill="#fde68a" textAnchor="middle" fontFamily="monospace">M</text>
      </g>
      <g transform="translate(100,18)"><rect x="-6" y="-4" width="12" height="9" rx="2" fill="url(#gGold)" /><path d="M-3.5 -4 v-3 a3.5 3.5 0 0 1 7 0 v3" stroke="url(#gGoldEdge)" strokeWidth="2" fill="none" /></g>
    </svg>
  );
}

export function HiLoScene() {
  return (
    <svg viewBox="0 0 200 140">
      <ellipse cx="100" cy="118" rx="80" ry="14" fill="url(#feltB)" />
      <g filter="url(#glGreen)">
        <path d="M100 10 l17 19 h-9.5 v12 h-15 v-12 h-9.5 z" fill="url(#gGem)" />
        <path d="M100 10 l8 19 h-4.5 v12 h-7.5 v-12 h-4.5 z" fill="#fff" opacity=".18" />
        
      </g>
      <g filter="url(#glPink)" opacity=".4">
        <path d="M100 130 l17 -19 h-9.5 v-12 h-15 v12 h-9.5 z" fill="url(#gOrbP)" />
        
      </g>
      <g filter="url(#fS)">
        <rect x="76" y="44" width="48" height="52" rx="6" fill="url(#gCard)" stroke="#94a3b8" strokeOpacity=".4" />
        <rect x="76" y="44" width="48" height="52" rx="6" fill="url(#gGloss)" />
        <text x="82" y="59" fontSize="11" fontWeight="800" fill="#0f172a">8</text><text x="82" y="69" fontSize="9" fill="#0f172a">♠</text>
        <text x="100" y="82" fontSize="19" fill="#0f172a" textAnchor="middle">♠</text>
      </g>
      <g fontSize="9" fontWeight="800" textAnchor="middle">
        <rect x="130" y="34" width="34" height="15" rx="7.5" fill="rgba(52,211,153,.12)" stroke="#34d399" strokeOpacity=".5" /><text x="147" y="44.5" fill="#6ee7b7">×1.9</text>
        <rect x="130" y="92" width="34" height="15" rx="7.5" fill="rgba(251,113,133,.12)" stroke="#fb7185" strokeOpacity=".5" /><text x="147" y="102.5" fill="#fda4af">×2.2</text>
      </g>
    </svg>
  );
}

export function ChickenScene() {
  return (
    <svg viewBox="0 0 200 140">
      <ellipse cx="100" cy="124" rx="92" ry="10" fill="#0d0906" />
      <g filter="url(#fS2)">
        <path d="M14 98 L20 92 L58 92 L52 98 Z" fill="#3d3220" /><rect x="14" y="98" width="38" height="24" rx="4" fill="#292018" />
        <path d="M58 98 L64 92 L102 92 L96 98 Z" fill="#473a24" /><rect x="58" y="98" width="38" height="24" rx="4" fill="#332a1a" />
        <path d="M102 98 L108 92 L146 92 L140 98 Z" fill="#3d3220" /><rect x="102" y="98" width="38" height="24" rx="4" fill="#292018" />
        <path d="M146 98 L152 92 L190 92 L184 98 Z" fill="#52401e" /><rect x="146" y="98" width="38" height="24" rx="4" fill="#3d2c12" />
      </g>
      <g filter="url(#glGold)">
        <circle cx="121" cy="110" r="8.5" fill="url(#gGold)" />
        <circle cx="121" cy="110" r="5.5" fill="none" stroke="#78350f" strokeOpacity=".5" />
        <text x="121" y="113.5" fontSize="7.5" fontWeight="800" fill="#57340a" textAnchor="middle">M</text>
      </g>
      <g filter="url(#glOrange)">
        <path d="M164 108 q-5 -9 1 -15 q2 5 5 7 q2 -4 1 -7 q6 7 -1 15 q-3 2 -6 0z" fill="url(#gFlame)"></path>
        <path d="M165 105 q-2 -4 0 -7 q2 2 3 4 q1 -2 1 -4 q2 4 -1 7 q-1 1 -3 0z" fill="#fef3c7" />
      </g>
      <ellipse cx="76" cy="94" rx="18" ry="3.4" fill="#000" opacity=".45" />
      <g filter="url(#fS2)">
        
        <ellipse cx="72" cy="70" rx="19" ry="16" fill="url(#gCard)" />
        <path d="M58 76 q-2 8 6 10 q6 1 10 -4" fill="#dbe3ee" />
        <circle cx="86" cy="56" r="10" fill="url(#gCard)" />
        <path d="M84 44 q2 -6 6 -2 q4 -4 5 2 q3 -2 3 3 l-8 3z" fill="url(#gRDiceFront)" />
        <path d="M95 58 l9 2.5 -9 3z" fill="url(#gGoldEdge)" />
        <circle cx="89" cy="55" r="1.9" fill="#0f172a" /><circle cx="88.4" cy="54.4" r=".6" fill="#fff" />
        <path d="M62 68 q-9 4 -7 11 q7 2 14 -3 q3 -3 -7 -8z" fill="#dbe3ee" />
        <path d="M66 85 v7 M78 85 v7" stroke="url(#gGoldEdge)" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/* ── Floor grid data (same order as the lab's #floorGrid) ───────────── */

export type FloorGame = {
  key: string;
  name: string;
  cat: "cards" | "table" | "orig";
  fontClass: string;
  nameSize: string;
  blurb: string;
  Scene: () => React.ReactElement;
  glow: string;
  /** Route the card links to (real app game route). */
  href: string;
  badge?: string;
  badgeClass?: "new" | "hot" | "feat";
};

export const FLOOR_GAMES: FloorGame[] = [
  { key: "blackjack", name: "BLACKJACK", cat: "cards", fontClass: "f-titan", nameSize: "14px", blurb: "Single + multiplayer", Scene: BlackjackScene, glow: "rgba(251,191,36,.18)", href: "/BLACKJACK", badge: "3 SEATS LIVE", badgeClass: "new" },
  { key: "poker", name: "POKER", cat: "cards", fontClass: "f-bowlby", nameSize: "13px", blurb: "Hold'em cash tables", Scene: PokerScene, glow: "rgba(167,139,250,.2)", href: "/poker", badge: "2 TABLES", badgeClass: "new" },
  { key: "keno", name: "KENO", cat: "orig", fontClass: "f-lilita", nameSize: "15px", blurb: "Pick 10 · ×100 top hit", Scene: KenoScene, glow: "rgba(34,211,238,.2)", href: "/keno2" },
  { key: "dice", name: "DICE", cat: "orig", fontClass: "f-titan", nameSize: "14px", blurb: "98% RTP · instant", Scene: DiceScene, glow: "rgba(251,191,36,.18)", href: "/dice2" },
  { key: "roulette", name: "ROULETTE", cat: "table", fontClass: "f-bowlby", nameSize: "12px", blurb: "European single-zero", Scene: RouletteScene, glow: "rgba(251,113,133,.18)", href: "/roulette2" },
  { key: "dicex2", name: "DICE X2", cat: "orig", fontClass: "f-titan", nameSize: "13px", blurb: "Double dice, double roll", Scene: DiceX2Scene, glow: "rgba(167,139,250,.22)", href: "/dicex2" },
  { key: "towers", name: "TOWERS", cat: "orig", fontClass: "f-lilita", nameSize: "15px", blurb: "Climb · cash out any floor", Scene: TowersScene, glow: "rgba(167,139,250,.2)", href: "/towers" },
  { key: "limbo", name: "LIMBO", cat: "orig", fontClass: "f-bungee", nameSize: "13px", blurb: "Target any multiplier", Scene: LimboScene, glow: "rgba(52,211,153,.2)", href: "/limbo2" },
  { key: "baccarat", name: "BACCARAT", cat: "table", fontClass: "f-bowlby", nameSize: "12px", blurb: "Player · Banker · Tie", Scene: BaccaratScene, glow: "rgba(251,191,36,.16)", href: "/baccarat" },
  { key: "videopoker", name: "VIDEO POKER", cat: "cards", fontClass: "f-bungee", nameSize: "11px", blurb: "Jacks or better", Scene: VideoPokerScene, glow: "rgba(34,211,238,.18)", href: "/video-poker" },
  { key: "craps", name: "CRAPS", cat: "table", fontClass: "f-titan", nameSize: "14px", blurb: "Roll the bones", Scene: CrapsScene, glow: "rgba(251,113,133,.18)", href: "/craps" },
  { key: "dragontiger", name: "DRAGON TIGER", cat: "table", fontClass: "f-bowlby", nameSize: "11px", blurb: "One card. One winner.", Scene: DragonTigerScene, glow: "rgba(251,146,60,.2)", href: "/dragon-tiger" },
  { key: "andarbahar", name: "ANDAR BAHAR", cat: "table", fontClass: "f-lilita", nameSize: "13px", blurb: "Pick a side", Scene: AndarBaharScene, glow: "rgba(167,139,250,.18)", href: "/andar-bahar" },
  { key: "pachinko", name: "PACHINKO", cat: "orig", fontClass: "f-bungee", nameSize: "12px", blurb: "Neon pin storm", Scene: PachinkoScene, glow: "rgba(244,114,182,.2)", href: "/pachinko" },
  { key: "cascade", name: "CASCADE", cat: "orig", fontClass: "f-lilita", nameSize: "14px", blurb: "Chain wins fall", Scene: CascadeScene, glow: "rgba(45,212,191,.2)", href: "/cascade" },
  { key: "firewalk", name: "FIREWALK", cat: "orig", fontClass: "f-titan", nameSize: "13px", blurb: "Every step raises the heat", Scene: FirewalkScene, glow: "rgba(251,146,60,.24)", href: "/firewalk" },
  { key: "heist", name: "HEIST", cat: "orig", fontClass: "f-bowlby", nameSize: "13px", blurb: "Crack the vault", Scene: HeistScene, glow: "rgba(251,191,36,.22)", href: "/heist" },
  { key: "threecard", name: "THREE CARD", cat: "cards", fontClass: "f-lilita", nameSize: "13px", blurb: "Poker at speed", Scene: ThreeCardScene, glow: "rgba(52,211,153,.18)", href: "/three-card-poker" },
  { key: "greeddice", name: "GREED DICE", cat: "orig", fontClass: "f-titan", nameSize: "12px", blurb: "Push your luck", Scene: GreedDiceScene, glow: "rgba(251,191,36,.22)", href: "/greed-dice" },
  { key: "cipher", name: "CIPHER", cat: "orig", fontClass: "f-bungee", nameSize: "13px", blurb: "Break the code", Scene: CipherScene, glow: "rgba(52,211,153,.2)", href: "/cipher" },
  { key: "hilo", name: "HI-LO", cat: "orig", fontClass: "f-lilita", nameSize: "14px", blurb: "Higher or lower", Scene: HiLoScene, glow: "rgba(34,211,238,.18)", href: "/hilo" },
  { key: "chicken", name: "CHICKEN", cat: "orig", fontClass: "f-titan", nameSize: "13px", blurb: "Cross if you dare", Scene: ChickenScene, glow: "rgba(251,191,36,.18)", href: "/chicken" },
];
