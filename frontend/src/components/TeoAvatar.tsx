interface TeoAvatarProps {
  size: number;
}

export default function TeoAvatar({ size: s }: TeoAvatarProps) {
  return (
    <div style={{ width: s, height: s, position: 'relative', flex: '0 0 auto' }}>
      {/* Shadow */}
      <div style={{
        position: 'absolute', bottom: -s * 0.03, left: '50%',
        width: s * 0.6, height: s * 0.11, marginLeft: -s * 0.3,
        borderRadius: '50%', background: 'rgba(70,40,120,.3)', filter: 'blur(3px)',
        animation: 'teoShadow 4s ease-in-out infinite',
      }} />
      {/* Bouncing body */}
      <div style={{ position: 'absolute', inset: 0, animation: 'teoBob 4s ease-in-out infinite' }}>
        {/* Hat stem */}
        <div style={{
          position: 'absolute', top: -s * 0.13, left: '50%', marginLeft: -s * 0.02,
          width: s * 0.04, height: s * 0.15,
          background: 'linear-gradient(#b6a0f2,#8a6cf0)',
          borderRadius: s * 0.02,
        }} />
        {/* Hat sphere (glowing gold) */}
        <div style={{
          position: 'absolute', top: -s * 0.23, left: '50%', marginLeft: -s * 0.07,
          width: s * 0.14, height: s * 0.14, borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%,#ffe7ab,#F0B45C)',
          boxShadow: `0 0 ${s * 0.1}px #F2B85E`,
        }} />
        {/* Main body — purple rounded rect with glassmorphism */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: s * 0.34,
          background: 'radial-gradient(125% 115% at 32% 22%,#AC92F5 0%,#7E5FE8 44%,#5733BE 100%)',
          boxShadow: [
            `inset 0 ${s * 0.05}px ${s * 0.07}px rgba(255,255,255,.5)`,
            `inset 0 ${-s * 0.09}px ${s * 0.11}px rgba(40,18,90,.5)`,
            `0 ${s * 0.12}px ${s * 0.2}px ${-s * 0.06}px rgba(70,40,150,.6)`,
          ].join(', '),
          overflow: 'hidden',
        }}>
          {/* Glare highlight */}
          <div style={{
            position: 'absolute', top: s * 0.06, left: s * 0.12,
            width: s * 0.42, height: s * 0.3, borderRadius: '50%',
            background: 'radial-gradient(circle at 40% 35%,rgba(255,255,255,.75),rgba(255,255,255,0) 70%)',
          }} />
          {/* Left cheek blush */}
          <div style={{
            position: 'absolute', top: s * 0.57, left: s * 0.16,
            width: s * 0.13, height: s * 0.08, borderRadius: '50%',
            background: 'rgba(240,120,170,.5)', filter: 'blur(1.5px)',
          }} />
          {/* Right cheek blush */}
          <div style={{
            position: 'absolute', top: s * 0.57, right: s * 0.16,
            width: s * 0.13, height: s * 0.08, borderRadius: '50%',
            background: 'rgba(240,120,170,.5)', filter: 'blur(1.5px)',
          }} />
        </div>
        {/* Left eyebrow */}
        <div style={{
          position: 'absolute', top: s * 0.30, left: s * 0.26,
          width: s * 0.17, height: s * 0.055, transform: 'rotate(-16deg)',
        }}>
          <div style={{
            width: '100%', height: '100%', background: '#43288F',
            borderRadius: s * 0.04, animation: 'teoBrow 5s infinite',
          }} />
        </div>
        {/* Right eyebrow */}
        <div style={{
          position: 'absolute', top: s * 0.30, right: s * 0.26,
          width: s * 0.17, height: s * 0.055, transform: 'rotate(16deg)',
        }}>
          <div style={{
            width: '100%', height: '100%', background: '#43288F',
            borderRadius: s * 0.04, animation: 'teoBrow 5s infinite',
          }} />
        </div>
        {/* Left eye */}
        <div style={{
          position: 'absolute', top: s * 0.40, left: s * 0.28,
          width: s * 0.12, height: s * 0.19, background: '#fff',
          borderRadius: s * 0.07,
          boxShadow: `inset 0 ${-s * 0.03}px ${s * 0.03}px rgba(120,90,200,.25)`,
          animation: 'teoBlink 4.4s infinite', transformOrigin: 'center',
        }}>
          <div style={{
            position: 'absolute', top: s * 0.03, left: s * 0.022,
            width: s * 0.045, height: s * 0.05, borderRadius: '50%',
            background: 'rgba(150,120,220,.5)',
          }} />
        </div>
        {/* Right eye */}
        <div style={{
          position: 'absolute', top: s * 0.40, right: s * 0.28,
          width: s * 0.12, height: s * 0.19, background: '#fff',
          borderRadius: s * 0.07,
          boxShadow: `inset 0 ${-s * 0.03}px ${s * 0.03}px rgba(120,90,200,.25)`,
          animation: 'teoBlink 4.4s infinite', transformOrigin: 'center',
        }}>
          <div style={{
            position: 'absolute', top: s * 0.03, left: s * 0.022,
            width: s * 0.045, height: s * 0.05, borderRadius: '50%',
            background: 'rgba(150,120,220,.5)',
          }} />
        </div>
        {/* Mouth (U-shape) */}
        <div style={{
          position: 'absolute', top: s * 0.61, left: '50%', marginLeft: -s * 0.12,
          width: s * 0.24, height: s * 0.13,
          border: `${Math.max(2, s * 0.028)}px solid #fff`,
          borderTop: 'none',
          borderRadius: `0 0 ${s * 0.16}px ${s * 0.16}px`,
        }} />
      </div>
    </div>
  );
}
