interface IkaroAvatarProps {
  size: number;
}

export default function IkaroAvatar({ size: s }: IkaroAvatarProps) {
  const id = 'ik' + Math.round(s);
  const svg = `
<svg viewBox="0 0 100 100" width="100%" height="100%" style="display:block;overflow:visible;">
  <defs>
    <linearGradient id="cop${id}" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0" stop-color="#EFBC7E"/>
      <stop offset="0.45" stop-color="#C5803D"/>
      <stop offset="1" stop-color="#7A4A1E"/>
    </linearGradient>
    <linearGradient id="cob${id}" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0" stop-color="#C68C4C"/>
      <stop offset="1" stop-color="#5A3413"/>
    </linearGradient>
    <radialGradient id="eye${id}" cx="0.4" cy="0.38" r="0.72">
      <stop offset="0" stop-color="#EAFBFF"/>
      <stop offset="0.32" stop-color="#7CD7FF"/>
      <stop offset="0.78" stop-color="#239BE0"/>
      <stop offset="1" stop-color="#10568F"/>
    </radialGradient>
    <linearGradient id="beak${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#646470"/>
      <stop offset="1" stop-color="#24242E"/>
    </linearGradient>
  </defs>

  <!-- crest feathers -->
  <g stroke="#5A3413" stroke-width="0.8" stroke-linejoin="round">
    <polygon points="44,34 40,15 47,19 49,34" fill="url(#cob${id})"/>
    <polygon points="48,34 45,7 53,10 54,33" fill="url(#cop${id})"/>
    <polygon points="54,33 57,6 65,12 60,34" fill="url(#cop${id})"/>
    <polygon points="60,34 69,10 75,19 66,36" fill="url(#cob${id})"/>
    <polygon points="66,36 77,20 81,29 70,39" fill="url(#cob${id})"/>
  </g>
  <!-- crest glow tips -->
  <g class="ikGlow" stroke="#7FD8FF" stroke-width="1.6" stroke-linecap="round">
    <line x1="47" y1="17" x2="49" y2="11"/>
    <line x1="52" y1="15" x2="53.5" y2="10"/>
    <line x1="60" y1="16" x2="64" y2="13"/>
    <line x1="69" y1="22" x2="73" y2="22"/>
  </g>

  <!-- neck / gorget -->
  <path d="M48 54 L72 56 L74 76 Q66 88 53 85 L47 68 Z"
    fill="url(#cob${id})" stroke="#46290F" stroke-width="0.8"/>
  <g stroke="#46290F" stroke-width="0.7" opacity="0.55" fill="none">
    <path d="M52 61 L70 63"/>
    <path d="M53 69 L72 70"/>
  </g>

  <!-- tech cables -->
  <g stroke="#30303A" stroke-width="1.7" fill="none" stroke-linecap="round">
    <path d="M42 50 Q44 62 52 73"/>
    <path d="M46 50 Q49 61 57 71"/>
  </g>

  <!-- core node (chest) -->
  <circle cx="59" cy="69" r="5.6" fill="#0C3A60"/>
  <circle cx="59" cy="69" r="3.4" fill="url(#eye${id})" class="ikGlow"/>
  <circle cx="59" cy="69" r="1.3" fill="#EAFBFF"/>

  <!-- head -->
  <path d="M30 47 C29 33 40 23 52 24 C64 25 71 32 71 43 C71 50 68 54 62 55 L40 55 C33 55 30 52 30 47 Z"
    fill="url(#cop${id})" stroke="#5A3413" stroke-width="0.9"/>
  <g stroke="#5A3413" stroke-width="0.7" fill="none" opacity="0.65">
    <path d="M40 28 C46 26 58 27 64 33"/>
    <path d="M33 45 L40 45"/>
  </g>

  <!-- cheek plate -->
  <path d="M39 45 L63 45 L60 56 L42 56 Z" fill="url(#cob${id})" opacity="0.5"/>

  <!-- beak (hooked) -->
  <path d="M35 42 L14 47 Q8 48.5 11 53 L16 54.5 Q21 54 23 50 L35 49 Z"
    fill="url(#beak${id})" stroke="#18181F" stroke-width="0.8" stroke-linejoin="round"/>
  <path d="M35 49 L23 50 Q22 52 23 53 L35 52 Z" fill="#18181F" opacity="0.45"/>
  <circle cx="30" cy="46.5" r="1.2" fill="#18181F"/>

  <!-- eye -->
  <circle cx="51" cy="40" r="8" fill="#22222B"/>
  <circle cx="51" cy="40" r="5.2" fill="url(#eye${id})" class="ikGlow"/>
  <circle cx="49.5" cy="38.5" r="1.7" fill="#EFFCFF"/>
  <!-- eyelid blink -->
  <rect x="42.6" y="31.6" width="16.8" height="16.8" rx="3" fill="#C5803D" class="ikLid"/>
</svg>`;

  return (
    <div
      style={{
        width: s,
        height: s,
        flex: '0 0 auto',
        filter: `drop-shadow(0 ${s * 0.05}px ${s * 0.09}px rgba(60,30,8,.4))`,
        animation: 'teoBob 4.2s ease-in-out infinite',
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
