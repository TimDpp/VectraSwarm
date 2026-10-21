import React from 'react';
import { PowerUpId } from '../game/rules';

export const VectraTitleEmblem: React.FC<{ highContrast?: boolean }> = ({ highContrast }) => {
  const primary = highContrast ? '#ffff00' : '#38bdf8';
  const secondary = highContrast ? '#00ffff' : '#f43f5e';
  return (
    <div className="flex flex-col items-start select-none">
      <div className="flex items-center gap-3.5 mb-2">
        <svg
          width="52"
          height="52"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Outer Dark Silhouette Frame */}
          <polygon
            points="32,4 58,18 58,46 32,60 6,46 6,18"
            fill="#090d16"
            stroke={primary}
            strokeWidth="3.5"
          />
          {/* Interior Structural Detail */}
          <polygon
            points="32,12 50,22 50,42 32,52 14,42 14,22"
            fill="rgba(56, 189, 248, 0.12)"
            stroke={secondary}
            strokeWidth="2"
          />
          {/* Vector Craft Silhouette */}
          <path
            d="M32 16L46 44L32 37L18 44L32 16Z"
            fill={primary}
            stroke="#ffffff"
            strokeWidth="2"
          />
          <circle cx="32" cy="31" r="4" fill="#090d16" />
        </svg>
        <div>
          <h1
            className={`font-display text-5xl sm:text-6xl font-bold tracking-tight uppercase leading-none ${
              highContrast ? 'text-yellow-300' : 'text-white'
            }`}
          >
            Vectra Swarm
          </h1>
          <p
            className={`text-sm font-medium tracking-wide mt-1 ${
              highContrast ? 'text-white' : 'text-sky-300'
            }`}
          >
            Infinite Coordinate Arena · Vectorized Wave Survival
          </p>
        </div>
      </div>
    </div>
  );
};

export const PowerUpIconSvg: React.FC<{ id: PowerUpId; color?: string; size?: number }> = ({
  id,
  color = '#38bdf8',
  size = 24,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Outer Dark Silhouette */}
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#050811" stroke={color} strokeWidth="2" />
      {id === 'pulse_cannon' && (
        <>
          <path d="M12 5L17 14H13.5V19H10.5V14H7L12 5Z" fill={color} stroke="#ffffff" strokeWidth="1" />
        </>
      )}
      {id === 'orbital_blades' && (
        <>
          <circle cx="12" cy="12" r="6" stroke={color} strokeWidth="2" strokeDasharray="4 2" />
          <polygon points="12,4 15,8 9,8" fill="#ffffff" />
          <polygon points="12,20 15,16 9,16" fill={color} />
        </>
      )}
      {id === 'chain_arc' && (
        <path
          d="M13 4L7 13H12L10 20L17 11H12L13 4Z"
          fill={color}
          stroke="#ffffff"
          strokeWidth="1"
        />
      )}
      {id === 'nova_emitter' && (
        <>
          <circle cx="12" cy="12" r="4" fill={color} />
          <circle cx="12" cy="12" r="7.5" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="3 3" />
        </>
      )}
      {id === 'seeker_missiles' && (
        <>
          <path d="M7 17L17 7M17 7H11M17 7V13" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="7" cy="17" r="2" fill="#ffffff" />
        </>
      )}
      {id === 'overclock_core' && (
        <>
          <rect x="7" y="7" width="10" height="10" fill={color} stroke="#ffffff" strokeWidth="1.2" />
          <path d="M12 4V7M12 17V20M4 12H7M17 12H20" stroke="#ffffff" strokeWidth="1.8" />
        </>
      )}
      {id === 'kinetic_thrusters' && (
        <path
          d="M6 9L12 5L18 9M6 15L12 11L18 15M8 19L12 16L16 19"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      )}
      {id === 'magnet_field' && (
        <path
          d="M7 7V12C7 14.76 9.24 17 12 17C14.76 17 17 14.76 17 12V7"
          stroke={color}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      )}
      {id === 'reactive_hull' && (
        <path
          d="M12 4L18 7V12C18 16 15.4 18.8 12 20C8.6 18.8 6 16 6 12V7L12 4Z"
          fill={color}
          stroke="#ffffff"
          strokeWidth="1.2"
        />
      )}
    </svg>
  );
};
