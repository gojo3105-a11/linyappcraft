import { useState, useEffect } from 'react';
import { HeroSVG } from './sprites/HeroSVG';

const WALK = [
  { y: 0,  r: 0,    sx: 1.00, sy: 1.00 },
  { y: -4, r: -1.5, sx: 0.99, sy: 1.02 },
  { y: -7, r: 0,    sx: 0.98, sy: 1.03 },
  { y: -4, r: 1.5,  sx: 0.99, sy: 1.02 },
];

interface Props {
  src: string;
  fallback: string;
  alt: string;
  className?: string;
  size?: number;
}

export default function HedgehogSprite({ src, fallback, alt, className, size = 110 }: Props) {
  const [frame, setFrame] = useState(0);
  const [err, setErr] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setFrame(p => (p + 1) % 4), 150);
    return () => clearInterval(t);
  }, []);

  const f = WALK[frame];

  if (err) {
    // PNG 없을 때 SVG 캐릭터로 폴백
    return fallback ? (
      <span className={className ?? 'unit-emoji'}>{fallback}</span>
    ) : (
      <HeroSVG size={size} />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      onError={() => setErr(true)}
      style={{
        objectFit: 'contain',
        transform: `translateY(${f.y}px) rotate(${f.r}deg) scaleX(${f.sx}) scaleY(${f.sy})`,
        transition: 'transform 0.13s cubic-bezier(0.34, 1.56, 0.64, 1)',
        willChange: 'transform',
        filter: 'drop-shadow(0 4px 18px rgba(0,200,255,0.3))',
      }}
    />
  );
}
