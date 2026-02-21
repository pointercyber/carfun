/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Zap, Shield, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';

// --- Constants ---
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;
const CAR_WIDTH = 40;
const CAR_HEIGHT = 70;
const PLAYER_SPEED = 7;
const INITIAL_ENEMY_SPEED = 5;
const ENEMY_SPAWN_RATE = 1500; // ms
const ROAD_STRIPE_SPEED = 5;

type GameState = 'START' | 'PLAYING' | 'GAMEOVER';

interface GameObject {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface Enemy extends GameObject {
  speed: number;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [difficulty, setDifficulty] = useState(1);
  const [isMobile, setIsMobile] = useState(false);

  // Game Logic Refs
  const playerRef = useRef<GameObject>({
    x: CANVAS_WIDTH / 2 - CAR_WIDTH / 2,
    y: CANVAS_HEIGHT - CAR_HEIGHT - 40,
    width: CAR_WIDTH,
    height: CAR_HEIGHT,
    color: '#00FF00', // Neon Green
  });
  const enemiesRef = useRef<Enemy[]>([]);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const touchRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const requestRef = useRef<number>(null);
  const lastSpawnTimeRef = useRef<number>(0);
  const roadOffsetRef = useRef(0);

  // --- Initialization ---
  useEffect(() => {
    const savedHighScore = localStorage.getItem('neon-velocity-highscore');
    if (savedHighScore) setHighScore(parseInt(savedHighScore));

    const checkMobile = () => {
      setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // --- Input Handling ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key] = true;
      if (gameState === 'START' && e.key === 'Enter') startGame();
      if (gameState === 'GAMEOVER' && e.key === 'r') startGame();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState]);

  const startGame = () => {
    setGameState('PLAYING');
    setScore(0);
    setDifficulty(1);
    enemiesRef.current = [];
    playerRef.current.x = CANVAS_WIDTH / 2 - CAR_WIDTH / 2;
    lastSpawnTimeRef.current = performance.now();
  };

  const gameOver = useCallback(() => {
    setGameState('GAMEOVER');
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('neon-velocity-highscore', score.toString());
    }
    // Reset touch inputs
    touchRef.current = { left: false, right: false };
  }, [score, highScore]);

  // --- Game Loop ---
  const update = useCallback((time: number) => {
    if (gameState !== 'PLAYING') return;

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    // 1. Move Player
    const moveLeft = keysRef.current['ArrowLeft'] || keysRef.current['a'] || touchRef.current.left;
    const moveRight = keysRef.current['ArrowRight'] || keysRef.current['d'] || touchRef.current.right;

    if (moveLeft) {
      playerRef.current.x = Math.max(0, playerRef.current.x - PLAYER_SPEED);
    }
    if (moveRight) {
      playerRef.current.x = Math.min(CANVAS_WIDTH - CAR_WIDTH, playerRef.current.x + PLAYER_SPEED);
    }

    // 2. Spawn Enemies
    const spawnInterval = ENEMY_SPAWN_RATE / difficulty;
    if (time - lastSpawnTimeRef.current > spawnInterval) {
      const laneWidth = CANVAS_WIDTH / 3;
      const lane = Math.floor(Math.random() * 3);
      const x = lane * laneWidth + (laneWidth - CAR_WIDTH) / 2;
      
      enemiesRef.current.push({
        x,
        y: -CAR_HEIGHT,
        width: CAR_WIDTH,
        height: CAR_HEIGHT,
        color: `hsl(${Math.random() * 360}, 100%, 50%)`,
        speed: INITIAL_ENEMY_SPEED * difficulty,
      });
      lastSpawnTimeRef.current = time;
    }

    // 3. Update Enemies & Collision
    enemiesRef.current = enemiesRef.current.filter((enemy) => {
      enemy.y += enemy.speed;

      // Collision Detection
      if (
        playerRef.current.x < enemy.x + enemy.width &&
        playerRef.current.x + playerRef.current.width > enemy.x &&
        playerRef.current.y < enemy.y + enemy.height &&
        playerRef.current.y + playerRef.current.height > enemy.y
      ) {
        gameOver();
      }

      // Score increment when passing enemy
      if (enemy.y > CANVAS_HEIGHT) {
        setScore((s) => s + 10);
        return false;
      }
      return true;
    });

    // 4. Update Difficulty
    setDifficulty(1 + Math.floor(score / 200) * 0.1);

    // 5. Road Animation
    roadOffsetRef.current = (roadOffsetRef.current + ROAD_STRIPE_SPEED * difficulty) % 100;

    // 6. Draw
    draw(ctx);

    requestRef.current = requestAnimationFrame(update);
  }, [gameState, score, difficulty, gameOver]);

  const draw = (ctx: CanvasRenderingContext2D) => {
    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw Road
    ctx.strokeStyle = '#222';
    ctx.setLineDash([20, 20]);
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH / 3, 0);
    ctx.lineTo(CANVAS_WIDTH / 3, CANVAS_HEIGHT);
    ctx.moveTo((CANVAS_WIDTH / 3) * 2, 0);
    ctx.lineTo((CANVAS_WIDTH / 3) * 2, CANVAS_HEIGHT);
    ctx.stroke();

    // Draw Moving Road Stripes
    ctx.strokeStyle = '#444';
    ctx.lineDashOffset = -roadOffsetRef.current;
    ctx.stroke();

    // Draw Player Car (Neon Glow)
    ctx.shadowBlur = 15;
    ctx.shadowColor = playerRef.current.color;
    ctx.fillStyle = playerRef.current.color;
    drawCar(ctx, playerRef.current.x, playerRef.current.y, playerRef.current.width, playerRef.current.height);

    // Draw Enemies
    enemiesRef.current.forEach((enemy) => {
      ctx.shadowBlur = 10;
      ctx.shadowColor = enemy.color;
      ctx.fillStyle = enemy.color;
      drawCar(ctx, enemy.x, enemy.y, enemy.width, enemy.height);
    });

    ctx.shadowBlur = 0; // Reset shadow
  };

  const drawCar = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x + 5, y + 15, w - 10, 15);

    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 5, y + 2, 8, 4);
    ctx.fillRect(x + w - 13, y + 2, 8, 4);

    ctx.fillStyle = '#f00';
    ctx.fillRect(x + 5, y + h - 6, 8, 4);
    ctx.fillRect(x + w - 13, y + h - 6, 8, 4);
  };

  useEffect(() => {
    if (gameState === 'PLAYING') {
      requestRef.current = requestAnimationFrame(update);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, update]);

  return (
    <div className="relative w-full h-screen flex flex-col items-center justify-center bg-zinc-950 overflow-hidden font-mono touch-none">
      <div className="crt-overlay" />
      <div className="scanline" />

      {/* HUD - Top Bar */}
      <div className="w-full max-w-[400px] flex justify-between items-center px-6 py-4 z-20">
        <div className="space-y-0.5">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Score</div>
          <div className="text-2xl font-display text-emerald-400 leading-none">{score.toString().padStart(6, '0')}</div>
        </div>
        <div className="text-right space-y-0.5">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Best</div>
          <div className="text-lg font-display text-zinc-400 leading-none">{highScore.toString().padStart(6, '0')}</div>
        </div>
      </div>

      {/* Game Stage Container */}
      <div 
        ref={containerRef}
        className="relative flex-1 w-full max-w-[400px] max-h-[600px] aspect-[2/3] border-x border-zinc-800/50 shadow-2xl z-10"
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-full bg-zinc-900"
        />

        {/* Overlays */}
        <AnimatePresence>
          {gameState === 'START' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center z-30"
            >
              <motion.h1 
                initial={{ scale: 0.8, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="text-5xl sm:text-6xl font-display text-emerald-500 mb-4 tracking-tighter italic"
              >
                NEON VELOCITY
              </motion.h1>
              <p className="text-zinc-400 mb-12 text-sm max-w-[250px] leading-relaxed">
                Dodge the digital traffic in the grid.
              </p>
              
              <button
                onClick={startGame}
                className="group relative px-10 py-5 bg-emerald-500 text-black font-bold text-lg uppercase tracking-widest hover:bg-emerald-400 active:scale-95 transition-all"
              >
                <div className="absolute -inset-1 border border-emerald-500/50 group-hover:-inset-2 transition-all" />
                Start Engine
              </button>
              
              {!isMobile && (
                <div className="mt-12 grid grid-cols-2 gap-8 text-[10px] text-zinc-500 uppercase tracking-widest">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex gap-1">
                      <kbd className="px-2 py-1 bg-zinc-800 rounded">A</kbd>
                      <kbd className="px-2 py-1 bg-zinc-800 rounded">D</kbd>
                    </div>
                    <span>Steer</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <kbd className="px-4 py-1 bg-zinc-800 rounded">ENTER</kbd>
                    <span>Start</span>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {gameState === 'GAMEOVER' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-red-950/95 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center z-30"
            >
              <motion.div
                initial={{ scale: 0.5, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                className="mb-6 p-4 bg-red-500 text-black rounded-full shadow-lg shadow-red-500/20"
              >
                <AlertTriangle size={48} />
              </motion.div>
              
              <h2 className="text-4xl font-display text-white mb-2 uppercase italic">Wrecked</h2>
              <div className="space-y-4 mb-12">
                <div>
                  <div className="text-[10px] text-red-300 uppercase tracking-widest">Final Score</div>
                  <div className="text-5xl font-display text-white">{score}</div>
                </div>
                {score === highScore && score > 0 && (
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-500 text-black text-[10px] font-bold uppercase tracking-widest rounded">
                    <Trophy size={12} /> New Record
                  </div>
                )}
              </div>

              <button
                onClick={startGame}
                className="group relative px-10 py-5 bg-white text-black font-bold text-lg uppercase tracking-widest hover:bg-zinc-200 active:scale-95 transition-all"
              >
                <div className="absolute -inset-1 border border-white/50 group-hover:-inset-2 transition-all" />
                Restart
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile Touch Controls - Overlay */}
        {gameState === 'PLAYING' && isMobile && (
          <div className="absolute inset-0 flex z-20 pointer-events-none">
            <div 
              className="flex-1 pointer-events-auto active:bg-emerald-500/5 transition-colors flex items-end p-8"
              onTouchStart={() => touchRef.current.left = true}
              onTouchEnd={() => touchRef.current.left = false}
            >
              <div className="p-4 rounded-full bg-zinc-800/50 backdrop-blur-sm border border-zinc-700/50 text-zinc-400">
                <ChevronLeft size={32} />
              </div>
            </div>
            <div 
              className="flex-1 pointer-events-auto active:bg-emerald-500/5 transition-colors flex items-end justify-end p-8"
              onTouchStart={() => touchRef.current.right = true}
              onTouchEnd={() => touchRef.current.right = false}
            >
              <div className="p-4 rounded-full bg-zinc-800/50 backdrop-blur-sm border border-zinc-700/50 text-zinc-400">
                <ChevronRight size={32} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="w-full max-w-[400px] px-6 py-6 flex justify-between text-[10px] text-zinc-600 uppercase tracking-[0.2em] z-20">
        <div className="flex items-center gap-2">
          <Zap size={12} className="text-emerald-500" />
          <span>LVL {Math.floor(difficulty * 10) / 10}</span>
        </div>
        <div className="flex items-center gap-2">
          <Shield size={12} className="text-blue-500" />
          <span>Secure</span>
        </div>
      </div>

      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-10">
        <div className="absolute top-1/4 left-10 w-64 h-64 border border-emerald-500/30 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-10 w-96 h-96 border border-purple-500/30 rounded-full blur-3xl" />
      </div>
    </div>
  );
}

