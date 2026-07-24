"use client";

import { useEffect, useRef } from "react";

interface SparkleParticle {
  x: number;
  y: number;
  depthOffset: number;
  size: number;
  color: string;
  alpha: number;
  targetAlpha: number;
  twinkleSpeed: number;
  phase: number;
  driftX: number;
}

function getParticleBaseSize(isSlow: boolean, layerIndex: number): number {
  if (isSlow) return 0.6;
  if (layerIndex === 0) return 0.9;
  if (layerIndex === 1) return 1.4;
  return 1.9;
}

// Sparkle Mountain Background — animated canvas rendering layered violet pixel sparkle mountains
export default function SparkleMountainBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollYRef = useRef(0);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onScroll = () => {
      scrollYRef.current = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const onMouseMove = (e: MouseEvent) => {
      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };
    const onMouseLeave = () => {
      mouseRef.current = null;
    };
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mouseleave", onMouseLeave, { passive: true });

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let particlesList: SparkleParticle[][] = [];

    const configs = [
      {
        count: 90,
        parallax: 0.04,
        colors: ["#6d28d9", "#7c3aed", "#5b21b6"],
        isAmbient: true,
      },
      {
        count: 140,
        parallax: 0.08,
        colors: ["#a855f7", "#c084fc", "#9333ea", "#7e22ce"],
        isTopOnly: true,
      },
      {
        count: 70,
        parallax: 0.12,
        colors: ["#6d28d9", "#7c3aed", "#5b21b6"],
      },
      {
        count: 85,
        parallax: 0.22,
        colors: ["#8b5cf6", "#a855f7", "#c084fc"],
      },
      {
        count: 100,
        parallax: 0.38,
        colors: ["#c084fc", "#e9d5ff", "#d8b4fe", "#ffffff"],
      },
    ];

    const getMountainCurve = (x: number, layerIndex: number, h: number): number => {
      if (layerIndex === 2) {
        const peak = h * 0.42;
        const baseline = h * 0.76;
        return (
          baseline -
          peak *
          (Math.sin(x * 0.0018 + 0.5) * 0.65 +
            Math.cos(x * 0.0042 + 1.2) * 0.25 +
            Math.sin(x * 0.009 - 0.3) * 0.1)
        );
      } else if (layerIndex === 3) {
        const peak = h * 0.46;
        const baseline = h * 0.79;
        return (
          baseline -
          peak *
          (Math.sin(x * 0.0022 - 1.1) * 0.6 +
            Math.cos(x * 0.0051 + 0.4) * 0.3 +
            Math.sin(x * 0.012 + 1.8) * 0.1)
        );
      } else {
        const peak = h * 0.52;
        const baseline = h * 0.82;
        return (
          baseline -
          peak *
          (Math.sin(x * 0.0028 + 2.0) * 0.6 +
            Math.sin(x * 0.006 - 0.9) * 0.3 +
            Math.cos(x * 0.015 + 0.7) * 0.1)
        );
      }
    };

    interface ParticleConfig {
      count: number;
      parallax: number;
      colors: string[];
      isAmbient?: boolean;
      isTopOnly?: boolean;
    }

    function createParticle(
      conf: ParticleConfig,
      layerIndex: number,
      canvasWidth: number,
      canvasHeight: number,
      nextRandom: () => number
    ): SparkleParticle {
      const isSlow = Boolean(conf.isAmbient || conf.isTopOnly);
      const x = nextRandom() * canvasWidth;
      let y = 0;
      let depthOffset = 0;

      if (conf.isAmbient) {
        y = nextRandom() * canvasHeight;
      } else if (conf.isTopOnly) {
        const maxTopHeight = canvasHeight * 0.48;
        y = Math.pow(nextRandom(), 1.4) * maxTopHeight;
      } else {
        const mountainY = getMountainCurve(x, layerIndex, canvasHeight);
        y = mountainY;
        depthOffset = nextRandom() * (canvasHeight - mountainY);
      }

      const baseSize = getParticleBaseSize(isSlow, layerIndex);
      return {
        x,
        y,
        depthOffset,
        size: baseSize + nextRandom() * 0.8,
        color: conf.colors[Math.floor(nextRandom() * conf.colors.length)],
        alpha: nextRandom() * 0.5 + 0.1,
        targetAlpha: nextRandom() * (isSlow ? 0.55 : 0.7) + 0.2,
        twinkleSpeed: (isSlow ? 0.004 : 0.007) + nextRandom() * 0.012,
        phase: nextRandom() * Math.PI * 2,
        driftX: (nextRandom() - 0.5) * (isSlow ? 0.02 : 0.04),
      };
    }

    const generateParticles = (canvasWidth: number, canvasHeight: number) => {
      const list: SparkleParticle[][] = [];
      const totalCount = configs.reduce((sum, c) => sum + c.count, 0);
      const valsNeeded = totalCount * 10;
      const randomValues = new Uint32Array(valsNeeded);
      window.crypto.getRandomValues(randomValues);
      let randIdx = 0;
      const nextRandom = (): number => {
        const val = randomValues[randIdx] / 4294967296;
        randIdx = (randIdx + 1) % valsNeeded;
        return val;
      };

      for (let l = 0; l < configs.length; l++) {
        const conf = configs[l];
        const layerParticles: SparkleParticle[] = Array.from(
          { length: conf.count },
          () => createParticle(conf, l, canvasWidth, canvasHeight, nextRandom)
        );
        list.push(layerParticles);
      }
      return list;
    };

    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      particlesList = generateParticles(width, height);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      const currentScrollY = scrollYRef.current;
      const mouse = mouseRef.current;

      for (let l = 0; l < particlesList.length; l++) {
        const layer = particlesList[l];
        const conf = configs[l];

        for (const p of layer) {
          p.phase += p.twinkleSpeed;
          p.alpha = (Math.sin(p.phase) * 0.5 + 0.5) * p.targetAlpha;
          p.x += p.driftX;
          if (p.x < 0) p.x += width;
          if (p.x > width) p.x -= width;

          let drawY = 0;
          if (conf.isAmbient) {
            drawY = p.y - currentScrollY * conf.parallax;
            drawY = ((drawY % height) + height) % height;
          } else {
            // For both mountains and Top Starfield:
            drawY = (p.y + p.depthOffset) - currentScrollY * conf.parallax;

            // Performance optimization: cull particles that are off-screen
            if (drawY < -10 || drawY > height + 10) {
              continue;
            }
          }

          const drawX = p.x;

          // 5. Mouse proximity glow flare-up
          let finalAlpha = p.alpha;
          let finalSize = p.size;
          if (mouse) {
            const dx = drawX - mouse.x;
            const dy = drawY - mouse.y;
            const distSq = dx * dx + dy * dy;
            const interactionRadius = 130;
            const interactionRadiusSq = interactionRadius * interactionRadius;

            if (distSq < interactionRadiusSq) {
              const dist = Math.sqrt(distSq);
              const proximity = 1.0 - dist / interactionRadius;

              // Sparkles swell and brighten significantly near mouse
              finalAlpha = Math.min(1.0, p.alpha * (1.0 + proximity * 1.8));
              finalSize = p.size * (1.0 + proximity * 0.4);

              // Subtly pull particle towards cursor coordinates (soft gravity breeze)
              p.x += (mouse.x - p.x) * 0.005;
            }
          }

          // 6. Draw pixel (crisp squares match pixel sparkles aesthetic)
          ctx.fillStyle = `${p.color}${finalAlpha.toFixed(3)})`;
          ctx.fillRect(drawX, drawY, finalSize, finalSize);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 w-full h-full pointer-events-none z-0 bg-transparent"
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "auto 100vh",
      }}
    />
  );
}
