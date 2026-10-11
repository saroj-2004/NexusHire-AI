import React from 'react';

/**
 * NexusHire Official Brand Logo & Icon Component
 * Faithfully vector-rendered from the brand identity blueprint.
 */

export function NexusHireIcon({ className = "w-8 h-8", withDot = true }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Dark rounded squircle background */}
      <rect width="100" height="100" rx="22" fill="#0F172A" />
      
      {/* Top right emerald indicator dot */}
      {withDot && (
        <circle cx="78" cy="22" r="5.5" fill="#10B981" />
      )}

      {/* Geometric Ribbon N - Left pillar & upper diagonal bar */}
      <path
        d="M 23 20 
           H 35 
           V 52 
           L 62 79 
           H 50 
           L 23 52 
           Z"
        fill="#FFFFFF"
      />

      {/* Geometric Ribbon N - Right pillar & lower diagonal bar */}
      <path
        d="M 77 80 
           H 65 
           V 48 
           L 38 21 
           H 50 
           L 77 48 
           Z"
        fill="#FFFFFF"
      />

      {/* Left stalk vertical stem */}
      <path
        d="M 23 20
           H 35
           V 80
           L 23 68
           Z"
        fill="#FFFFFF"
      />

      {/* Right stalk vertical stem */}
      <path
        d="M 77 80
           H 65
           V 20
           L 77 32
           Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

/**
 * Clean Geometric 'N' Symbol (Transparent / Blueprint style)
 */
export function NexusHireGlyph({ className = "w-6 h-6", color = "#0F172A" }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M 23 20 H 35 V 52 L 62 79 H 50 L 23 52 Z"
        fill={color}
      />
      <path
        d="M 77 80 H 65 V 48 L 38 21 H 50 L 77 48 Z"
        fill={color}
      />
      <path
        d="M 23 20 H 35 V 80 L 23 68 Z"
        fill={color}
      />
      <path
        d="M 77 80 H 65 V 20 L 77 32 Z"
        fill={color}
      />
    </svg>
  );
}

/**
 * Full Brand Lockup (Icon + Typography + Version Badge)
 */
export default function NexusHireLogo({ 
  iconSize = "w-8 h-8", 
  textSize = "text-base", 
  version = "v1.4",
  showVersion = true,
  className = "" 
}) {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Squircle Brand Icon */}
      <NexusHireIcon className={`${iconSize} shrink-0 drop-shadow-sm`} withDot={true} />
      
      {/* Brand Typography */}
      <div className="flex items-center gap-2">
        <span className={`${textSize} font-extrabold tracking-tight text-slate-900 font-sans flex items-center`}>
          Nexus<span className="font-semibold text-slate-900">Hire</span>
        </span>
        
        {showVersion && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-600 border border-slate-300/80">
            {version}
          </span>
        )}
      </div>
    </div>
  );
}
