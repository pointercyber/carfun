/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Zap, Shield, AlertTriangle, ChevronLeft, ChevronRight, Coins, Lock } from 'lucide-react';

// --- Constants ---
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;
const CAR_WIDTH = 40;
const CAR_HEIGHT = 70;
const PLAYER_SPEED = 10;
const INITIAL_ENEMY_SPEED = 7;
const ENEMY_SPAWN_RATE = 1200; // ms
const ROAD_STRIPE_SPEED = 5;

const UNLOCKABLES = {
  COLORS: [
    { id: 'green', color: '#00FF00', cost: 0 },
    { id: 'blue', color: '#3b82f6', cost: 50 },
    { id: 'red', color: '#ef4444', cost: 100 },
    { id: 'purple', color: '#a855f7', cost: 150 },
    { id: 'gold', color: '#f59e0b', cost: 500 },
    { id: 'cyan', color: '#06b6d4', cost: 200 },
    { id: 'pink', color: '#ec4899', cost: 250 },
  ],
  SPOILERS: [
    { id: 'NONE' as SpoilerType, cost: 0 },
    { id: 'SPORT' as SpoilerType, cost: 100 },
    { id: 'WING' as SpoilerType, cost: 250 },
    { id: 'GT' as SpoilerType, cost: 500 },
  ],
  TIRES: [
    { id: 'STANDARD' as TireType, cost: 0 },
    { id: 'GRIP' as TireType, cost: 200 },
    { id: 'DRIFT' as TireType, cost: 200 },
  ]
};

type PowerUpType = 'SHIELD' | 'BOOST' | 'MULTIPLIER' | 'COIN';
type ObstacleType = 'CAR' | 'BARRIER' | 'OIL' | 'LASER' | 'GRAVITY' | 'PLATFORM' | 'CHASER';
type SpoilerType = 'NONE' | 'SPORT' | 'WING' | 'GT';
type TireType = 'STANDARD' | 'GRIP' | 'DRIFT';
type EngineSoundType = 'V8' | 'TURBO' | 'ELECTRIC';

interface PowerUp extends GameObject {
  type: PowerUpType;
  speed: number;
}

type GameState = 'START' | 'PLAYING' | 'GAMEOVER' | 'SETTINGS';
type DifficultyLevel = 'EASY' | 'NORMAL' | 'HARD';
type SoundMode = 'GOPI' | 'RETRO' | 'MODERN';

const SOUND_MODES = {
  GOPI: {
    crash: 'https://rad-pie-250f2f.netlify.app/sounds/s1.mp3',
    move: 'https://rad-pie-250f2f.netlify.app/sounds/old.mp3'
  },
  RETRO: {
    crash: 'https://rad-pie-250f2f.netlify.app/sounds/s1.mp3',
    move: 'https://rad-pie-250f2f.netlify.app/sounds/old.mp3'
  },
  MODERN: {
    crash: 'https://rad-pie-250f2f.netlify.app/sounds/s1.mp3',
    move: 'https://rad-pie-250f2f.netlify.app/sounds/old.mp3'
  }
};

interface GameObject {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface Enemy extends GameObject {
  type: ObstacleType;
  speed: number;
  vx?: number;
  direction?: number;
  timer?: number;
  active?: boolean;
  pull?: number;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [difficulty, setDifficulty] = useState(1);
  const [difficultyLevel, setDifficultyLevel] = useState<DifficultyLevel>('NORMAL');
  const [soundMode, setSoundMode] = useState<SoundMode>('GOPI');

  const updateDifficultyLevel = (level: DifficultyLevel) => {
    setDifficultyLevel(level);
    localStorage.setItem('neon-velocity-difficulty-level', level);
  };

  const [isMobile, setIsMobile] = useState(false);
  const [carColor, setCarColor] = useState('#00FF00');
  const [spoilerType, setSpoilerType] = useState<SpoilerType>('NONE');
  const [tireType, setTireType] = useState<TireType>('STANDARD');
  const [engineSoundType, setEngineSoundType] = useState<EngineSoundType>('V8');
  const [activeShield, setActiveShield] = useState(0); // duration in frames
  const [activeMultiplier, setActiveMultiplier] = useState(0); // duration in frames
  const [activeBoost, setActiveBoost] = useState(0); // duration in frames
  const [isSliding, setIsSliding] = useState(0); // duration in frames
  const [coins, setCoins] = useState(0);
  const [unlockedItems, setUnlockedItems] = useState<{
    colors: string[];
    spoilers: SpoilerType[];
    tires: TireType[];
  }>({
    colors: ['#00FF00'],
    spoilers: ['NONE'],
    tires: ['STANDARD'],
  });

  const buyItem = (type: 'color' | 'spoiler' | 'tire', id: string, cost: number) => {
    const isUnlocked = 
      type === 'color' ? unlockedItems.colors.includes(id) :
      type === 'spoiler' ? unlockedItems.spoilers.includes(id as SpoilerType) :
      unlockedItems.tires.includes(id as TireType);

    if (isUnlocked) return true;

    if (coins >= cost) {
      setCoins(c => {
        const newCoins = c - cost;
        localStorage.setItem('neon-velocity-coins', newCoins.toString());
        return newCoins;
      });
      setUnlockedItems(prev => {
        const next = { ...prev };
        if (type === 'color') next.colors = [...next.colors, id];
        if (type === 'spoiler') next.spoilers = [...next.spoilers, id as SpoilerType];
        if (type === 'tire') next.tires = [...next.tires, id as TireType];
        localStorage.setItem('neon-velocity-unlocked', JSON.stringify(next));
        return next;
      });
      return true;
    }
    return false;
  };

  // --- Sound System ---
  const audioCtx = useRef<AudioContext | null>(null);

  const playSound = (type: 'collect' | 'crash' | 'highscore' | 'engine') => {
    if (type === 'crash') {
      const crashSound = document.getElementById('crash-sound') as HTMLAudioElement;
      if (crashSound) {
        crashSound.src = SOUND_MODES[soundMode].crash;
        crashSound.currentTime = 0;
        crashSound.play().catch(() => {});
      }
    } else if (type === 'engine') {
      const moveSound = document.getElementById('move-sound') as HTMLAudioElement;
      if (moveSound) {
        if (moveSound.src !== SOUND_MODES[soundMode].move) {
          moveSound.src = SOUND_MODES[soundMode].move;
        }
        if (moveSound.paused) {
          moveSound.play().catch(() => {});
        }
      }
    }
  };

  // Game Logic Refs
  const playerRef = useRef<GameObject>({
    x: CANVAS_WIDTH / 2 - CAR_WIDTH / 2,
    y: CANVAS_HEIGHT - CAR_HEIGHT - 40,
    width: CAR_WIDTH,
    height: CAR_HEIGHT,
    color: '#00FF00',
  });
  const enemiesRef = useRef<Enemy[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const touchRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const requestRef = useRef<number>(null);
  const lastSpawnTimeRef = useRef<number>(0);
  const roadOffsetRef = useRef(0);
  const lastCoinRewardTimeRef = useRef<number>(0);

  // --- Initialization ---
  useEffect(() => {
    const savedHighScore = localStorage.getItem('neon-velocity-highscore');
    if (savedHighScore) setHighScore(parseInt(savedHighScore));

    const savedCoins = localStorage.getItem('neon-velocity-coins');
    if (savedCoins) setCoins(parseInt(savedCoins));

    const savedUnlocked = localStorage.getItem('neon-velocity-unlocked');
    if (savedUnlocked) setUnlockedItems(JSON.parse(savedUnlocked));

    const savedDifficulty = localStorage.getItem('neon-velocity-difficulty-level');
    if (savedDifficulty) setDifficultyLevel(savedDifficulty as DifficultyLevel);

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
    setDifficulty(difficultyLevel === 'EASY' ? 0.7 : difficultyLevel === 'HARD' ? 1.5 : 1);
    enemiesRef.current = [];
    powerUpsRef.current = [];
    setActiveShield(0);
    setActiveMultiplier(0);
    setActiveBoost(0);
    setIsSliding(0);
    playerRef.current.x = CANVAS_WIDTH / 2 - CAR_WIDTH / 2;
    playerRef.current.color = carColor;
    lastSpawnTimeRef.current = performance.now();
    lastCoinRewardTimeRef.current = performance.now();
  };

  const gameOver = useCallback(() => {
    setGameState('GAMEOVER');
    
    playSound('crash');
    
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

    // 0. Update Survival Coin Reward
    if (time - lastCoinRewardTimeRef.current > 5000) { // Every 5 seconds
      setCoins(c => {
        const newCoins = c + 1;
        localStorage.setItem('neon-velocity-coins', newCoins.toString());
        return newCoins;
      });
      lastCoinRewardTimeRef.current = time;
    }

    // 1. Move Player
    const basePlayerSpeed = tireType === 'GRIP' ? 9 : tireType === 'DRIFT' ? 11 : 7;
    const currentSpeed = basePlayerSpeed * (activeBoost > 0 ? 1.5 : 1);
    const moveLeft = keysRef.current['ArrowLeft'] || keysRef.current['a'] || touchRef.current.left;
    const moveRight = keysRef.current['ArrowRight'] || keysRef.current['d'] || touchRef.current.right;

    if ((moveLeft || moveRight) && isSliding === 0) {
      playSound('engine');
      
      if (moveLeft) {
        playerRef.current.x = Math.max(0, playerRef.current.x - currentSpeed);
      }
      if (moveRight) {
        playerRef.current.x = Math.min(CANVAS_WIDTH - CAR_WIDTH, playerRef.current.x + currentSpeed);
      }
    } else if (isSliding > 0) {
      // Automatic drift when sliding
      playerRef.current.x += Math.sin(time / 100) * 3;
      playerRef.current.x = Math.max(0, Math.min(CANVAS_WIDTH - CAR_WIDTH, playerRef.current.x));
    }

    // Apply Gravity Zone Pull
    enemiesRef.current.forEach(enemy => {
      if (enemy.type === 'GRAVITY' && enemy.pull !== undefined) {
        // Check if player is within the gravity zone's Y range
        if (playerRef.current.y < enemy.y + enemy.height && playerRef.current.y + playerRef.current.height > enemy.y) {
          // Dynamic pull: varies over time
          const timeFactor = 0.8 + Math.sin(time / 250) * 0.4;
          playerRef.current.x += enemy.pull * timeFactor;
          playerRef.current.x = Math.max(0, Math.min(CANVAS_WIDTH - CAR_WIDTH, playerRef.current.x));
        }
      }
    });

    // 2. Spawn Enemies & Power-ups
    const spawnInterval = (ENEMY_SPAWN_RATE / difficulty) * (activeBoost > 0 ? 0.5 : 1);
    if (time - lastSpawnTimeRef.current > spawnInterval) {
      const spawnCount = difficulty > 1.5 && Math.random() > 0.5 ? 2 : 1;
      const spawnedX: number[] = [];
      
      for (let i = 0; i < spawnCount; i++) {
        let x: number;
        let attempts = 0;
        // Try to find a non-overlapping X position
        do {
          x = Math.random() * (CANVAS_WIDTH - CAR_WIDTH);
          attempts++;
        } while (
          spawnedX.some(sx => Math.abs(sx - x) < CAR_WIDTH + 20) && 
          attempts < 10
        );
        spawnedX.push(x);
        
        const rand = Math.random();
        if (rand < 0.4) {
          // Coin
          powerUpsRef.current.push({
            x: x + (CAR_WIDTH - 25) / 2,
            y: -CAR_HEIGHT,
            width: 25,
            height: 25,
            type: 'COIN',
            color: '#FFD700',
            speed: INITIAL_ENEMY_SPEED * difficulty,
          });
        } else if (i === 0 && rand < 0.25) {
          // Power-up
          const types: PowerUpType[] = ['SHIELD', 'BOOST', 'MULTIPLIER'];
          const type = types[Math.floor(Math.random() * types.length)];
          powerUpsRef.current.push({
            x,
            y: -CAR_HEIGHT,
            width: 30,
            height: 30,
            type,
            color: type === 'SHIELD' ? '#3b82f6' : type === 'BOOST' ? '#f59e0b' : '#a855f7',
            speed: INITIAL_ENEMY_SPEED * difficulty,
          });
        } else if (rand < 0.35 && difficulty > 1.2) {
          // Moving Barrier
          enemiesRef.current.push({
            x,
            y: -CAR_HEIGHT,
            width: CAR_WIDTH * 1.5,
            height: 30,
            type: 'BARRIER',
            color: '#ef4444',
            speed: INITIAL_ENEMY_SPEED * difficulty * 0.8,
            vx: 2 * difficulty,
            direction: Math.random() > 0.5 ? 1 : -1,
          });
        } else if (rand < 0.3 && difficulty > 1.1) {
          // Oil Slick
          enemiesRef.current.push({
            x: Math.max(10, Math.min(CANVAS_WIDTH - 110, x)),
            y: -CAR_HEIGHT,
            width: 100,
            height: 50,
            type: 'OIL',
            color: 'rgba(50, 50, 50, 0.8)',
            speed: INITIAL_ENEMY_SPEED * difficulty,
          });
        } else if (rand < 0.4 && difficulty > 1.3) {
          // Laser Grid
          enemiesRef.current.push({
            x: 0,
            y: -CAR_HEIGHT,
            width: CANVAS_WIDTH,
            height: 10,
            type: 'LASER',
            color: '#ff00ff',
            speed: INITIAL_ENEMY_SPEED * difficulty * 0.7,
            timer: 0,
            active: false,
          });
        } else if (rand < 0.5 && difficulty > 1.4) {
          // Gravity Zone
          const pullDir = Math.random() > 0.5 ? 1 : -1;
          const pullStrength = (3 + Math.random() * 3) * difficulty;
          enemiesRef.current.push({
            x: 0,
            y: -CAR_HEIGHT,
            width: CANVAS_WIDTH,
            height: 150,
            type: 'GRAVITY',
            color: 'rgba(100, 100, 255, 0.2)',
            speed: INITIAL_ENEMY_SPEED * difficulty * 0.6,
            pull: pullDir * pullStrength,
          });
        } else if (rand < 0.6 && difficulty > 1.5) {
          // Holographic Platform
          enemiesRef.current.push({
            x,
            y: -CAR_HEIGHT,
            width: CAR_WIDTH * 1.5,
            height: 20,
            type: 'PLATFORM',
            color: '#00ffff',
            speed: INITIAL_ENEMY_SPEED * difficulty,
            timer: 0,
            active: true,
          });
        } else if (rand < 0.7 && difficulty > 1.6) {
          // Chaser Car
          enemiesRef.current.push({
            x,
            y: -CAR_HEIGHT,
            width: CAR_WIDTH,
            height: CAR_HEIGHT,
            type: 'CHASER',
            color: '#ff4400',
            speed: INITIAL_ENEMY_SPEED * difficulty * 1.1,
            vx: 0,
          });
        } else {
          // Standard Car
          enemiesRef.current.push({
            x,
            y: -CAR_HEIGHT,
            width: CAR_WIDTH,
            height: CAR_HEIGHT,
            type: 'CAR',
            color: `hsl(${Math.random() * 360}, 100%, 50%)`,
            speed: INITIAL_ENEMY_SPEED * difficulty,
          });
        }
      }
      lastSpawnTimeRef.current = time;
    }

    // 3. Update Power-ups
    powerUpsRef.current = powerUpsRef.current.filter(p => {
      p.y += p.speed;
      if (
        playerRef.current.x < p.x + p.width &&
        playerRef.current.x + playerRef.current.width > p.x &&
        playerRef.current.y < p.y + p.height &&
        playerRef.current.y + playerRef.current.height > p.y
      ) {
        playSound('collect');
        if (p.type === 'SHIELD') setActiveShield(300);
        if (p.type === 'BOOST') setActiveBoost(200);
        if (p.type === 'MULTIPLIER') setActiveMultiplier(400);
        if (p.type === 'COIN') {
          setCoins(c => {
            const newCoins = c + 1;
            localStorage.setItem('neon-velocity-coins', newCoins.toString());
            return newCoins;
          });
        }
        return false;
      }
      return p.y <= CANVAS_HEIGHT;
    });

    // 4. Update Enemies & Collision
    enemiesRef.current = enemiesRef.current.filter((enemy) => {
      enemy.y += enemy.speed * (activeBoost > 0 ? 1.5 : 1);

      // Moving Barrier Logic
      if (enemy.type === 'BARRIER' && enemy.vx !== undefined && enemy.direction !== undefined) {
        enemy.x += enemy.vx * enemy.direction;
        if (enemy.x <= 0 || enemy.x + enemy.width >= CANVAS_WIDTH) {
          enemy.direction *= -1;
        }
      }

      // Laser Logic
      if (enemy.type === 'LASER' && enemy.timer !== undefined) {
        enemy.timer += 1;
        if (enemy.timer > 60) { // Toggle every 1 second
          enemy.active = !enemy.active;
          enemy.timer = 0;
        }
      }

      // Platform Logic
      if (enemy.type === 'PLATFORM' && enemy.timer !== undefined) {
        enemy.timer += 1;
        if (enemy.timer > 40) { // Flicker every 0.6s
          enemy.active = !enemy.active;
          enemy.timer = 0;
        }
      }

      // Chaser Logic
      if (enemy.type === 'CHASER') {
        const dx = playerRef.current.x - enemy.x;
        const chaseSpeed = 1.5 * difficulty;
        enemy.x += Math.sign(dx) * Math.min(Math.abs(dx), chaseSpeed);
      }

      // Collision Detection
      if (
        playerRef.current.x < enemy.x + enemy.width &&
        playerRef.current.x + playerRef.current.width > enemy.x &&
        playerRef.current.y < enemy.y + enemy.height &&
        playerRef.current.y + playerRef.current.height > enemy.y
      ) {
        if (enemy.type === 'OIL') {
          setIsSliding(60); // 1 second of sliding
          return true; 
        }

        if (enemy.type === 'GRAVITY') {
          return true; // Gravity zone itself doesn't kill
        }

        if (enemy.type === 'LASER' && !enemy.active) {
          return true; // Laser is safe when inactive
        }

        if (enemy.type === 'PLATFORM' && !enemy.active) {
          return true; // Platform is safe when inactive
        }

        if (activeShield > 0) {
          setActiveShield(0);
          playSound('crash');
          return false;
        } else {
          gameOver();
        }
      }

      // Score increment when passing enemy
      if (enemy.y > CANVAS_HEIGHT) {
        if (enemy.type !== 'OIL' && enemy.type !== 'GRAVITY') {
          setScore((s) => s + (10 * (activeMultiplier > 0 ? 2 : 1)));
        }
        return false;
      }
      return true;
    });

    // 5. Update Active Power-up Timers
    if (activeShield > 0) setActiveShield(s => s - 1);
    if (activeMultiplier > 0) setActiveMultiplier(m => m - 1);
    if (activeBoost > 0) setActiveBoost(b => b - 1);
    if (isSliding > 0) setIsSliding(s => s - 1);

    // 6. Update Difficulty
    const baseDiff = difficultyLevel === 'EASY' ? 1.2 : difficultyLevel === 'HARD' ? 3.5 : 2.5;
    setDifficulty(baseDiff + Math.floor(score / 100) * 0.35);

    // 7. Road Animation
    roadOffsetRef.current = (roadOffsetRef.current + ROAD_STRIPE_SPEED * difficulty * (activeBoost > 0 ? 2 : 1)) % 100;

    // 8. Draw
    draw(ctx, time);

    requestRef.current = requestAnimationFrame(update);
  }, [gameState, score, difficulty, gameOver]);

  const draw = (ctx: CanvasRenderingContext2D, time: number) => {
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

    // Draw Power-ups & Coins
    powerUpsRef.current.forEach(p => {
      ctx.shadowBlur = 15;
      ctx.shadowColor = p.color;
      ctx.fillStyle = p.color;
      
      if (p.type === 'COIN') {
        // Spinning coin effect
        const spin = Math.sin(time / 150);
        ctx.beginPath();
        ctx.ellipse(p.x + p.width / 2, p.y + p.height / 2, (p.width / 2) * Math.abs(spin), p.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x + p.width / 2, p.y + p.height / 2, p.width / 2, 0, Math.PI * 2);
        ctx.fill();
        // Icon placeholder
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.type[0], p.x + p.width / 2, p.y + p.height / 2 + 4);
      }
    });

    // Draw Player Car (Neon Glow)
    const isBoosted = activeBoost > 0;
    const isShielded = activeShield > 0;
    const isMultiplied = activeMultiplier > 0;

    // 1. Boost Streaks (Behind car)
    if (isBoosted) {
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const xOff = ((i * 7) % playerRef.current.width) - playerRef.current.width / 2 + 20;
        const yOff = (time / 2 + i * 15) % 40;
        ctx.beginPath();
        ctx.moveTo(playerRef.current.x + xOff, playerRef.current.y + playerRef.current.height + yOff);
        ctx.lineTo(playerRef.current.x + xOff, playerRef.current.y + playerRef.current.height + yOff + 20);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Multiplier Aura (Under car)
    if (isMultiplied) {
      ctx.save();
      const shimmer = Math.sin(time / 100) * 5;
      ctx.shadowBlur = 25 + shimmer;
      ctx.shadowColor = '#a855f7';
      ctx.fillStyle = `rgba(168, 85, 247, ${0.15 + Math.sin(time / 200) * 0.05})`;
      ctx.beginPath();
      ctx.arc(playerRef.current.x + playerRef.current.width / 2, playerRef.current.y + playerRef.current.height / 2, 45 + shimmer, 0, Math.PI * 2);
      ctx.fill();

      // Rotating shimmering rings
      ctx.strokeStyle = `rgba(168, 85, 247, ${0.3 + Math.sin(time / 150) * 0.2})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        const radius = 40 + i * 10 + Math.sin(time / 200 + i) * 5;
        const rotation = (time / 1000) * (i % 2 === 0 ? 1 : -1);
        ctx.ellipse(playerRef.current.x + playerRef.current.width / 2, playerRef.current.y + playerRef.current.height / 2, radius * 1.2, radius, rotation, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.shadowBlur = isShielded ? 30 : 15;
    ctx.shadowColor = isShielded ? '#3b82f6' : playerRef.current.color;
    ctx.fillStyle = playerRef.current.color;
    drawCar(ctx, playerRef.current.x, playerRef.current.y, playerRef.current.width, playerRef.current.height, true);
    
    // 3. Shield Pulse (Over car)
    if (isShielded) {
      ctx.save();
      const pulse = Math.sin(time / 150);
      ctx.strokeStyle = `rgba(59, 130, 246, ${0.4 + pulse * 0.2})`;
      ctx.lineWidth = 3 + pulse;
      ctx.shadowBlur = 15 + pulse * 10;
      ctx.shadowColor = '#3b82f6';
      ctx.beginPath();
      ctx.arc(playerRef.current.x + playerRef.current.width / 2, playerRef.current.y + playerRef.current.height / 2, 52 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      
      // Hexagon pattern overlay on shield
      ctx.setLineDash([5, 10]);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 + pulse * 0.1})`;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Draw Enemies
    enemiesRef.current.forEach((enemy) => {
      ctx.shadowBlur = 10;
      ctx.shadowColor = enemy.color;
      ctx.fillStyle = enemy.color;
      
      if (enemy.type === 'BARRIER') {
        // Draw a striped barrier
        ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
        ctx.strokeStyle = '#fff';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(enemy.x, enemy.y + enemy.height / 2);
        ctx.lineTo(enemy.x + enemy.width, enemy.y + enemy.height / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (enemy.type === 'OIL') {
        // Draw an amorphous blob
        ctx.beginPath();
        ctx.ellipse(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.width / 2, enemy.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        // Add some "shine"
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.ellipse(enemy.x + enemy.width / 3, enemy.y + enemy.height / 3, 5, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (enemy.type === 'LASER') {
        if (enemy.active) {
          ctx.shadowBlur = 20;
          ctx.shadowColor = '#ff00ff';
          ctx.fillStyle = '#ff00ff';
          ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
        } else {
          // Warning state
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(255, 0, 255, 0.2)';
          ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
          ctx.strokeStyle = 'rgba(255, 0, 255, 0.5)';
          ctx.setLineDash([2, 2]);
          ctx.strokeRect(enemy.x, enemy.y, enemy.width, enemy.height);
          ctx.setLineDash([]);
        }
      } else if (enemy.type === 'GRAVITY') {
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.fillStyle = enemy.color;
        ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
        
        // Draw swirling vortex effect
        const centerX = CANVAS_WIDTH / 2;
        const centerY = enemy.y + enemy.height / 2;
        ctx.strokeStyle = 'rgba(100, 100, 255, 0.4)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          const radius = 40 + i * 30;
          const rotation = (time / 500) * (enemy.pull! > 0 ? 1 : -1) + i;
          ctx.ellipse(centerX, centerY, radius * 2, radius / 2, rotation, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Draw arrows indicating pull direction
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        const arrowX = enemy.pull! > 0 ? CANVAS_WIDTH - 40 : 40;
        ctx.beginPath();
        if (enemy.pull! > 0) {
          ctx.moveTo(arrowX, enemy.y + 20);
          ctx.lineTo(arrowX + 20, enemy.y + enemy.height / 2);
          ctx.lineTo(arrowX, enemy.y + enemy.height - 20);
        } else {
          ctx.moveTo(arrowX, enemy.y + 20);
          ctx.lineTo(arrowX - 20, enemy.y + enemy.height / 2);
          ctx.lineTo(arrowX, enemy.y + enemy.height - 20);
        }
        ctx.fill();
        ctx.restore();
      } else if (enemy.type === 'PLATFORM') {
        if (enemy.active) {
          ctx.shadowBlur = 15;
          ctx.shadowColor = '#00ffff';
          ctx.fillStyle = 'rgba(0, 255, 255, 0.6)';
          ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
          ctx.strokeStyle = '#fff';
          ctx.strokeRect(enemy.x, enemy.y, enemy.width, enemy.height);
        } else {
          // Ghostly state
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
          ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
        }
      } else if (enemy.type === 'CHASER') {
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff4400';
        drawCar(ctx, enemy.x, enemy.y, enemy.width, enemy.height, false);
        // Add some aggressive detail
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(enemy.x + 10, enemy.y + 10, enemy.width - 20, 5);
      } else {
        drawCar(ctx, enemy.x, enemy.y, enemy.width, enemy.height, false);
      }
    });

    ctx.shadowBlur = 0; // Reset shadow
  };

  const drawCar = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, isPlayer: boolean = false) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    
    // Windows
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x + 5, y + 15, w - 10, 15);

    // Headlights
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 5, y + 2, 8, 4);
    ctx.fillRect(x + w - 13, y + 2, 8, 4);

    // Taillights
    ctx.fillStyle = '#f00';
    ctx.fillRect(x + 5, y + h - 6, 8, 4);
    ctx.fillRect(x + w - 13, y + h - 6, 8, 4);

    // Spoiler (Player only)
    if (isPlayer && spoilerType !== 'NONE') {
      ctx.fillStyle = playerRef.current.color;
      if (spoilerType === 'SPORT') {
        ctx.fillRect(x + 2, y + h - 2, w - 4, 4);
      } else if (spoilerType === 'WING') {
        ctx.fillRect(x - 2, y + h - 4, w + 4, 6);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x + 5, y + h - 4, w - 10, 2);
      } else if (spoilerType === 'GT') {
        ctx.fillRect(x - 5, y + h - 8, w + 10, 8);
        ctx.clearRect(x + 5, y + h - 6, w - 10, 4);
      }
    }

    // Tires (Visual indicator)
    if (isPlayer) {
      ctx.fillStyle = tireType === 'GRIP' ? '#3b82f6' : tireType === 'DRIFT' ? '#f43f5e' : '#333';
      ctx.fillRect(x - 2, y + 10, 4, 12);
      ctx.fillRect(x + w - 2, y + 10, 4, 12);
      ctx.fillRect(x - 2, y + h - 22, 4, 12);
      ctx.fillRect(x + w - 2, y + h - 22, 4, 12);
    }
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
          <div className="flex items-center gap-3">
            <div className="text-2xl font-display text-emerald-400 leading-none">
              {score.toString().padStart(6, '0')}
            </div>
            {activeMultiplier > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-purple-400 leading-none">x2</span>
                <div className="w-8 h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-purple-500"
                    initial={false}
                    animate={{ width: `${(activeMultiplier / 400) * 100}%` }}
                    transition={{ duration: 0.1 }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-4">
          {activeShield > 0 && (
            <div className="flex flex-col items-center gap-1">
              <Shield size={16} className="text-blue-400 animate-pulse" />
              <div className="w-6 h-0.5 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-blue-500"
                  animate={{ width: `${(activeShield / 300) * 100}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            </div>
          )}
          {activeBoost > 0 && (
            <div className="flex flex-col items-center gap-1">
              <Zap size={16} className="text-amber-400 animate-bounce" />
              <div className="w-6 h-0.5 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-amber-500"
                  animate={{ width: `${(activeBoost / 200) * 100}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            </div>
          )}
          {isSliding > 0 && <AlertTriangle size={16} className="text-zinc-400 animate-ping" />}
        </div>
        <div className="text-right space-y-0.5">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Coins</div>
          <div className="flex items-center justify-end gap-1 text-lg font-display text-amber-400 leading-none">
            <Coins size={14} />
            <span>{coins}</span>
          </div>
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
              <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="mb-6"
              >
                <img 
                  src="https://rad-pie-250f2f.netlify.app/images/sura.jpg" 
                  alt="Sura Title" 
                  className="w-48 h-auto rounded-lg shadow-2xl border border-white/20"
                  referrerPolicy="no-referrer"
                />
              </motion.div>
              <motion.h1 
                initial={{ scale: 0.8, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="text-5xl sm:text-6xl font-display text-emerald-500 mb-4 tracking-tighter italic"
              >
                NEON VELOCITY
              </motion.h1>
              <p className="text-zinc-400 mb-8 text-sm max-w-[250px] leading-relaxed">
                Dodge the digital traffic in the grid.
              </p>

              <div className="mb-10 w-full max-w-[280px]">
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3 block">Select Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['EASY', 'NORMAL', 'HARD'] as DifficultyLevel[]).map(level => (
                    <button
                      key={level}
                      onClick={() => updateDifficultyLevel(level)}
                      className={`py-2 text-[10px] font-bold uppercase tracking-widest border transition-all ${difficultyLevel === level ? 'bg-white text-black border-white' : 'bg-transparent text-zinc-500 border-zinc-800 hover:border-zinc-600'}`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-10 w-full max-w-[280px]">
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3 block">Sound Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['GOPI', 'RETRO', 'MODERN'] as SoundMode[]).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setSoundMode(mode)}
                      className={`py-2 text-[10px] font-bold uppercase tracking-widest border transition-all ${soundMode === mode ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-transparent text-zinc-500 border-zinc-800 hover:border-zinc-600'}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex flex-col gap-3">
                <button
                  onClick={startGame}
                  className="group relative px-10 py-5 bg-emerald-500 text-black font-bold text-lg uppercase tracking-widest hover:bg-emerald-400 active:scale-95 transition-all"
                >
                  <div className="absolute -inset-1 border border-emerald-500/50 group-hover:-inset-2 transition-all" />
                  Start Engine
                </button>
                <button
                  onClick={() => setGameState('SETTINGS')}
                  className="px-10 py-3 bg-zinc-800 text-white font-bold text-sm uppercase tracking-widest hover:bg-zinc-700 transition-all"
                >
                  Settings
                </button>
              </div>
              
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

          {gameState === 'SETTINGS' && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute inset-0 bg-black/95 backdrop-blur-md flex flex-col p-8 z-40 overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-display text-white uppercase italic tracking-tighter">Garage</h2>
                <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900 rounded-full border border-zinc-800">
                  <Coins size={14} className="text-amber-400" />
                  <span className="text-sm font-bold text-white">{coins}</span>
                </div>
              </div>
              
              <div className="space-y-8 text-left">
                <section>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3 block">Car Color</label>
                  <div className="flex flex-wrap gap-3">
                    {UNLOCKABLES.COLORS.map(item => {
                      const isUnlocked = unlockedItems.colors.includes(item.color);
                      const isSelected = carColor === item.color;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (isUnlocked) setCarColor(item.color);
                            else buyItem('color', item.color, item.cost);
                          }}
                          className={`relative w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center ${isSelected ? 'border-white scale-110 shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'border-transparent'}`}
                          style={{ backgroundColor: item.color }}
                        >
                          {!isUnlocked && (
                            <div className="absolute inset-0 bg-black/40 rounded-full flex flex-col items-center justify-center">
                              <Lock size={12} className="text-white" />
                              <span className="text-[8px] font-bold text-white">{item.cost}</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3 block">Spoiler Design</label>
                  <div className="grid grid-cols-2 gap-2">
                    {UNLOCKABLES.SPOILERS.map(item => {
                      const isUnlocked = unlockedItems.spoilers.includes(item.id);
                      const isSelected = spoilerType === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (isUnlocked) setSpoilerType(item.id);
                            else buyItem('spoiler', item.id, item.cost);
                          }}
                          className={`group relative py-3 px-4 text-[10px] font-bold uppercase tracking-widest border transition-all flex justify-between items-center ${isSelected ? 'bg-white text-black border-white' : 'bg-transparent text-zinc-500 border-zinc-800'}`}
                        >
                          <span>{item.id}</span>
                          {!isUnlocked && (
                            <div className="flex items-center gap-1">
                              <Lock size={10} />
                              <span>{item.cost}</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3 block">Tire Compound</label>
                  <div className="grid grid-cols-1 gap-2">
                    {UNLOCKABLES.TIRES.map(item => {
                      const isUnlocked = unlockedItems.tires.includes(item.id);
                      const isSelected = tireType === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (isUnlocked) setTireType(item.id);
                            else buyItem('tire', item.id, item.cost);
                          }}
                          className={`group relative py-3 px-4 text-[10px] font-bold uppercase tracking-widest border transition-all flex justify-between items-center ${isSelected ? 'bg-white text-black border-white' : 'bg-transparent text-zinc-500 border-zinc-800'}`}
                        >
                          <div className="flex flex-col items-start">
                            <span>{item.id}</span>
                            <span className="text-[8px] opacity-60 font-normal normal-case italic">
                              {item.id === 'STANDARD' && 'Balanced performance.'}
                              {item.id === 'GRIP' && 'Better traction, faster steering.'}
                              {item.id === 'DRIFT' && 'Extreme speed, high momentum.'}
                            </span>
                          </div>
                          {!isUnlocked && (
                            <div className="flex items-center gap-1">
                              <Lock size={10} />
                              <span>{item.cost}</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3 block">Engine Sound</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['V8', 'TURBO', 'ELECTRIC'] as EngineSoundType[]).map(type => (
                      <button
                        key={type}
                        onClick={() => setEngineSoundType(type)}
                        className={`py-2 text-[10px] font-bold uppercase tracking-widest border transition-all ${engineSoundType === type ? 'bg-white text-black border-white' : 'bg-transparent text-zinc-500 border-zinc-800'}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3 block">Difficulty</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['EASY', 'NORMAL', 'HARD'] as DifficultyLevel[]).map(level => (
                      <button
                        key={level}
                        onClick={() => updateDifficultyLevel(level)}
                        className={`py-2 text-[10px] font-bold uppercase tracking-widest border transition-all ${difficultyLevel === level ? 'bg-white text-black border-white' : 'bg-transparent text-zinc-500 border-zinc-800'}`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="pt-4">
                  <button
                    onClick={() => setGameState('START')}
                    className="w-full py-4 bg-emerald-500 text-black font-bold uppercase tracking-widest hover:bg-emerald-400 transition-all"
                  >
                    Save & Return
                  </button>
                </section>
              </div>
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

              <div className="flex flex-col gap-3">
                <button
                  onClick={startGame}
                  className="group relative px-10 py-5 bg-white text-black font-bold text-lg uppercase tracking-widest hover:bg-zinc-200 active:scale-95 transition-all"
                >
                  <div className="absolute -inset-1 border border-white/50 group-hover:-inset-2 transition-all" />
                  Restart
                </button>
                <button
                  onClick={() => setGameState('SETTINGS')}
                  className="px-10 py-3 bg-zinc-800 text-white font-bold text-sm uppercase tracking-widest hover:bg-zinc-700 transition-all"
                >
                  Settings
                </button>
              </div>
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

      <audio id="offline-sound-press" src="data:audio/mpeg;base64,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|"></audio>
      <audio id="crash-sound" src="https://rad-pie-250f2f.netlify.app/sounds/s1.mp3" preload="auto"></audio>
      <audio id="move-sound" src="https://rad-pie-250f2f.netlify.app/sounds/old.mp3" preload="auto"></audio>
    </div>
  );
}

