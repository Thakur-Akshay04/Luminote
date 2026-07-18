"use client";

import { useEffect, useState, useRef } from "react";

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
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseLeave = () => {
      mouseRef.current = null;
    };
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mouseleave", onMouseLeave, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let particlesList: SparkleParticle[][] = [];
    let animationFrameId: number;

    const configs = [
      {
        count: 180,
        baseHeightRatio: 0.45,
        peakHeight: 90,
        speedFactor: 0.06,
        colors: [
          "rgba(255, 255, 255, ",
        ],
        isAmbient: false,
        isTopOnly: false
      },
      {
        count: 140,
        baseHeightRatio: 0.60,
        peakHeight: 65,
        speedFactor: 0.12,
        colors: [
          "rgba(255, 255, 255, ",
        ],
        isAmbient: false,
        isTopOnly: false
      },
      {
        count: 90,
        baseHeightRatio: 0.74,
        peakHeight: 45,
        speedFactor: 0.20,
        colors: [
          "rgba(255, 255, 255, ",
        ],
        isAmbient: false,
        isTopOnly: false
      },
      {
        count: 330, // ambient stars spread across the screen
        baseHeightRatio: 0,
        peakHeight: 0,
        speedFactor: 0.04,
        colors: [
          "rgba(255, 255, 255, ",
        ],
        isAmbient: true,
        isTopOnly: false
      },
      {
        count: 300, // dense starfield specifically for the top fold
        baseHeightRatio: 0,
        peakHeight: 0,
        speedFactor: 0.05,
        colors: [
          "rgba(255, 255, 255, ",
        ],
        isAmbient: false,
        isTopOnly: true
      }
    ];

    const getMountainCurve = (x: number, layerIdx: number, canvasHeight: number) => {
      const baseH = canvasHeight * configs[layerIdx].baseHeightRatio;
      const peak = configs[layerIdx].peakHeight;
      if (layerIdx === 0) {
        return (
          baseH -
          peak *
          (Math.sin(x * 0.0012) * 0.5 +
            Math.sin(x * 0.003 + 1.2) * 0.35 +
            Math.cos(x * 0.007 + 0.5) * 0.15)
        );
      } else if (layerIdx === 1) {
        return (
          baseH -
          peak *
          (Math.sin(x * 0.002 - 0.8) * 0.55 +
            Math.cos(x * 0.005 + 1.8) * 0.3 +
            Math.sin(x * 0.01 - 0.4) * 0.15)
        );
      } else {
        return (
          baseH -
          peak *
          (Math.sin(x * 0.0028 + 2.0) * 0.6 +
            Math.sin(x * 0.006 - 0.9) * 0.3 +
            Math.cos(x * 0.015 + 0.7) * 0.1)
        );
      }
    };

    const generateParticles = (canvasWidth: number, canvasHeight: number) => {
      const list: SparkleParticle[][] = [];

      // Calculate total count of particles to pre-allocate random values
      let totalCount = 0;
      for (let l = 0; l < configs.length; l++) {
        totalCount += configs[l].count;
      }

      // Max 10 random numbers per particle are consumed
      const valsNeeded = totalCount * 10;
      const randomValues = new Uint32Array(valsNeeded);

      // This runs inside useEffect (client-only), so window.crypto is always available
      window.crypto.getRandomValues(randomValues);

      let randIdx = 0;
      const nextRandom = (): number => {
        const val = randomValues[randIdx] / 4294967296;
        randIdx = (randIdx + 1) % valsNeeded;
        return val;
      };

      for (let l = 0; l < configs.length; l++) {
        const layerParticles: SparkleParticle[] = [];
        const conf = configs[l];

        for (let i = 0; i < conf.count; i++) {
          const x = nextRandom() * canvasWidth;

          let y = 0;
          let depthOffset = 0;

          if (conf.isAmbient) {
            y = nextRandom() * canvasHeight;
            depthOffset = 0;
          } else if (conf.isTopOnly) {
            // Concentrated density in the top areas of the screen using exponential bias
            const maxTopHeight = canvasHeight * 0.48;
            y = Math.pow(nextRandom(), 1.4) * maxTopHeight;
            depthOffset = 0;
          } else {
            const mountainY = getMountainCurve(x, l, canvasHeight);
            y = mountainY;
            const maxDepth = canvasHeight - mountainY;
            depthOffset = nextRandom() * maxDepth;
          }

          // Back/ambient/top sparkles are tiny, front are slightly larger
          const baseSize = (conf.isAmbient || conf.isTopOnly) ? 0.6 : l === 0 ? 0.9 : l === 1 ? 1.4 : 1.9;
          const size = baseSize + nextRandom() * 0.8;

          const colorBase = conf.colors[Math.floor(nextRandom() * conf.colors.length)];
          const isSlow = conf.isAmbient || conf.isTopOnly;
          const twinkleSpeed = (isSlow ? 0.004 : 0.007) + nextRandom() * 0.012;
          const phase = nextRandom() * Math.PI * 2;
          const driftX = (nextRandom() - 0.5) * (isSlow ? 0.02 : 0.04);

          layerParticles.push({
            x,
            y,
            depthOffset,
            size,
            color: colorBase,
            alpha: nextRandom() * 0.5 + 0.1,
            targetAlpha: nextRandom() * (isSlow ? 0.55 : 0.7) + 0.2,
            twinkleSpeed,
            phase,
            driftX,
          });
        }
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
      if (!ctx || particlesList.length === 0) return;

      ctx.clearRect(0, 0, width, height);

      const currentScrollY = scrollYRef.current;
      const mouse = mouseRef.current;

      for (let l = 0; l < particlesList.length; l++) {
        const layer = particlesList[l];
        const conf = configs[l];

        for (let i = 0; i < layer.length; i++) {
          const p = layer[i];

          // 1. Update twinkling phase & alpha opacity
          p.phase += p.twinkleSpeed;
          p.alpha = (Math.sin(p.phase) * 0.5 + 0.5) * p.targetAlpha;

          // 2. Wrap/drift X position
          p.x += p.driftX;
          if (p.x < 0) p.x += width;
          if (p.x > width) p.x -= width;

          // 3. Compute dynamic drawn Y position (ambient wraps, mountains and top stars culled)
          let drawY = 0;
          if (conf.isAmbient) {
            drawY = p.y - currentScrollY * conf.speedFactor;
            drawY = ((drawY % height) + height) % height;
          } else {
            // For both mountains and Top Starfield:
            drawY = (p.y + p.depthOffset) - currentScrollY * conf.speedFactor;

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
