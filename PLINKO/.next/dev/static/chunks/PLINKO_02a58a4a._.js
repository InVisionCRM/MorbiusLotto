(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/PLINKO/constants.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "BALL_RADIUS",
    ()=>BALL_RADIUS,
    "BUCKET_HEIGHT",
    ()=>BUCKET_HEIGHT,
    "CHUTE_RADIUS",
    ()=>CHUTE_RADIUS,
    "COLORS",
    ()=>COLORS,
    "MULTIPLIERS",
    ()=>MULTIPLIERS,
    "PEG_RADIUS",
    ()=>PEG_RADIUS,
    "PHYSICS",
    ()=>PHYSICS,
    "ROWS",
    ()=>ROWS
]);
const PEG_RADIUS = 2;
const BALL_RADIUS = 5;
const ROWS = 15;
const BUCKET_HEIGHT = 12;
const CHUTE_RADIUS = 6;
const COLORS = {
    PEG: 'rgb(2, 19, 34)',
    GREEN: 'rgb(0, 255, 8)',
    YELLOW: 'rgb(255, 183, 0)',
    RED: 'rgb(255, 0, 0)',
    BG_START: 'rgb(6, 19, 22)',
    BG_END: 'rgb(0, 191, 165)',
    UI_ACCENT: 'rgb(87, 250, 37)',
    UI_PANEL: 'rgb(5, 50, 57)',
    BALL_GREEN: 'rgb(13, 255, 25)',
    BALL_YELLOW: 'rgb(245, 222, 10)',
    BALL_RED: 'rgb(239, 27, 27)'
};
const PHYSICS = {
    GRAVITY: 1,
    ENGINE_ITERATIONS: 15,
    BALL_DENSITY: 0.005,
    BALL_RESTITUTION: 0.9,
    BALL_FRICTION: 0.5,
    BALL_FRICTION_STATIC: 0,
    BALL_FRICTION_AIR: 0.02,
    PEG_RESTITUTION: 0.5,
    PEG_FRICTION: 0,
    SPAWN_RANGE_X: 2,
    INITIAL_V_X_VARIANCE: 0.8,
    INITIAL_V_Y: 0,
    COLLISION_JITTER: 0.05,
    SLOP: 0
};
const MULTIPLIERS = {
    GREEN: [
        18,
        3.2,
        1.6,
        1.3,
        1.2,
        1.1,
        1,
        0.5,
        1,
        1.1,
        1.2,
        1.3,
        1.6,
        3.2,
        18
    ],
    YELLOW: [
        55,
        12,
        5.6,
        3.2,
        1.6,
        1,
        0.7,
        0.2,
        0.7,
        1,
        1.6,
        3.2,
        5.6,
        12,
        55
    ],
    RED: [
        353,
        49,
        14,
        5.3,
        2.1,
        0.5,
        0.2,
        0,
        0.2,
        0.5,
        2.1,
        5.3,
        14,
        49,
        353
    ]
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/PLINKO/types.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CollisionLabel",
    ()=>CollisionLabel
]);
var CollisionLabel = /*#__PURE__*/ function(CollisionLabel) {
    CollisionLabel["BALL"] = "BALL";
    CollisionLabel["PEG"] = "PEG";
    CollisionLabel["BUCKET"] = "BUCKET";
    return CollisionLabel;
}({});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/PLINKO/components/PlinkoGame.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/matter-js/build/matter.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/constants.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/types.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
;
;
;
;
// Cached gradient data for performance
let cachedGradientData = null;
let cachedGradientWidth = 0;
let cachedGradientHeight = 0;
// Function to cache gradient image data once
const cacheGradientData = (gradientImage)=>{
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = gradientImage.width;
    canvas.height = gradientImage.height;
    ctx.drawImage(gradientImage, 0, 0);
    cachedGradientData = ctx.getImageData(0, 0, gradientImage.width, gradientImage.height);
    cachedGradientWidth = gradientImage.width;
    cachedGradientHeight = gradientImage.height;
};
const PlinkoGame = ({ onScore, lastDrop })=>{
    _s();
    const containerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const canvasRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const engineRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const renderRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [dimensions, setDimensions] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        width: 0,
        height: 0
    });
    const ballsToRemove = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(new Set());
    const activeHits = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const pegHits = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(new Map()); // Track single hits
    const [backgroundLoaded, setBackgroundLoaded] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [gradientImage, setGradientImage] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    // Sound effects with Web Audio API for smooth playback
    const audioContextRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const audioBuffers = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    // Initialize Web Audio API context and preload sounds
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "PlinkoGame.useEffect": ()=>{
            const initAudio = {
                "PlinkoGame.useEffect.initAudio": async ()=>{
                    try {
                        // Create audio context
                        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
                        // Load and decode audio files
                        const loadAudio = {
                            "PlinkoGame.useEffect.initAudio.loadAudio": async (url, key)=>{
                                try {
                                    console.log(`Loading audio: ${key} from ${url}`);
                                    const response = await fetch(url);
                                    if (!response.ok) {
                                        throw new Error(`Failed to fetch ${url}: ${response.status}`);
                                    }
                                    const arrayBuffer = await response.arrayBuffer();
                                    console.log(`Decoding audio: ${key}, size: ${arrayBuffer.byteLength} bytes`);
                                    const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
                                    audioBuffers.current.set(key, audioBuffer);
                                    console.log(`Successfully loaded: ${key}, duration: ${audioBuffer.duration}s`);
                                } catch (error) {
                                    console.error(`Failed to load audio ${key}:`, error);
                                }
                            }
                        }["PlinkoGame.useEffect.initAudio.loadAudio"];
                        await Promise.all([
                            loadAudio('/ui/sounds/positive.wav', 'bucket'),
                            loadAudio('/ui/sounds/negative.wav', 'negative'),
                            loadAudio('/ui/sounds/drop.wav', 'drop')
                        ]);
                        console.log('Audio loading complete. Loaded buffers:', Array.from(audioBuffers.current.keys()));
                    } catch (error) {
                        console.warn('Audio initialization failed:', error);
                    }
                }
            }["PlinkoGame.useEffect.initAudio"];
            initAudio();
            // Resume audio context on user interaction
            const resumeAudio = {
                "PlinkoGame.useEffect.resumeAudio": ()=>{
                    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                        audioContextRef.current.resume();
                    }
                }
            }["PlinkoGame.useEffect.resumeAudio"];
            document.addEventListener('click', resumeAudio);
            document.addEventListener('keydown', resumeAudio);
            return ({
                "PlinkoGame.useEffect": ()=>{
                    document.removeEventListener('click', resumeAudio);
                    document.removeEventListener('keydown', resumeAudio);
                }
            })["PlinkoGame.useEffect"];
        }
    }["PlinkoGame.useEffect"], []);
    const playSound = (soundKey, volume = 0.3, duration, pitch = 1.0)=>{
        if (!audioContextRef.current || !audioBuffers.current.has(soundKey)) return;
        try {
            const audioBuffer = audioBuffers.current.get(soundKey);
            const source = audioContextRef.current.createBufferSource();
            const gainNode = audioContextRef.current.createGain();
            source.buffer = audioBuffer;
            source.playbackRate.value = pitch; // Apply pitch shifting
            gainNode.gain.value = volume;
            // Use custom duration or full buffer duration
            const playDuration = duration || audioBuffer.duration;
            // Add fade in/out to prevent clicks - longer fades for smoother playback
            const now = audioContextRef.current.currentTime;
            const fadeInTime = 0; // 15ms fade in
            const fadeOutTime = 0.025; // 25ms fade out
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(volume, now + fadeInTime);
            // Hold volume, then fade out before the end
            if (playDuration > fadeInTime + fadeOutTime) {
                gainNode.gain.setValueAtTime(volume, now + playDuration - fadeOutTime);
                gainNode.gain.linearRampToValueAtTime(0, now + playDuration);
            } else {
                // If duration is too short, just do a quick fade out
                gainNode.gain.linearRampToValueAtTime(0, now + playDuration);
            }
            source.connect(gainNode);
            gainNode.connect(audioContextRef.current.destination);
            // Start and stop at specified duration
            source.start(0);
            if (duration) {
                source.stop(now + duration);
            }
        } catch (error) {
            // Fallback to simple Audio if Web Audio API fails
            console.warn('Web Audio API failed, using fallback');
            try {
                let audioPath = '';
                if (soundKey === 'bucket') audioPath = '/ui/sounds/positive.wav';
                else if (soundKey === 'negative') audioPath = '/ui/sounds/negative.wav';
                else if (soundKey === 'drop') audioPath = '/ui/sounds/drop.wav';
                if (audioPath) {
                    const audio = new Audio(audioPath);
                    audio.volume = volume;
                    audio.play().catch(()=>{});
                }
            } catch (fallbackError) {
            // Silently fail
            }
        }
    };
    const playBucketHitSound = ()=>playSound('bucket', 0.25);
    const playNegativeSound = ()=>playSound('negative', 0.25);
    const playDropSound = ()=>playSound('drop', 0.08);
    // Smaller fixed board dimensions for better visibility
    const BOARD_WIDTH = 320; // Reduced width for better fit
    const BOARD_HEIGHT = 320; // Reduced height to ensure buckets are visible
    const BOARD_START_Y = 0; // Adjusted starting position
    // Center the fixed board in the available space, ensuring buckets are visible
    const boardOffsetX = Math.max(0, (dimensions.width - BOARD_WIDTH) / 2);
    const boardOffsetY = Math.max(10, (dimensions.height - BOARD_HEIGHT) / 2);
    const startY = BOARD_START_Y + boardOffsetY;
    // Discs fall from 2px above the top row (considering peg radius)
    const dropY = startY - __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PEG_RADIUS"] - 1;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "PlinkoGame.useEffect": ()=>{
            if (!containerRef.current) return;
            const resizeObserver = new ResizeObserver({
                "PlinkoGame.useEffect": (entries)=>{
                    for (const entry of entries){
                        const { width, height } = entry.contentRect;
                        setDimensions({
                            width,
                            height
                        });
                    }
                }
            }["PlinkoGame.useEffect"]);
            resizeObserver.observe(containerRef.current);
            return ({
                "PlinkoGame.useEffect": ()=>resizeObserver.disconnect()
            })["PlinkoGame.useEffect"];
        }
    }["PlinkoGame.useEffect"], []);
    // Load background image
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "PlinkoGame.useEffect": ()=>{
            const img = new Image();
            img.src = '/ui/Pulse Branding/Banner/Dark/minimal.png';
            img.onload = ({
                "PlinkoGame.useEffect": ()=>{
                    setBackgroundLoaded(true);
                    console.log('Background image loaded successfully');
                }
            })["PlinkoGame.useEffect"];
            img.onerror = ({
                "PlinkoGame.useEffect": ()=>{
                    console.error('Failed to load background image');
                }
            })["PlinkoGame.useEffect"];
        }
    }["PlinkoGame.useEffect"], []);
    // Load gradient image for peg hit effects
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "PlinkoGame.useEffect": ()=>{
            const img = new Image();
            img.src = '/ui/Pulse Branding/Logo/gradient.png';
            img.onload = ({
                "PlinkoGame.useEffect": ()=>{
                    cacheGradientData(img);
                    setGradientImage(img);
                    console.log('Gradient image loaded and cached successfully');
                }
            })["PlinkoGame.useEffect"];
            img.onerror = ({
                "PlinkoGame.useEffect": ()=>{
                    console.error('Failed to load gradient image');
                }
            })["PlinkoGame.useEffect"];
        }
    }["PlinkoGame.useEffect"], []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "PlinkoGame.useEffect": ()=>{
            if (!canvasRef.current || dimensions.width === 0) return;
            const engine = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].Engine.create({
                gravity: {
                    x: 0,
                    y: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PHYSICS"].GRAVITY
                },
                positionIterations: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PHYSICS"].ENGINE_ITERATIONS,
                velocityIterations: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PHYSICS"].ENGINE_ITERATIONS
            });
            engineRef.current = engine;
            const render = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].Render.create({
                element: containerRef.current,
                canvas: canvasRef.current,
                engine: engine,
                options: {
                    width: dimensions.width,
                    height: dimensions.height,
                    wireframes: false,
                    background: 'transparent'
                }
            });
            renderRef.current = render;
            // Adjusted peg spacing for smaller board
            const pegGapX = 24; // Tighter horizontal spacing
            const pegGapY = 18; // Tighter vertical spacing
            const pegs = [];
            for(let r = 0; r < __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ROWS"]; r++){
                const rowY = startY + r * pegGapY;
                const rowPegCount = r + 2;
                const rowWidth = (rowPegCount - 1) * pegGapX;
                const startX = boardOffsetX + (BOARD_WIDTH - rowWidth) / 2; // Center in fixed board
                for(let c = 0; c < rowPegCount; c++){
                    const x = startX + c * pegGapX;
                    pegs.push(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].Bodies.circle(x, rowY, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PEG_RADIUS"], {
                        isStatic: true,
                        label: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CollisionLabel"].PEG,
                        restitution: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PHYSICS"].PEG_RESTITUTION,
                        friction: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PHYSICS"].PEG_FRICTION,
                        slop: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PHYSICS"].SLOP,
                        render: {
                            fillStyle: 'transparent',
                            strokeStyle: 'transparent',
                            lineWidth: 0
                        }
                    }));
                }
            }
            __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].World.add(engine.world, pegs);
            const bucketCount = 15;
            const bucketWidth = pegGapX; // Same spacing as pegs for consistent look
            const bucketsTotalWidth = bucketCount * bucketWidth;
            const bucketsStartX = boardOffsetX + (BOARD_WIDTH - bucketsTotalWidth) / 2;
            const bucketBaseY = startY + (__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ROWS"] + 1) * pegGapY - 24;
            // Create 3 rows of bucket sensors (one for each risk tier)
            const tiers = [
                'GREEN',
                'YELLOW',
                'RED'
            ];
            const tierHeight = 22; // Match visual height
            const tierGap = 2;
            tiers.forEach({
                "PlinkoGame.useEffect": (tier, tierIdx)=>{
                    const tierY = bucketBaseY + tierIdx * (tierHeight + tierGap);
                    for(let i = 0; i < bucketCount; i++){
                        const x = bucketsStartX + i * bucketWidth + bucketWidth / 2;
                        const sensor = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].Bodies.rectangle(x, tierY + tierHeight / 2, bucketWidth, tierHeight, {
                            isStatic: true,
                            isSensor: true,
                            label: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CollisionLabel"].BUCKET,
                            plugin: {
                                index: i,
                                tier: tier
                            },
                            render: {
                                fillStyle: 'transparent'
                            }
                        });
                        __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].World.add(engine.world, sensor);
                    }
                }
            }["PlinkoGame.useEffect"]);
            __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].Events.on(engine, 'collisionStart', {
                "PlinkoGame.useEffect": (event)=>{
                    event.pairs.forEach({
                        "PlinkoGame.useEffect": (pair)=>{
                            const { bodyA, bodyB } = pair;
                            const ball = bodyA.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CollisionLabel"].BALL ? bodyA : bodyB.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CollisionLabel"].BALL ? bodyB : null;
                            const peg = bodyA.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CollisionLabel"].PEG ? bodyA : bodyB.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CollisionLabel"].PEG ? bodyB : null;
                            const bucket = bodyA.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CollisionLabel"].BUCKET ? bodyA : bodyB.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CollisionLabel"].BUCKET ? bodyB : null;
                            if (ball && peg) {
                                // Track peg hit for animation
                                pegHits.current.set(peg.id, Date.now());
                            }
                            if (ball && bucket && !ballsToRemove.current.has(ball)) {
                                const index = bucket.plugin.index;
                                const tier = bucket.plugin.tier; // Get tier from bucket sensor
                                const multiplier = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MULTIPLIERS"][tier][index];
                                activeHits.current.set(`${tier}-${index}`, Date.now());
                                onScore(multiplier);
                                ballsToRemove.current.add(ball);
                                // Play appropriate sound based on multiplier
                                if (multiplier > 1) {
                                    playBucketHitSound();
                                } else if (multiplier < 1) {
                                    playNegativeSound();
                                }
                            }
                        }
                    }["PlinkoGame.useEffect"]);
                }
            }["PlinkoGame.useEffect"]);
            // Draw background and elements "Behind" the balls
            __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].Events.on(render, 'beforeRender', {
                "PlinkoGame.useEffect": ()=>{
                    const ctx = render.context;
                    if (!ctx) return;
                    const chuteX = boardOffsetX + BOARD_WIDTH / 2;
                    const chuteY = dropY - 2; // Offset slightly for aesthetics
                    ctx.save();
                    // Outer rim
                    ctx.beginPath();
                    ctx.arc(chuteX, chuteY, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CHUTE_RADIUS"] + 2, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                    ctx.fill();
                    // Deep dark hole
                    ctx.beginPath();
                    ctx.arc(chuteX, chuteY, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CHUTE_RADIUS"], 0, Math.PI * 2);
                    const grad = ctx.createRadialGradient(chuteX, chuteY, 0, chuteX, chuteY, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CHUTE_RADIUS"]);
                    grad.addColorStop(0, '#000000');
                    grad.addColorStop(0.8, '#0a0a0a');
                    grad.addColorStop(1, '#1a1a1a');
                    ctx.fillStyle = grad;
                    ctx.fill();
                    // Inner shadow/depth
                    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.restore();
                }
            }["PlinkoGame.useEffect"]);
            __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].Events.on(render, 'afterRender', {
                "PlinkoGame.useEffect": ()=>{
                    const ctx = render.context;
                    if (!ctx) return;
                    const now = Date.now();
                    // Draw all pegs
                    const pegs = engine.world.bodies.filter({
                        "PlinkoGame.useEffect.pegs": (body)=>body.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CollisionLabel"].PEG
                    }["PlinkoGame.useEffect.pegs"]);
                    // Draw non-hit pegs in batch for better performance
                    ctx.fillStyle = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COLORS"].PEG;
                    pegs.forEach({
                        "PlinkoGame.useEffect": (peg)=>{
                            if (!pegHits.current.has(peg.id)) {
                                ctx.beginPath();
                                ctx.arc(peg.position.x, peg.position.y, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PEG_RADIUS"], 0, Math.PI * 2);
                                ctx.fill();
                            }
                        }
                    }["PlinkoGame.useEffect"]);
                    // Draw hit pegs with gradient animation
                    pegs.forEach({
                        "PlinkoGame.useEffect": (peg)=>{
                            const hitTime = pegHits.current.get(peg.id);
                            if (!hitTime) return;
                            const elapsed = now - hitTime;
                            // Clean up expired hits
                            if (elapsed >= 3000) {
                                pegHits.current.delete(peg.id);
                                return;
                            }
                            ctx.save();
                            // Draw base peg with normal color
                            ctx.fillStyle = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COLORS"].PEG;
                            ctx.beginPath();
                            ctx.arc(peg.position.x, peg.position.y, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PEG_RADIUS"], 0, Math.PI * 2);
                            ctx.fill();
                            // Draw gradient glow on top with fade in/out
                            if (cachedGradientData) {
                                const progress = elapsed / 3000; // 0 to 1 over 3 seconds
                                // Calculate opacity with short fade in (150ms) and long fade out
                                let glowOpacity = 0;
                                if (elapsed < 150) {
                                    // Quick fade in
                                    glowOpacity = elapsed / 150;
                                } else if (elapsed < 400) {
                                    // Full opacity in the middle
                                    glowOpacity = 1.0;
                                } else {
                                    // Long fade out (2500ms)
                                    glowOpacity = 1.0 - (elapsed - 400) / 2500;
                                }
                                // Sample gradient from top to bottom based on time
                                const gradientX = peg.position.x % cachedGradientWidth;
                                const gradientY = progress * cachedGradientHeight; // Linear top to bottom
                                // Apply gradient color with opacity
                                if (glowOpacity > 0) {
                                    const sampleX = Math.floor(gradientX) % cachedGradientWidth;
                                    const sampleY = Math.floor(gradientY) % cachedGradientHeight;
                                    const index = (sampleY * cachedGradientWidth + sampleX) * 4;
                                    const r = cachedGradientData.data[index];
                                    const g = cachedGradientData.data[index + 1];
                                    const b = cachedGradientData.data[index + 2];
                                    ctx.fillStyle = `rgba(${r},${g},${b},${glowOpacity})`;
                                    ctx.beginPath();
                                    ctx.arc(peg.position.x, peg.position.y, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PEG_RADIUS"], 0, Math.PI * 2);
                                    ctx.fill();
                                }
                            }
                            ctx.restore();
                        }
                    }["PlinkoGame.useEffect"]);
                    // Bucket Multipliers Rendering - Professional Clean Layout
                    const tiers = [
                        'GREEN',
                        'YELLOW',
                        'RED'
                    ];
                    const tierColors = {
                        GREEN: {
                            normal: 'rgb(140, 185, 60)',
                            dark: 'rgb(100, 140, 45)'
                        },
                        YELLOW: {
                            normal: 'rgb(230, 150, 40)',
                            dark: 'rgb(180, 115, 30)'
                        },
                        RED: {
                            normal: 'rgb(210, 50, 50)',
                            dark: 'rgb(160, 35, 35)'
                        }
                    };
                    tiers.forEach({
                        "PlinkoGame.useEffect": (tier, tIdx)=>{
                            const tierHeight = 22; // Compact height like the image
                            const yBase = bucketBaseY + tIdx * (tierHeight + 2); // 2px gap between rows
                            const mults = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MULTIPLIERS"][tier];
                            const tierColor = tierColors[tier];
                            mults.forEach({
                                "PlinkoGame.useEffect": (m, i)=>{
                                    const x = bucketsStartX + i * bucketWidth;
                                    const bW = bucketWidth - 0.5; // Minimal gap
                                    const bH = tierHeight;
                                    let scale = 1.0;
                                    let glowIntensity = 0;
                                    const hitKey = `${tier}-${i}`;
                                    const hitTime = activeHits.current.get(hitKey);
                                    if (hitTime) {
                                        const elapsed = now - hitTime;
                                        if (elapsed < 350) {
                                            scale = 1.0 + Math.sin(elapsed / 350 * Math.PI) * 0.15; // Zoom animation
                                        }
                                        if (elapsed < 1500) {
                                            glowIntensity = 1.0 - elapsed / 1500;
                                        } else {
                                            activeHits.current.delete(hitKey);
                                        }
                                    }
                                    const finalBW = bW * scale;
                                    const finalBH = bH * scale;
                                    const offsetX = (finalBW - bW) / 2;
                                    const offsetY = (finalBH - bH) / 2;
                                    ctx.save();
                                    // Solid color background - darker for multipliers under 1
                                    const isDark = m < 1;
                                    const bgColor = isDark ? tierColor.dark : tierColor.normal;
                                    // Glow effect when hit
                                    if (glowIntensity > 0) {
                                        ctx.shadowBlur = 15 * glowIntensity;
                                        ctx.shadowColor = `rgba(255, 255, 255, ${glowIntensity * 0.8})`;
                                    }
                                    // Draw bucket - sharp corners, no rounding
                                    ctx.fillStyle = bgColor;
                                    ctx.fillRect(x - offsetX, yBase - offsetY, finalBW, finalBH);
                                    // Draw multiplier text - clean and simple
                                    ctx.shadowBlur = 0;
                                    ctx.fillStyle = '#000000'; // Black text for maximum legibility
                                    ctx.font = `bold ${Math.min(12, bW / 2.5) * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'middle';
                                    ctx.fillText(m.toString(), x + bW / 2, yBase + bH / 2);
                                    ctx.restore();
                                }
                            }["PlinkoGame.useEffect"]);
                        }
                    }["PlinkoGame.useEffect"]);
                    if (ballsToRemove.current.size > 0) {
                        ballsToRemove.current.forEach({
                            "PlinkoGame.useEffect": (ball)=>__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].World.remove(engine.world, ball)
                        }["PlinkoGame.useEffect"]);
                        ballsToRemove.current.clear();
                    }
                }
            }["PlinkoGame.useEffect"]);
            const runner = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].Runner.create();
            __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].Runner.run(runner, engine);
            __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].Render.run(render);
            return ({
                "PlinkoGame.useEffect": ()=>{
                    __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].Render.stop(render);
                    __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].Runner.stop(runner);
                    __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].Engine.clear(engine);
                }
            })["PlinkoGame.useEffect"];
        }
    }["PlinkoGame.useEffect"], [
        dimensions
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "PlinkoGame.useEffect": ()=>{
            if (!lastDrop || !engineRef.current) return;
            const risk = lastDrop.risk;
            const ballColor = risk === 'GREEN' ? __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COLORS"].BALL_GREEN : risk === 'YELLOW' ? __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COLORS"].BALL_YELLOW : __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COLORS"].BALL_RED;
            // Spawn centered within the fixed board with narrow spread
            const spawnX = boardOffsetX + BOARD_WIDTH / 2 + (Math.random() * __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PHYSICS"].SPAWN_RANGE_X - __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PHYSICS"].SPAWN_RANGE_X / 2);
            const initialVelX = (Math.random() - 0.5) * __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PHYSICS"].INITIAL_V_X_VARIANCE;
            const ball = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].Bodies.circle(spawnX, dropY, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BALL_RADIUS"], {
                restitution: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PHYSICS"].BALL_RESTITUTION,
                friction: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PHYSICS"].BALL_FRICTION,
                frictionStatic: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PHYSICS"].BALL_FRICTION_STATIC,
                frictionAir: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PHYSICS"].BALL_FRICTION_AIR,
                density: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PHYSICS"].BALL_DENSITY,
                label: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CollisionLabel"].BALL,
                slop: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PHYSICS"].SLOP,
                plugin: {
                    risk
                },
                render: {
                    fillStyle: 'transparent',
                    strokeStyle: ballColor,
                    lineWidth: 1
                }
            });
            // Give them a downward velocity so they don't just sit on the top peg
            __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].Body.setVelocity(ball, {
                x: initialVelX,
                y: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PHYSICS"].INITIAL_V_Y
            });
            __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].World.add(engineRef.current.world, ball);
            // Play drop sound when ball is released
            playDropSound();
        }
    }["PlinkoGame.useEffect"], [
        lastDrop
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: containerRef,
        className: "w-full relative bg-gradient-to-br from-white via-gray-50 to-gray-100",
        style: {
            height: '450px'
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("canvas", {
            ref: canvasRef
        }, void 0, false, {
            fileName: "[project]/PLINKO/components/PlinkoGame.tsx",
            lineNumber: 579,
            columnNumber: 7
        }, ("TURBOPACK compile-time value", void 0))
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/PlinkoGame.tsx",
        lineNumber: 572,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
_s(PlinkoGame, "ngu5qukeCPLjzQjDy8x+pZPo7wE=");
_c = PlinkoGame;
const __TURBOPACK__default__export__ = PlinkoGame;
var _c;
__turbopack_context__.k.register(_c, "PlinkoGame");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/PLINKO/lib/utils.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "cn",
    ()=>cn
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$clsx$2f$dist$2f$clsx$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/clsx/dist/clsx.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/tailwind-merge/dist/bundle-mjs.mjs [app-client] (ecmascript)");
;
;
function cn(...inputs) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["twMerge"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$clsx$2f$dist$2f$clsx$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clsx"])(inputs));
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/PLINKO/components/ui/button.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Button",
    ()=>Button,
    "buttonVariants",
    ()=>buttonVariants
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/@radix-ui/react-slot/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/class-variance-authority/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/lib/utils.ts [app-client] (ecmascript)");
;
;
;
;
;
const buttonVariants = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cva"])("inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50", {
    variants: {
        variant: {
            default: "bg-primary text-primary-foreground hover:bg-primary/90",
            destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
            secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            ghost: "hover:bg-accent hover:text-accent-foreground",
            link: "text-primary underline-offset-4 hover:underline"
        },
        size: {
            default: "h-10 px-4 py-2",
            sm: "h-9 rounded-md px-3",
            lg: "h-11 rounded-md px-8",
            icon: "h-10 w-10"
        }
    },
    defaultVariants: {
        variant: "default",
        size: "default"
    }
});
const Button = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["forwardRef"](_c = ({ className, variant, size, asChild = false, ...props }, ref)=>{
    const Comp = asChild ? __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Slot"] : "button";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Comp, {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])(buttonVariants({
            variant,
            size,
            className
        })),
        ref: ref,
        ...props
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/button.tsx",
        lineNumber: 46,
        columnNumber: 7
    }, ("TURBOPACK compile-time value", void 0));
});
_c1 = Button;
Button.displayName = "Button";
;
var _c, _c1;
__turbopack_context__.k.register(_c, "Button$React.forwardRef");
__turbopack_context__.k.register(_c1, "Button");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/PLINKO/components/ui/dialog.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Dialog",
    ()=>Dialog,
    "DialogClose",
    ()=>DialogClose,
    "DialogContent",
    ()=>DialogContent,
    "DialogDescription",
    ()=>DialogDescription,
    "DialogFooter",
    ()=>DialogFooter,
    "DialogHeader",
    ()=>DialogHeader,
    "DialogOverlay",
    ()=>DialogOverlay,
    "DialogPortal",
    ()=>DialogPortal,
    "DialogTitle",
    ()=>DialogTitle,
    "DialogTrigger",
    ()=>DialogTrigger
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/@radix-ui/react-dialog/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/lucide-react/dist/esm/icons/x.js [app-client] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/lib/utils.ts [app-client] (ecmascript)");
;
;
;
;
;
const Dialog = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Root"];
const DialogTrigger = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Trigger"];
const DialogPortal = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Portal"];
const DialogClose = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Close"];
const DialogOverlay = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["forwardRef"](({ className, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Overlay"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/dialog.tsx",
        lineNumber: 19,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
_c = DialogOverlay;
DialogOverlay.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Overlay"].displayName;
const DialogContent = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["forwardRef"](_c1 = ({ className, children, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(DialogPortal, {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(DialogOverlay, {}, void 0, false, {
                fileName: "[project]/PLINKO/components/ui/dialog.tsx",
                lineNumber: 35,
                columnNumber: 5
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Content"], {
                ref: ref,
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-lg", className),
                ...props,
                children: [
                    children,
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Close"], {
                        className: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                className: "h-4 w-4"
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/components/ui/dialog.tsx",
                                lineNumber: 46,
                                columnNumber: 9
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "sr-only",
                                children: "Close"
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/components/ui/dialog.tsx",
                                lineNumber: 47,
                                columnNumber: 9
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/PLINKO/components/ui/dialog.tsx",
                        lineNumber: 45,
                        columnNumber: 7
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/PLINKO/components/ui/dialog.tsx",
                lineNumber: 36,
                columnNumber: 5
            }, ("TURBOPACK compile-time value", void 0))
        ]
    }, void 0, true, {
        fileName: "[project]/PLINKO/components/ui/dialog.tsx",
        lineNumber: 34,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
_c2 = DialogContent;
DialogContent.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Content"].displayName;
const DialogHeader = ({ className, ...props })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex flex-col space-y-1.5 text-center sm:text-left", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/dialog.tsx",
        lineNumber: 58,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0));
_c3 = DialogHeader;
DialogHeader.displayName = "DialogHeader";
const DialogFooter = ({ className, ...props })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/dialog.tsx",
        lineNumber: 72,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0));
_c4 = DialogFooter;
DialogFooter.displayName = "DialogFooter";
const DialogTitle = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["forwardRef"](_c5 = ({ className, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Title"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("text-lg font-semibold leading-none tracking-tight", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/dialog.tsx",
        lineNumber: 86,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
_c6 = DialogTitle;
DialogTitle.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Title"].displayName;
const DialogDescription = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["forwardRef"](_c7 = ({ className, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Description"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("text-sm text-muted-foreground", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/dialog.tsx",
        lineNumber: 101,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
_c8 = DialogDescription;
DialogDescription.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Description"].displayName;
;
var _c, _c1, _c2, _c3, _c4, _c5, _c6, _c7, _c8;
__turbopack_context__.k.register(_c, "DialogOverlay");
__turbopack_context__.k.register(_c1, "DialogContent$React.forwardRef");
__turbopack_context__.k.register(_c2, "DialogContent");
__turbopack_context__.k.register(_c3, "DialogHeader");
__turbopack_context__.k.register(_c4, "DialogFooter");
__turbopack_context__.k.register(_c5, "DialogTitle$React.forwardRef");
__turbopack_context__.k.register(_c6, "DialogTitle");
__turbopack_context__.k.register(_c7, "DialogDescription$React.forwardRef");
__turbopack_context__.k.register(_c8, "DialogDescription");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/PLINKO/components/ui/tabs.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Tabs",
    ()=>Tabs,
    "TabsContent",
    ()=>TabsContent,
    "TabsList",
    ()=>TabsList,
    "TabsTrigger",
    ()=>TabsTrigger
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/@radix-ui/react-tabs/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/lib/utils.ts [app-client] (ecmascript)");
;
;
;
;
const Tabs = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Root"];
const TabsList = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["forwardRef"](_c = ({ className, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["List"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/tabs.tsx",
        lineNumber: 12,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
_c1 = TabsList;
TabsList.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["List"].displayName;
const TabsTrigger = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["forwardRef"](_c2 = ({ className, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Trigger"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/tabs.tsx",
        lineNumber: 27,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
_c3 = TabsTrigger;
TabsTrigger.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Trigger"].displayName;
const TabsContent = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["forwardRef"](_c4 = ({ className, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Content"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/tabs.tsx",
        lineNumber: 42,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
_c5 = TabsContent;
TabsContent.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Content"].displayName;
;
var _c, _c1, _c2, _c3, _c4, _c5;
__turbopack_context__.k.register(_c, "TabsList$React.forwardRef");
__turbopack_context__.k.register(_c1, "TabsList");
__turbopack_context__.k.register(_c2, "TabsTrigger$React.forwardRef");
__turbopack_context__.k.register(_c3, "TabsTrigger");
__turbopack_context__.k.register(_c4, "TabsContent$React.forwardRef");
__turbopack_context__.k.register(_c5, "TabsContent");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/PLINKO/components/HowToPlayModal.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>HowToPlayModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/dialog.tsx [app-client] (ecmascript)");
'use client';
;
;
function HowToPlayModal({ open, onOpenChange }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Dialog"], {
        open: open,
        onOpenChange: onOpenChange,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogContent"], {
            className: "sm:max-w-[700px] bg-white max-h-[80vh] overflow-y-auto",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogHeader"], {
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogTitle"], {
                        className: "text-3xl font-bold text-gray-900 text-center",
                        children: "How to Play Plinko"
                    }, void 0, false, {
                        fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                        lineNumber: 21,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                    lineNumber: 20,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-6 py-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                    className: "text-xl font-bold text-gray-900",
                                    children: "Welcome to Plinko!"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                    lineNumber: 29,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-gray-700 leading-relaxed",
                                    children: "Plinko is an exciting game of chance where you drop balls down a peg-filled board and watch them bounce unpredictably to land in prize buckets at the bottom."
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                    lineNumber: 30,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                            lineNumber: 28,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3 bg-green-50 rounded-lg p-4 border-2 border-green-600",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                    className: "text-xl font-bold text-gray-900",
                                    children: "Game Rules"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                    lineNumber: 38,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ol", {
                                    className: "list-decimal list-inside space-y-2 text-gray-700",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "leading-relaxed",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Set Your Wager:"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 41,
                                                    columnNumber: 17
                                                }, this),
                                                " Choose how much you want to bet per ball drop (minimum $0.10)"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                            lineNumber: 40,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "leading-relaxed",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Select Risk Level:"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 44,
                                                    columnNumber: 17
                                                }, this),
                                                " Pick from three risk tiers:",
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    className: "ml-8 mt-1 space-y-1",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                    className: "text-green-600",
                                                                    children: "Low Risk (Green):"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                                    lineNumber: 46,
                                                                    columnNumber: 23
                                                                }, this),
                                                                " Safer play with more consistent payouts"
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                            lineNumber: 46,
                                                            columnNumber: 19
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                    className: "text-yellow-600",
                                                                    children: "Medium Risk (Yellow):"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                                    lineNumber: 47,
                                                                    columnNumber: 23
                                                                }, this),
                                                                " Balanced risk and reward"
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                            lineNumber: 47,
                                                            columnNumber: 19
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                    className: "text-red-600",
                                                                    children: "High Risk (Red):"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                                    lineNumber: 48,
                                                                    columnNumber: 23
                                                                }, this),
                                                                " Higher volatility with bigger potential wins"
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                            lineNumber: 48,
                                                            columnNumber: 19
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 45,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                            lineNumber: 43,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "leading-relaxed",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Drop the Ball:"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 52,
                                                    columnNumber: 17
                                                }, this),
                                                " Click your chosen risk button to release a ball down the board"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                            lineNumber: 51,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "leading-relaxed",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Watch It Fall:"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 55,
                                                    columnNumber: 17
                                                }, this),
                                                " The ball bounces off pegs randomly as it descends"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                            lineNumber: 54,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "leading-relaxed",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Collect Your Prize:"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 58,
                                                    columnNumber: 17
                                                }, this),
                                                " When the ball lands in a bucket, you win the multiplier shown times your wager"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                            lineNumber: 57,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                    lineNumber: 39,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                            lineNumber: 37,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                    className: "text-xl font-bold text-gray-900",
                                    children: "Features"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                    lineNumber: 65,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "grid grid-cols-1 md:grid-cols-2 gap-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "bg-gray-50 rounded-lg p-3 border border-gray-200",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                                    className: "font-bold text-gray-900 mb-1",
                                                    children: "Auto-Drop"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 68,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-sm text-gray-700",
                                                    children: "Set up automatic ball drops with customizable settings for extended play"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 69,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                            lineNumber: 67,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "bg-gray-50 rounded-lg p-3 border border-gray-200",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                                    className: "font-bold text-gray-900 mb-1",
                                                    children: "Quick Wagers"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 74,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-sm text-gray-700",
                                                    children: "Use ½ and 2× buttons to quickly adjust your bet amount"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 75,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                            lineNumber: 73,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "bg-gray-50 rounded-lg p-3 border border-gray-200",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                                    className: "font-bold text-gray-900 mb-1",
                                                    children: "History Tracking"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 80,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-sm text-gray-700",
                                                    children: "View your recent multipliers in the top bar to track your luck"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 81,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                            lineNumber: 79,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "bg-gray-50 rounded-lg p-3 border border-gray-200",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                                    className: "font-bold text-gray-900 mb-1",
                                                    children: "Sound Effects"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 86,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-sm text-gray-700",
                                                    children: "Customize peg sounds or turn them off in Settings"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 87,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                            lineNumber: 85,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                    lineNumber: 66,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                            lineNumber: 64,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3 bg-blue-50 rounded-lg p-4 border-2 border-blue-400",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                    className: "text-xl font-bold text-gray-900",
                                    children: "Pro Tips"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                    lineNumber: 96,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                    className: "space-y-2 text-gray-700",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "flex items-start",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-blue-600 font-bold mr-2",
                                                    children: "•"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 99,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "Start with lower wagers to get a feel for the game mechanics"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 100,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                            lineNumber: 98,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "flex items-start",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-blue-600 font-bold mr-2",
                                                    children: "•"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 103,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "Edge buckets often have higher multipliers but are harder to hit"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 104,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                            lineNumber: 102,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "flex items-start",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-blue-600 font-bold mr-2",
                                                    children: "•"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 107,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "Use Auto-Drop for a hands-free experience with your preferred risk level"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 108,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                            lineNumber: 106,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "flex items-start",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-blue-600 font-bold mr-2",
                                                    children: "•"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 111,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "Keep an eye on your balance and bet responsibly"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 112,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                            lineNumber: 110,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                    lineNumber: 97,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                            lineNumber: 95,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-center pt-4",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-lg font-semibold text-gray-900",
                                children: "Ready to play? Good luck! 🎯"
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                lineNumber: 119,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                            lineNumber: 118,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                    lineNumber: 26,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
            lineNumber: 19,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
        lineNumber: 18,
        columnNumber: 5
    }, this);
}
_c = HowToPlayModal;
var _c;
__turbopack_context__.k.register(_c, "HowToPlayModal");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/PLINKO/components/MainNav.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>MainNav
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/dialog.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/tabs.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$HowToPlayModal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/HowToPlayModal.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
function MainNav() {
    _s();
    const [settingsOpen, setSettingsOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [howToPlayOpen, setHowToPlayOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                className: "fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b-2 border-green-600 shadow-md",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "container mx-auto px-4 py-3",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center justify-between",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-xl font-bold text-green-600",
                                children: "PLINKO"
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/components/MainNav.tsx",
                                lineNumber: 27,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                        variant: "ghost",
                                        className: "text-gray-700 hover:text-green-600 hover:bg-green-50 font-semibold",
                                        children: "Home"
                                    }, void 0, false, {
                                        fileName: "[project]/PLINKO/components/MainNav.tsx",
                                        lineNumber: 33,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                        onClick: ()=>setHowToPlayOpen(true),
                                        variant: "ghost",
                                        className: "text-gray-700 hover:text-green-600 hover:bg-green-50 font-semibold",
                                        children: "How to Play"
                                    }, void 0, false, {
                                        fileName: "[project]/PLINKO/components/MainNav.tsx",
                                        lineNumber: 39,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                        variant: "ghost",
                                        className: "text-gray-700 hover:text-green-600 hover:bg-green-50 font-semibold",
                                        children: "Buy"
                                    }, void 0, false, {
                                        fileName: "[project]/PLINKO/components/MainNav.tsx",
                                        lineNumber: 46,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                        onClick: ()=>setSettingsOpen(true),
                                        variant: "outline",
                                        className: "border-2 border-green-600 text-green-600 hover:bg-green-600 hover:text-white font-semibold",
                                        children: "Settings"
                                    }, void 0, false, {
                                        fileName: "[project]/PLINKO/components/MainNav.tsx",
                                        lineNumber: 52,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/PLINKO/components/MainNav.tsx",
                                lineNumber: 32,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/PLINKO/components/MainNav.tsx",
                        lineNumber: 25,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/PLINKO/components/MainNav.tsx",
                    lineNumber: 24,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/PLINKO/components/MainNav.tsx",
                lineNumber: 23,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Dialog"], {
                open: settingsOpen,
                onOpenChange: setSettingsOpen,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogContent"], {
                    className: "sm:max-w-[600px] bg-white",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogHeader"], {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogTitle"], {
                                className: "text-2xl font-bold text-gray-900",
                                children: "Settings"
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/components/MainNav.tsx",
                                lineNumber: 68,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/PLINKO/components/MainNav.tsx",
                            lineNumber: 67,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Tabs"], {
                            defaultValue: "visual",
                            className: "w-full",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsList"], {
                                    className: "grid w-full grid-cols-3 bg-gray-100",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsTrigger"], {
                                            value: "visual",
                                            className: "data-[state=active]:bg-green-600 data-[state=active]:text-white font-semibold",
                                            children: "Visual"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/components/MainNav.tsx",
                                            lineNumber: 73,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsTrigger"], {
                                            value: "autodrop",
                                            className: "data-[state=active]:bg-green-600 data-[state=active]:text-white font-semibold",
                                            children: "Auto-drop"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/components/MainNav.tsx",
                                            lineNumber: 79,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsTrigger"], {
                                            value: "agreement",
                                            className: "data-[state=active]:bg-green-600 data-[state=active]:text-white font-semibold",
                                            children: "Agreement"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/components/MainNav.tsx",
                                            lineNumber: 85,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/PLINKO/components/MainNav.tsx",
                                    lineNumber: 72,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsContent"], {
                                    value: "visual",
                                    className: "space-y-4 py-4",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "space-y-3",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                className: "text-lg font-semibold text-gray-900",
                                                children: "Visual Settings"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/components/MainNav.tsx",
                                                lineNumber: 97,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "text-sm text-gray-600",
                                                children: "Visual settings coming soon..."
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/components/MainNav.tsx",
                                                lineNumber: 98,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/PLINKO/components/MainNav.tsx",
                                        lineNumber: 96,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/MainNav.tsx",
                                    lineNumber: 95,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsContent"], {
                                    value: "autodrop",
                                    className: "space-y-4 py-4",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "space-y-3",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                className: "text-lg font-semibold text-gray-900",
                                                children: "Auto-drop Settings"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/components/MainNav.tsx",
                                                lineNumber: 105,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "text-sm text-gray-600",
                                                children: "Auto-drop settings coming soon..."
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/components/MainNav.tsx",
                                                lineNumber: 106,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/PLINKO/components/MainNav.tsx",
                                        lineNumber: 104,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/MainNav.tsx",
                                    lineNumber: 103,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsContent"], {
                                    value: "agreement",
                                    className: "space-y-4 py-4",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "space-y-3",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                className: "text-lg font-semibold text-gray-900",
                                                children: "User Agreement"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/components/MainNav.tsx",
                                                lineNumber: 113,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "text-sm text-gray-600",
                                                children: "User agreement coming soon..."
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/components/MainNav.tsx",
                                                lineNumber: 114,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/PLINKO/components/MainNav.tsx",
                                        lineNumber: 112,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/MainNav.tsx",
                                    lineNumber: 111,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/PLINKO/components/MainNav.tsx",
                            lineNumber: 71,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/PLINKO/components/MainNav.tsx",
                    lineNumber: 66,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/PLINKO/components/MainNav.tsx",
                lineNumber: 65,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$HowToPlayModal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                open: howToPlayOpen,
                onOpenChange: setHowToPlayOpen
            }, void 0, false, {
                fileName: "[project]/PLINKO/components/MainNav.tsx",
                lineNumber: 122,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true);
}
_s(MainNav, "mw1bSLGTHDkkbLcYM9YO5j450lk=");
_c = MainNav;
var _c;
__turbopack_context__.k.register(_c, "MainNav");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/PLINKO/components/FAQModal.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>FAQModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/dialog.tsx [app-client] (ecmascript)");
'use client';
;
;
function FAQModal({ open, onOpenChange }) {
    const faqs = [
        {
            question: "What is Plinko?",
            answer: "Plinko is a classic game of chance where you drop balls down a peg-filled board. The ball bounces randomly and lands in a bucket with a multiplier that determines your winnings."
        },
        {
            question: "How do I play?",
            answer: "Set your wager, choose a risk level (Low, Medium, or High), and click to drop a ball. Watch it bounce down the pegs and land in a bucket to win the displayed multiplier times your wager."
        },
        {
            question: "What are the risk levels?",
            answer: "Low Risk (Green) offers safer, more consistent payouts. Medium Risk (Yellow) provides balanced risk and reward. High Risk (Red) has higher volatility with bigger potential wins."
        },
        {
            question: "What is Auto-Drop?",
            answer: "Auto-Drop lets you automatically drop multiple balls with your chosen settings. Set the number of balls and risk level, then sit back and watch the action."
        },
        {
            question: "How do I change sound settings?",
            answer: "Click Settings in the top menu, go to the Sound tab, and choose between Default sound, Alternative sound, or turn sounds off completely."
        },
        {
            question: "What is Morbius.io?",
            answer: "Morbius.io is a gaming platform offering various games including Lottery, KENO, Baccarat, BlackJack, Poker, and Plinko, all built on PulseChain."
        },
        {
            question: "What is PulseChain?",
            answer: "PulseChain is a blockchain network designed for fast, low-cost transactions. Visit PulseChain.com to learn more."
        },
        {
            question: "Is this game fair?",
            answer: "Yes! The game uses physics simulation for realistic ball movement. Each drop is independent and results are determined by the physics engine."
        }
    ];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Dialog"], {
        open: open,
        onOpenChange: onOpenChange,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogContent"], {
            className: "sm:max-w-[700px] bg-white max-h-[80vh] overflow-y-auto",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogHeader"], {
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogTitle"], {
                        className: "text-3xl font-bold text-gray-900 text-center",
                        children: "Frequently Asked Questions"
                    }, void 0, false, {
                        fileName: "[project]/PLINKO/components/FAQModal.tsx",
                        lineNumber: 56,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/PLINKO/components/FAQModal.tsx",
                    lineNumber: 55,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-4 py-4",
                    children: faqs.map((faq, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "bg-gray-50 rounded-lg p-4 border border-gray-200",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                    className: "text-lg font-bold text-gray-900 mb-2",
                                    children: faq.question
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/FAQModal.tsx",
                                    lineNumber: 64,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-gray-700 leading-relaxed",
                                    children: faq.answer
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/FAQModal.tsx",
                                    lineNumber: 67,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, index, true, {
                            fileName: "[project]/PLINKO/components/FAQModal.tsx",
                            lineNumber: 63,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/PLINKO/components/FAQModal.tsx",
                    lineNumber: 61,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "text-center pt-4 border-t border-gray-200",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-sm text-gray-600",
                        children: "Still have questions? Contact us on Telegram or Twitter."
                    }, void 0, false, {
                        fileName: "[project]/PLINKO/components/FAQModal.tsx",
                        lineNumber: 75,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/PLINKO/components/FAQModal.tsx",
                    lineNumber: 74,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/PLINKO/components/FAQModal.tsx",
            lineNumber: 54,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/FAQModal.tsx",
        lineNumber: 53,
        columnNumber: 5
    }, this);
}
_c = FAQModal;
var _c;
__turbopack_context__.k.register(_c, "FAQModal");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/PLINKO/components/Footer.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Footer
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$FAQModal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/FAQModal.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
function Footer() {
    _s();
    const [faqOpen, setFaqOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("footer", {
                className: "bg-black/5 border-t border-black/10 py-6 px-6 mt-auto",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "container mx-auto",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid grid-cols-1 md:grid-cols-4 gap-6",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                            className: "text-gray-900 font-bold text-lg mb-3",
                                            children: "More From Morbius.io!"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/components/Footer.tsx",
                                            lineNumber: 16,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                            className: "space-y-1.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: "#",
                                                        className: "text-gray-700 hover:text-green-600 transition-colors text-xs",
                                                        children: "Lottery"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/Footer.tsx",
                                                        lineNumber: 19,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                                    lineNumber: 18,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: "#",
                                                        className: "text-gray-700 hover:text-green-600 transition-colors text-xs",
                                                        children: "KENO"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/Footer.tsx",
                                                        lineNumber: 24,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                                    lineNumber: 23,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: "#",
                                                        className: "text-gray-700 hover:text-green-600 transition-colors text-xs",
                                                        children: "Baccarat"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/Footer.tsx",
                                                        lineNumber: 29,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                                    lineNumber: 28,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: "#",
                                                        className: "text-gray-700 hover:text-green-600 transition-colors text-xs",
                                                        children: "BlackJack"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/Footer.tsx",
                                                        lineNumber: 34,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                                    lineNumber: 33,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: "#",
                                                        className: "text-gray-700 hover:text-green-600 transition-colors text-xs",
                                                        children: "Poker"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/Footer.tsx",
                                                        lineNumber: 39,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                                    lineNumber: 38,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/Footer.tsx",
                                            lineNumber: 17,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                    lineNumber: 15,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                            className: "text-gray-900 font-bold text-sm mb-3",
                                            children: "Quick Links"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/components/Footer.tsx",
                                            lineNumber: 48,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                            className: "space-y-1.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: "#",
                                                        className: "text-gray-700 hover:text-green-600 transition-colors text-xs",
                                                        children: "Home"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/Footer.tsx",
                                                        lineNumber: 51,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                                    lineNumber: 50,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: "#",
                                                        className: "text-gray-700 hover:text-green-600 transition-colors text-xs",
                                                        children: "How to Play"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/Footer.tsx",
                                                        lineNumber: 56,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                                    lineNumber: 55,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: "#",
                                                        className: "text-gray-700 hover:text-green-600 transition-colors text-xs",
                                                        children: "Buy Morbius"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/Footer.tsx",
                                                        lineNumber: 61,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                                    lineNumber: 60,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: "https://pulsechain.com",
                                                        target: "_blank",
                                                        rel: "noopener noreferrer",
                                                        className: "text-gray-700 hover:text-green-600 transition-colors text-xs",
                                                        children: "What is PulseChain?"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/Footer.tsx",
                                                        lineNumber: 66,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                                    lineNumber: 65,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>setFaqOpen(true),
                                                        className: "text-gray-700 hover:text-green-600 transition-colors text-xs text-left",
                                                        children: "FAQs"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/Footer.tsx",
                                                        lineNumber: 76,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                                    lineNumber: 75,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: "#",
                                                        className: "text-gray-700 hover:text-green-600 transition-colors text-xs",
                                                        children: "User Agreement"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/Footer.tsx",
                                                        lineNumber: 84,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                                    lineNumber: 83,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/Footer.tsx",
                                            lineNumber: 49,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                    lineNumber: 47,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                            className: "text-gray-900 font-bold text-sm mb-3",
                                            children: "Resources"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/components/Footer.tsx",
                                            lineNumber: 93,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                            className: "space-y-1.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: "#",
                                                        className: "text-gray-700 hover:text-green-600 transition-colors text-xs",
                                                        children: "About Us"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/Footer.tsx",
                                                        lineNumber: 96,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                                    lineNumber: 95,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: "#",
                                                        className: "text-gray-700 hover:text-green-600 transition-colors text-xs",
                                                        children: "Help Center"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/Footer.tsx",
                                                        lineNumber: 101,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                                    lineNumber: 100,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: "#",
                                                        className: "text-gray-700 hover:text-green-600 transition-colors text-xs",
                                                        children: "Terms of Service"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/Footer.tsx",
                                                        lineNumber: 106,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                                    lineNumber: 105,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: "#",
                                                        className: "text-gray-700 hover:text-green-600 transition-colors text-xs",
                                                        children: "Privacy Policy"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/Footer.tsx",
                                                        lineNumber: 111,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                                    lineNumber: 110,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: "#",
                                                        className: "text-gray-700 hover:text-green-600 transition-colors text-xs",
                                                        children: "Contact Us"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/Footer.tsx",
                                                        lineNumber: 116,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                                    lineNumber: 115,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/Footer.tsx",
                                            lineNumber: 94,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                    lineNumber: 92,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                            className: "text-gray-900 font-bold text-sm mb-3",
                                            children: "Connect"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/components/Footer.tsx",
                                            lineNumber: 125,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                            className: "space-y-1.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: "https://x.com/Morbius_io",
                                                        target: "_blank",
                                                        rel: "noopener noreferrer",
                                                        className: "text-gray-700 hover:text-green-600 transition-colors text-xs flex items-center gap-2",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                                                className: "fab fa-x-twitter"
                                                            }, void 0, false, {
                                                                fileName: "[project]/PLINKO/components/Footer.tsx",
                                                                lineNumber: 134,
                                                                columnNumber: 21
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                children: "@Morbius_io"
                                                            }, void 0, false, {
                                                                fileName: "[project]/PLINKO/components/Footer.tsx",
                                                                lineNumber: 135,
                                                                columnNumber: 21
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/PLINKO/components/Footer.tsx",
                                                        lineNumber: 128,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                                    lineNumber: 127,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: "https://t.me/Morbius_cash",
                                                        target: "_blank",
                                                        rel: "noopener noreferrer",
                                                        className: "text-gray-700 hover:text-green-600 transition-colors text-xs flex items-center gap-2",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                                                className: "fab fa-telegram"
                                                            }, void 0, false, {
                                                                fileName: "[project]/PLINKO/components/Footer.tsx",
                                                                lineNumber: 145,
                                                                columnNumber: 21
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                children: "Morbius_cash"
                                                            }, void 0, false, {
                                                                fileName: "[project]/PLINKO/components/Footer.tsx",
                                                                lineNumber: 146,
                                                                columnNumber: 21
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/PLINKO/components/Footer.tsx",
                                                        lineNumber: 139,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                                    lineNumber: 138,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: "https://morbius.io",
                                                        target: "_blank",
                                                        rel: "noopener noreferrer",
                                                        className: "text-gray-700 hover:text-green-600 transition-colors text-xs flex items-center gap-2",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                                                className: "fas fa-globe"
                                                            }, void 0, false, {
                                                                fileName: "[project]/PLINKO/components/Footer.tsx",
                                                                lineNumber: 156,
                                                                columnNumber: 21
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                children: "Morbius.io"
                                                            }, void 0, false, {
                                                                fileName: "[project]/PLINKO/components/Footer.tsx",
                                                                lineNumber: 157,
                                                                columnNumber: 21
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/PLINKO/components/Footer.tsx",
                                                        lineNumber: 150,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                                    lineNumber: 149,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/Footer.tsx",
                                            lineNumber: 126,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/PLINKO/components/Footer.tsx",
                                    lineNumber: 124,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/PLINKO/components/Footer.tsx",
                            lineNumber: 13,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mt-6 pt-4 border-t border-black/10 text-center",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-gray-600 text-xs",
                                children: "© 2025 Morbius.io. All rights reserved."
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/components/Footer.tsx",
                                lineNumber: 166,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/PLINKO/components/Footer.tsx",
                            lineNumber: 165,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/PLINKO/components/Footer.tsx",
                    lineNumber: 12,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/PLINKO/components/Footer.tsx",
                lineNumber: 11,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$FAQModal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                open: faqOpen,
                onOpenChange: setFaqOpen
            }, void 0, false, {
                fileName: "[project]/PLINKO/components/Footer.tsx",
                lineNumber: 174,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true);
}
_s(Footer, "kkQRm5BbCDZIdX1ETPpIfreDxMI=");
_c = Footer;
var _c;
__turbopack_context__.k.register(_c, "Footer");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/PLINKO/components/ui/label.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Label",
    ()=>Label
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$label$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/@radix-ui/react-label/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/class-variance-authority/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/lib/utils.ts [app-client] (ecmascript)");
;
;
;
;
;
const labelVariants = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cva"])("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70");
const Label = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["forwardRef"](_c = ({ className, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$label$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Root"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])(labelVariants(), className),
        ...props
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/label.tsx",
        lineNumber: 16,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
_c1 = Label;
Label.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$label$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Root"].displayName;
;
var _c, _c1;
__turbopack_context__.k.register(_c, "Label$React.forwardRef");
__turbopack_context__.k.register(_c1, "Label");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/PLINKO/components/AutoPlayModal.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AutoPlayModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/dialog.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/label.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
function AutoPlayModal({ open, onOpenChange, onStart, currentBalance }) {
    _s();
    const [showMoreOptions, setShowMoreOptions] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [settings, setSettings] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        riskLevel: 'GREEN',
        numberOfRounds: 10,
        stopOnLossEnabled: false,
        stopOnLossAmount: 0,
        stopOnBigWinEnabled: false,
        stopOnBigWinAmount: 0,
        stopOnProfitEnabled: false,
        stopOnProfitAmount: 0,
        onLossStrategy: 'reset',
        onLossPercent: 0,
        onWinStrategy: 'reset',
        onWinPercent: 0
    });
    const roundOptions = [
        3,
        10,
        25,
        100,
        200,
        500
    ];
    const updateSetting = (key, value)=>{
        setSettings((prev)=>({
                ...prev,
                [key]: value
            }));
    };
    const adjustValue = (key, delta)=>{
        setSettings((prev)=>({
                ...prev,
                [key]: Math.max(0, prev[key] + delta)
            }));
    };
    const handleStart = ()=>{
        onStart(settings);
        onOpenChange(false);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Dialog"], {
        open: open,
        onOpenChange: onOpenChange,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogContent"], {
            className: "sm:max-w-[600px] bg-gray-900 border-gray-700 max-h-[90vh] overflow-y-auto",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogHeader"], {
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogTitle"], {
                        className: "text-2xl font-bold text-white flex items-center justify-between",
                        children: "AUTO PLAY"
                    }, void 0, false, {
                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                        lineNumber: 75,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                    lineNumber: 74,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-6 py-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Label"], {
                                    className: "text-gray-400 text-sm mb-3 block",
                                    children: "Bet color"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                    lineNumber: 83,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "grid grid-cols-2 gap-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>updateSetting('riskLevel', 'GREEN'),
                                            className: `p-4 rounded-lg flex items-center gap-3 transition-all ${settings.riskLevel === 'GREEN' ? 'bg-gray-700 ring-2 ring-green-500' : 'bg-gray-800 hover:bg-gray-700'}`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: `w-3 h-3 rounded-full ${settings.riskLevel === 'GREEN' ? 'bg-green-500' : 'bg-gray-600'}`
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                    lineNumber: 93,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-white font-medium flex items-center gap-2",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "w-3 h-3 bg-green-500 rounded-full"
                                                        }, void 0, false, {
                                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                            lineNumber: 95,
                                                            columnNumber: 19
                                                        }, this),
                                                        "Green"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                    lineNumber: 94,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                            lineNumber: 85,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>updateSetting('riskLevel', 'YELLOW'),
                                            className: `p-4 rounded-lg flex items-center gap-3 transition-all ${settings.riskLevel === 'YELLOW' ? 'bg-gray-700 ring-2 ring-yellow-500' : 'bg-gray-800 hover:bg-gray-700'}`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: `w-3 h-3 rounded-full ${settings.riskLevel === 'YELLOW' ? 'bg-yellow-500' : 'bg-gray-600'}`
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                    lineNumber: 107,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-white font-medium flex items-center gap-2",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "w-3 h-3 bg-yellow-500 rounded-full"
                                                        }, void 0, false, {
                                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                            lineNumber: 109,
                                                            columnNumber: 19
                                                        }, this),
                                                        "Yellow"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                    lineNumber: 108,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                            lineNumber: 99,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                    lineNumber: 84,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    onClick: ()=>updateSetting('riskLevel', 'RED'),
                                    className: `w-full mt-3 p-4 rounded-lg flex items-center gap-3 transition-all ${settings.riskLevel === 'RED' ? 'bg-gray-700 ring-2 ring-red-500' : 'bg-gray-800 hover:bg-gray-700'}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: `w-3 h-3 rounded-full ${settings.riskLevel === 'RED' ? 'bg-red-500' : 'bg-gray-600'}`
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                            lineNumber: 122,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-white font-medium flex items-center gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "w-3 h-3 bg-red-500 rounded-full"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                    lineNumber: 124,
                                                    columnNumber: 17
                                                }, this),
                                                "Red"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                            lineNumber: 123,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                    lineNumber: 114,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                            lineNumber: 82,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Label"], {
                                    className: "text-gray-400 text-sm mb-3 block",
                                    children: "Number of rounds"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                    lineNumber: 132,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "grid grid-cols-2 gap-3",
                                    children: roundOptions.map((rounds)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>updateSetting('numberOfRounds', rounds),
                                            className: `p-4 rounded-lg transition-all ${settings.numberOfRounds === rounds ? 'bg-gray-700 ring-2 ring-green-500' : 'bg-gray-800 hover:bg-gray-700'}`,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-3",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: `w-3 h-3 rounded-full ${settings.numberOfRounds === rounds ? 'bg-green-500' : 'bg-gray-600'}`
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 145,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-white font-bold text-lg",
                                                        children: rounds
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 146,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                lineNumber: 144,
                                                columnNumber: 19
                                            }, this)
                                        }, rounds, false, {
                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                            lineNumber: 135,
                                            columnNumber: 17
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                    lineNumber: 133,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                            lineNumber: 131,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "bg-gray-800 rounded-lg p-4",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center justify-between",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-3 flex-1",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>updateSetting('stopOnLossEnabled', !settings.stopOnLossEnabled),
                                                        className: `w-12 h-6 rounded-full transition-colors relative ${settings.stopOnLossEnabled ? 'bg-green-500' : 'bg-gray-600'}`,
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: `absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.stopOnLossEnabled ? 'translate-x-6' : 'translate-x-0.5'}`
                                                        }, void 0, false, {
                                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                            lineNumber: 165,
                                                            columnNumber: 21
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 159,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-white text-sm",
                                                        children: "Stop if cash decreases by"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 169,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                lineNumber: 158,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-2",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>adjustValue('stopOnLossAmount', -10),
                                                        className: "w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center",
                                                        children: "−"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 172,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-white font-mono text-lg min-w-[80px] text-center",
                                                        children: settings.stopOnLossAmount.toFixed(2)
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 178,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>adjustValue('stopOnLossAmount', 10),
                                                        className: "w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center",
                                                        children: "+"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 181,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                lineNumber: 171,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                        lineNumber: 157,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                    lineNumber: 156,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "bg-gray-800 rounded-lg p-4",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center justify-between",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-3 flex-1",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>updateSetting('stopOnBigWinEnabled', !settings.stopOnBigWinEnabled),
                                                        className: `w-12 h-6 rounded-full transition-colors relative ${settings.stopOnBigWinEnabled ? 'bg-green-500' : 'bg-gray-600'}`,
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: `absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.stopOnBigWinEnabled ? 'translate-x-6' : 'translate-x-0.5'}`
                                                        }, void 0, false, {
                                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                            lineNumber: 201,
                                                            columnNumber: 21
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 195,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-white text-sm",
                                                        children: "Stop if single win exceeds"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 205,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                lineNumber: 194,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-2",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>adjustValue('stopOnBigWinAmount', -10),
                                                        className: "w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center",
                                                        children: "−"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 208,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-white font-mono text-lg min-w-[80px] text-center",
                                                        children: settings.stopOnBigWinAmount.toFixed(2)
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 214,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>adjustValue('stopOnBigWinAmount', 10),
                                                        className: "w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center",
                                                        children: "+"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 217,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                lineNumber: 207,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                        lineNumber: 193,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                    lineNumber: 192,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                            lineNumber: 154,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            onClick: ()=>setShowMoreOptions(!showMoreOptions),
                            className: "w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-white font-medium flex items-center justify-center gap-2 transition-colors",
                            children: [
                                "More options",
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: `transition-transform ${showMoreOptions ? 'rotate-180' : ''}`,
                                    children: "▼"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                    lineNumber: 234,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                            lineNumber: 229,
                            columnNumber: 11
                        }, this),
                        showMoreOptions && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-4 animate-in slide-in-from-top-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "bg-gray-800 rounded-lg p-4",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center justify-between",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-3 flex-1",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>updateSetting('stopOnProfitEnabled', !settings.stopOnProfitEnabled),
                                                        className: `w-12 h-6 rounded-full transition-colors relative ${settings.stopOnProfitEnabled ? 'bg-green-500' : 'bg-gray-600'}`,
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: `absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.stopOnProfitEnabled ? 'translate-x-6' : 'translate-x-0.5'}`
                                                        }, void 0, false, {
                                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                            lineNumber: 250,
                                                            columnNumber: 23
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 244,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-white text-sm",
                                                        children: "Stop if cash increases by"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 254,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                lineNumber: 243,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-2",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>adjustValue('stopOnProfitAmount', -10),
                                                        className: "w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center",
                                                        children: "−"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 257,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-white font-mono text-lg min-w-[80px] text-center",
                                                        children: settings.stopOnProfitAmount.toFixed(2)
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 263,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>adjustValue('stopOnProfitAmount', 10),
                                                        className: "w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center",
                                                        children: "+"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 266,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                lineNumber: 256,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                        lineNumber: 242,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                    lineNumber: 241,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Label"], {
                                            className: "text-gray-400 text-sm mb-3 block text-center",
                                            children: "If I lost"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                            lineNumber: 278,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>updateSetting('onLossStrategy', 'reset'),
                                            className: `w-full p-4 rounded-lg mb-3 transition-all ${settings.onLossStrategy === 'reset' ? 'bg-gray-700 ring-2 ring-green-500' : 'bg-gray-800 hover:bg-gray-700'}`,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-3",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: `w-3 h-3 rounded-full ${settings.onLossStrategy === 'reset' ? 'bg-green-500' : 'bg-gray-600'}`
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 290,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-white font-medium",
                                                        children: "Return to initial bet"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 291,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                lineNumber: 289,
                                                columnNumber: 19
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                            lineNumber: 281,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "grid grid-cols-2 gap-3",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: `p-4 rounded-lg ${settings.onLossStrategy === 'increase' ? 'bg-gray-700 ring-2 ring-green-500' : 'bg-gray-800'}`,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            onClick: ()=>updateSetting('onLossStrategy', 'increase'),
                                                            className: "w-full text-left mb-2",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "flex items-center gap-3 mb-2",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: `w-3 h-3 rounded-full ${settings.onLossStrategy === 'increase' ? 'bg-green-500' : 'bg-gray-600'}`
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                        lineNumber: 309,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: "text-white text-sm font-medium",
                                                                        children: "Increase bet by"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                        lineNumber: 310,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                lineNumber: 308,
                                                                columnNumber: 23
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                            lineNumber: 304,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "flex items-center justify-center gap-2",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    onClick: ()=>adjustValue('onLossPercent', -5),
                                                                    className: "w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs",
                                                                    children: "−"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                    lineNumber: 314,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "text-white font-bold text-xl",
                                                                    children: [
                                                                        settings.onLossPercent,
                                                                        "%"
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                    lineNumber: 320,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    onClick: ()=>adjustValue('onLossPercent', 5),
                                                                    className: "w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs",
                                                                    children: "+"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                    lineNumber: 321,
                                                                    columnNumber: 23
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                            lineNumber: 313,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                    lineNumber: 297,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: `p-4 rounded-lg ${settings.onLossStrategy === 'decrease' ? 'bg-gray-700 ring-2 ring-green-500' : 'bg-gray-800'}`,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            onClick: ()=>updateSetting('onLossStrategy', 'decrease'),
                                                            className: "w-full text-left mb-2",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "flex items-center gap-3 mb-2",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: `w-3 h-3 rounded-full ${settings.onLossStrategy === 'decrease' ? 'bg-green-500' : 'bg-gray-600'}`
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                        lineNumber: 342,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: "text-white text-sm font-medium",
                                                                        children: "Decrease bet by"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                        lineNumber: 343,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                lineNumber: 341,
                                                                columnNumber: 23
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                            lineNumber: 337,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "flex items-center justify-center gap-2",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    onClick: ()=>adjustValue('onLossPercent', -5),
                                                                    className: "w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs",
                                                                    children: "−"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                    lineNumber: 347,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "text-white font-bold text-xl",
                                                                    children: [
                                                                        settings.onLossPercent,
                                                                        "%"
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                    lineNumber: 353,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    onClick: ()=>adjustValue('onLossPercent', 5),
                                                                    className: "w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs",
                                                                    children: "+"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                    lineNumber: 354,
                                                                    columnNumber: 23
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                            lineNumber: 346,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                    lineNumber: 330,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                            lineNumber: 296,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                    lineNumber: 277,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Label"], {
                                            className: "text-gray-400 text-sm mb-3 block text-center",
                                            children: "If I win"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                            lineNumber: 367,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>updateSetting('onWinStrategy', 'reset'),
                                            className: `w-full p-4 rounded-lg mb-3 transition-all ${settings.onWinStrategy === 'reset' ? 'bg-gray-700 ring-2 ring-green-500' : 'bg-gray-800 hover:bg-gray-700'}`,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-3",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: `w-3 h-3 rounded-full ${settings.onWinStrategy === 'reset' ? 'bg-green-500' : 'bg-gray-600'}`
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 379,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-white font-medium",
                                                        children: "Return to initial bet"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 380,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                lineNumber: 378,
                                                columnNumber: 19
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                            lineNumber: 370,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "grid grid-cols-2 gap-3",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: `p-4 rounded-lg ${settings.onWinStrategy === 'increase' ? 'bg-gray-700 ring-2 ring-green-500' : 'bg-gray-800'}`,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            onClick: ()=>updateSetting('onWinStrategy', 'increase'),
                                                            className: "w-full text-left mb-2",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "flex items-center gap-3 mb-2",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: `w-3 h-3 rounded-full ${settings.onWinStrategy === 'increase' ? 'bg-green-500' : 'bg-gray-600'}`
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                        lineNumber: 398,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: "text-white text-sm font-medium",
                                                                        children: "Increase bet by"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                        lineNumber: 399,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                lineNumber: 397,
                                                                columnNumber: 23
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                            lineNumber: 393,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "flex items-center justify-center gap-2",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    onClick: ()=>adjustValue('onWinPercent', -5),
                                                                    className: "w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs",
                                                                    children: "−"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                    lineNumber: 403,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "text-white font-bold text-xl",
                                                                    children: [
                                                                        settings.onWinPercent,
                                                                        "%"
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                    lineNumber: 409,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    onClick: ()=>adjustValue('onWinPercent', 5),
                                                                    className: "w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs",
                                                                    children: "+"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                    lineNumber: 410,
                                                                    columnNumber: 23
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                            lineNumber: 402,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                    lineNumber: 386,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: `p-4 rounded-lg ${settings.onWinStrategy === 'decrease' ? 'bg-gray-700 ring-2 ring-green-500' : 'bg-gray-800'}`,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            onClick: ()=>updateSetting('onWinStrategy', 'decrease'),
                                                            className: "w-full text-left mb-2",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "flex items-center gap-3 mb-2",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: `w-3 h-3 rounded-full ${settings.onWinStrategy === 'decrease' ? 'bg-green-500' : 'bg-gray-600'}`
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                        lineNumber: 431,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: "text-white text-sm font-medium",
                                                                        children: "Decrease bet by"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                        lineNumber: 432,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                lineNumber: 430,
                                                                columnNumber: 23
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                            lineNumber: 426,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "flex items-center justify-center gap-2",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    onClick: ()=>adjustValue('onWinPercent', -5),
                                                                    className: "w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs",
                                                                    children: "−"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                    lineNumber: 436,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "text-white font-bold text-xl",
                                                                    children: [
                                                                        settings.onWinPercent,
                                                                        "%"
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                    lineNumber: 442,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    onClick: ()=>adjustValue('onWinPercent', 5),
                                                                    className: "w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs",
                                                                    children: "+"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                    lineNumber: 443,
                                                                    columnNumber: 23
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                            lineNumber: 435,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                    lineNumber: 419,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                            lineNumber: 385,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                    lineNumber: 366,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                            lineNumber: 239,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                            onClick: handleStart,
                            className: "w-full py-6 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-lg transition-colors",
                            children: "START AUTO"
                        }, void 0, false, {
                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                            lineNumber: 457,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                    lineNumber: 80,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
            lineNumber: 73,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
        lineNumber: 72,
        columnNumber: 5
    }, this);
}
_s(AutoPlayModal, "Dcj6j2ulPsctmtUrRrpQfQKDPH4=");
_c = AutoPlayModal;
var _c;
__turbopack_context__.k.register(_c, "AutoPlayModal");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/PLINKO/app/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$PlinkoGame$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/PlinkoGame.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$MainNav$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/MainNav.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$Footer$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/Footer.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$AutoPlayModal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/AutoPlayModal.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
const Home = ()=>{
    _s();
    const [gameState, setGameState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        balance: 755.37,
        ballCount: 0
    });
    const [wager, setWager] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0.30);
    const [lastDrop, setLastDrop] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [history, setHistory] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [isAutoDrop, setIsAutoDrop] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [showAutoPlayModal, setShowAutoPlayModal] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [showPresetModal, setShowPresetModal] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [autoPlaySettings, setAutoPlaySettings] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [remainingBalls, setRemainingBalls] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    const [backgroundIndex, setBackgroundIndex] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    const lastRiskRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])('GREEN');
    const historyIdCounter = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    // AutoPlay state tracking
    const initialWagerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0.30);
    const startingBalanceRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(755.37);
    const lastWinAmountRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    // Background images array
    const backgrounds = [
        '/ui/bg1.jpg',
        '/ui/bg2.jpg',
        '/ui/bg3.jpg',
        '/ui/bg4.jpg'
    ];
    // Cycle through backgrounds every 8 seconds
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "Home.useEffect": ()=>{
            const interval = setInterval({
                "Home.useEffect.interval": ()=>{
                    setBackgroundIndex({
                        "Home.useEffect.interval": (prev)=>(prev + 1) % backgrounds.length
                    }["Home.useEffect.interval"]);
                }
            }["Home.useEffect.interval"], 8000);
            return ({
                "Home.useEffect": ()=>clearInterval(interval)
            })["Home.useEffect"];
        }
    }["Home.useEffect"], [
        backgrounds.length
    ]);
    const handleScore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "Home.useCallback[handleScore]": (multiplier)=>{
            const winAmount = wager * multiplier;
            const profit = winAmount - wager;
            lastWinAmountRef.current = winAmount;
            setGameState({
                "Home.useCallback[handleScore]": (prev)=>{
                    const newBalance = prev.balance + winAmount;
                    // Check AutoPlay stop conditions
                    if (isAutoDrop && autoPlaySettings) {
                        // Stop if cash decreases by
                        if (autoPlaySettings.stopOnLossEnabled) {
                            const totalLoss = startingBalanceRef.current - newBalance;
                            if (totalLoss >= autoPlaySettings.stopOnLossAmount) {
                                setIsAutoDrop(false);
                                setRemainingBalls(0);
                            }
                        }
                        // Stop if single win exceeds
                        if (autoPlaySettings.stopOnBigWinEnabled && winAmount >= autoPlaySettings.stopOnBigWinAmount) {
                            setIsAutoDrop(false);
                            setRemainingBalls(0);
                        }
                        // Stop if cash increases by
                        if (autoPlaySettings.stopOnProfitEnabled) {
                            const totalProfit = newBalance - startingBalanceRef.current;
                            if (totalProfit >= autoPlaySettings.stopOnProfitAmount) {
                                setIsAutoDrop(false);
                                setRemainingBalls(0);
                            }
                        }
                        // Apply bet progression strategy
                        const isWin = multiplier > 1;
                        const strategy = isWin ? autoPlaySettings.onWinStrategy : autoPlaySettings.onLossStrategy;
                        const percent = isWin ? autoPlaySettings.onWinPercent : autoPlaySettings.onLossPercent;
                        if (strategy === 'reset') {
                            setWager(initialWagerRef.current);
                        } else if (strategy === 'increase') {
                            setWager({
                                "Home.useCallback[handleScore]": (prev)=>+(prev * (1 + percent / 100)).toFixed(2)
                            }["Home.useCallback[handleScore]"]);
                        } else if (strategy === 'decrease') {
                            setWager({
                                "Home.useCallback[handleScore]": (prev)=>Math.max(0.1, +(prev * (1 - percent / 100)).toFixed(2))
                            }["Home.useCallback[handleScore]"]);
                        }
                    }
                    return {
                        ...prev,
                        balance: newBalance
                    };
                }
            }["Home.useCallback[handleScore]"]);
            // Generate unique ID using counter to prevent duplicate keys
            historyIdCounter.current += 1;
            const uniqueId = Date.now() * 1000 + historyIdCounter.current;
            setHistory({
                "Home.useCallback[handleScore]": (prev)=>[
                        {
                            id: uniqueId,
                            multiplier,
                            risk: lastRiskRef.current
                        },
                        ...prev
                    ].slice(0, 15)
            }["Home.useCallback[handleScore]"]);
        }
    }["Home.useCallback[handleScore]"], [
        wager,
        isAutoDrop,
        autoPlaySettings
    ]);
    const dropBall = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "Home.useCallback[dropBall]": (risk)=>{
            setGameState({
                "Home.useCallback[dropBall]": (prev)=>{
                    if (prev.balance < wager) {
                        setIsAutoDrop(false);
                        return prev;
                    }
                    lastRiskRef.current = risk;
                    setLastDrop({
                        id: Date.now(),
                        risk
                    });
                    return {
                        ...prev,
                        balance: prev.balance - wager,
                        ballCount: prev.ballCount + 1
                    };
                }
            }["Home.useCallback[dropBall]"]);
        }
    }["Home.useCallback[dropBall]"], [
        wager
    ]);
    // AutoPlay handler
    const handleStartAutoPlay = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "Home.useCallback[handleStartAutoPlay]": (settings)=>{
            setAutoPlaySettings(settings);
            setRemainingBalls(settings.numberOfRounds);
            initialWagerRef.current = wager;
            startingBalanceRef.current = gameState.balance;
            setIsAutoDrop(true);
        }
    }["Home.useCallback[handleStartAutoPlay]"], [
        wager,
        gameState.balance
    ]);
    // Auto Drop Logic
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "Home.useEffect": ()=>{
            let interval = null;
            if (isAutoDrop && remainingBalls > 0 && autoPlaySettings) {
                interval = window.setInterval({
                    "Home.useEffect": ()=>{
                        dropBall(autoPlaySettings.riskLevel);
                        setRemainingBalls({
                            "Home.useEffect": (prev)=>{
                                const newCount = prev - 1;
                                if (newCount <= 0) {
                                    setIsAutoDrop(false);
                                    setRemainingBalls(0);
                                }
                                return newCount;
                            }
                        }["Home.useEffect"]);
                    }
                }["Home.useEffect"], 1000); // Fixed 1 second interval
            }
            return ({
                "Home.useEffect": ()=>{
                    if (interval) clearInterval(interval);
                }
            })["Home.useEffect"];
        }
    }["Home.useEffect"], [
        isAutoDrop,
        dropBall,
        remainingBalls,
        autoPlaySettings
    ]);
    const adjustWager = (amount)=>{
        setWager((prev)=>Math.max(0.1, +(prev + amount).toFixed(2)));
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-col min-h-screen w-full bg-white transition-all duration-1000 overflow-y-auto",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$MainNav$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                fileName: "[project]/PLINKO/app/page.tsx",
                lineNumber: 193,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                className: "flex justify-between items-center px-4 py-3 z-30 bg-black/5 backdrop-blur-sm border-b border-black/20 mt-[60px]",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2 max-w-[60%] overflow-hidden",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex gap-1 overflow-x-auto no-scrollbar scroll-smooth",
                            children: history.length > 0 ? history.map((item, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: `bg-black/10 hover:bg-black/20 px-2.5 py-0.5 rounded text-[10px] font-black min-w-fit border border-black/20 text-black shadow-sm transition-all duration-300 hover:scale-105 animate-in fade-in slide-in-from-right-2`,
                                    style: {
                                        animationDelay: `${index * 100}ms`,
                                        animationFillMode: 'both'
                                    },
                                    children: [
                                        item.multiplier,
                                        "x"
                                    ]
                                }, item.id, true, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 201,
                                    columnNumber: 15
                                }, ("TURBOPACK compile-time value", void 0))) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-[10px] text-black/50 font-bold uppercase tracking-widest px-1 italic",
                                children: "Waiting for results..."
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/app/page.tsx",
                                lineNumber: 212,
                                columnNumber: 15
                            }, ("TURBOPACK compile-time value", void 0))
                        }, void 0, false, {
                            fileName: "[project]/PLINKO/app/page.tsx",
                            lineNumber: 199,
                            columnNumber: 11
                        }, ("TURBOPACK compile-time value", void 0))
                    }, void 0, false, {
                        fileName: "[project]/PLINKO/app/page.tsx",
                        lineNumber: 198,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2 bg-black/10 px-4 py-1.5 rounded-xl border border-black/20 shadow-inner hover:bg-black/15 transition-colors duration-200",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-black font-black text-sm tracking-tight",
                                children: gameState.balance.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                })
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/app/page.tsx",
                                lineNumber: 219,
                                columnNumber: 11
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-black/80 text-[8px] font-black",
                                children: "USD"
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/app/page.tsx",
                                lineNumber: 222,
                                columnNumber: 11
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/PLINKO/app/page.tsx",
                        lineNumber: 218,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/PLINKO/app/page.tsx",
                lineNumber: 196,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                className: "flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-6 p-4 lg:p-6 pb-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "order-1 lg:order-1 w-full flex justify-center items-start bg-black/5 rounded-2xl border border-black/10 shadow-inner pt-2",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$PlinkoGame$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            onScore: handleScore,
                            lastDrop: lastDrop
                        }, void 0, false, {
                            fileName: "[project]/PLINKO/app/page.tsx",
                            lineNumber: 230,
                            columnNumber: 11
                        }, ("TURBOPACK compile-time value", void 0))
                    }, void 0, false, {
                        fileName: "[project]/PLINKO/app/page.tsx",
                        lineNumber: 229,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "order-2 lg:order-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "hidden lg:flex items-center justify-center gap-2 p-4",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "bg-gradient-to-b from-gray-700 to-gray-800 rounded-full px-5 py-2 shadow-md border border-gray-600 min-w-[140px]",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-center",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-white/60 text-[9px] font-medium uppercase tracking-wide",
                                                    children: "Bet USD"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/app/page.tsx",
                                                    lineNumber: 243,
                                                    columnNumber: 17
                                                }, ("TURBOPACK compile-time value", void 0)),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-white font-bold text-lg font-mono",
                                                    children: wager.toFixed(2)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/app/page.tsx",
                                                    lineNumber: 244,
                                                    columnNumber: 17
                                                }, ("TURBOPACK compile-time value", void 0))
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/app/page.tsx",
                                            lineNumber: 242,
                                            columnNumber: 15
                                        }, ("TURBOPACK compile-time value", void 0))
                                    }, void 0, false, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 241,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center gap-1.5",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>adjustWager(-0.1),
                                                className: "w-11 h-11 rounded-full bg-gradient-to-b from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white font-bold text-xl shadow-md active:scale-95 transition-all",
                                                children: "−"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 250,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>setShowPresetModal(true),
                                                className: "w-11 h-11 rounded-full bg-gradient-to-b from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white shadow-md active:scale-95 transition-all flex items-center justify-center",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                                    className: "fas fa-layer-group text-sm"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/app/page.tsx",
                                                    lineNumber: 260,
                                                    columnNumber: 17
                                                }, ("TURBOPACK compile-time value", void 0))
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 256,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>adjustWager(0.1),
                                                className: "w-11 h-11 rounded-full bg-gradient-to-b from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white font-bold text-xl shadow-md active:scale-95 transition-all",
                                                children: "+"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 262,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 249,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: ()=>{
                                            if (isAutoDrop) {
                                                setIsAutoDrop(false);
                                                setRemainingBalls(0);
                                            } else {
                                                setShowAutoPlayModal(true);
                                            }
                                        },
                                        className: `w-12 h-12 rounded-full shadow-lg active:scale-95 transition-all flex items-center justify-center ${isAutoDrop ? 'bg-gradient-to-b from-orange-400 to-orange-500' : 'bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500'}`,
                                        children: isAutoDrop ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-white font-bold text-sm",
                                            children: remainingBalls
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/app/page.tsx",
                                            lineNumber: 287,
                                            columnNumber: 17
                                        }, ("TURBOPACK compile-time value", void 0)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                            className: "fas fa-sync-alt text-white text-lg"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/app/page.tsx",
                                            lineNumber: 289,
                                            columnNumber: 17
                                        }, ("TURBOPACK compile-time value", void 0))
                                    }, void 0, false, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 271,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: ()=>dropBall('GREEN'),
                                        className: "px-6 py-2.5 rounded-full bg-gradient-to-b from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 text-white font-bold text-sm shadow-lg active:scale-95 transition-all uppercase tracking-wider",
                                        children: "GREEN"
                                    }, void 0, false, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 294,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: ()=>dropBall('YELLOW'),
                                        className: "px-6 py-2.5 rounded-full bg-gradient-to-b from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-white font-bold text-sm shadow-lg active:scale-95 transition-all uppercase tracking-wider",
                                        children: "YELLOW"
                                    }, void 0, false, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 300,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: ()=>dropBall('RED'),
                                        className: "px-6 py-2.5 rounded-full bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-bold text-sm shadow-lg active:scale-95 transition-all uppercase tracking-wider",
                                        children: "RED"
                                    }, void 0, false, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 306,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/PLINKO/app/page.tsx",
                                lineNumber: 239,
                                columnNumber: 11
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "lg:hidden flex flex-col gap-2 p-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center justify-center gap-2",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>{
                                                    if (isAutoDrop) {
                                                        setIsAutoDrop(false);
                                                        setRemainingBalls(0);
                                                    } else {
                                                        setShowAutoPlayModal(true);
                                                    }
                                                },
                                                className: `w-12 h-12 rounded-full shadow-lg active:scale-95 transition-all flex items-center justify-center ${isAutoDrop ? 'bg-gradient-to-b from-orange-400 to-orange-500' : 'bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500'}`,
                                                children: isAutoDrop ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-white font-bold text-sm",
                                                    children: remainingBalls
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/app/page.tsx",
                                                    lineNumber: 334,
                                                    columnNumber: 19
                                                }, ("TURBOPACK compile-time value", void 0)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                                    className: "fas fa-sync-alt text-white text-lg"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/app/page.tsx",
                                                    lineNumber: 336,
                                                    columnNumber: 19
                                                }, ("TURBOPACK compile-time value", void 0))
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 318,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>dropBall('GREEN'),
                                                className: "px-5 py-2 rounded-full bg-gradient-to-b from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 text-white font-bold text-xs shadow-lg active:scale-95 transition-all uppercase",
                                                children: "GREEN"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 340,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>dropBall('YELLOW'),
                                                className: "px-4 py-2 rounded-full bg-gradient-to-b from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-white font-bold text-xs shadow-lg active:scale-95 transition-all uppercase",
                                                children: "YELLOW"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 346,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>dropBall('RED'),
                                                className: "px-5 py-2 rounded-full bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-bold text-xs shadow-lg active:scale-95 transition-all uppercase",
                                                children: "RED"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 352,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 317,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center justify-center gap-2",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "bg-gradient-to-b from-gray-700 to-gray-800 rounded-full px-5 py-1.5 shadow-md border border-gray-600 flex-1 max-w-[180px]",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-center",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "text-white/60 text-[8px] font-medium uppercase",
                                                            children: "Bet USD"
                                                        }, void 0, false, {
                                                            fileName: "[project]/PLINKO/app/page.tsx",
                                                            lineNumber: 364,
                                                            columnNumber: 19
                                                        }, ("TURBOPACK compile-time value", void 0)),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "text-white font-bold text-base font-mono",
                                                            children: wager.toFixed(2)
                                                        }, void 0, false, {
                                                            fileName: "[project]/PLINKO/app/page.tsx",
                                                            lineNumber: 365,
                                                            columnNumber: 19
                                                        }, ("TURBOPACK compile-time value", void 0))
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/PLINKO/app/page.tsx",
                                                    lineNumber: 363,
                                                    columnNumber: 17
                                                }, ("TURBOPACK compile-time value", void 0))
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 362,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>adjustWager(-0.1),
                                                className: "w-11 h-11 rounded-full bg-gradient-to-b from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white font-bold text-lg shadow-md active:scale-95 transition-all",
                                                children: "−"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 369,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>setShowPresetModal(true),
                                                className: "w-11 h-11 rounded-full bg-gradient-to-b from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white shadow-md active:scale-95 transition-all flex items-center justify-center",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                                    className: "fas fa-layer-group text-sm"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/app/page.tsx",
                                                    lineNumber: 379,
                                                    columnNumber: 17
                                                }, ("TURBOPACK compile-time value", void 0))
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 375,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>adjustWager(0.1),
                                                className: "w-11 h-11 rounded-full bg-gradient-to-b from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white font-bold text-lg shadow-md active:scale-95 transition-all",
                                                children: "+"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 381,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 361,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/PLINKO/app/page.tsx",
                                lineNumber: 315,
                                columnNumber: 11
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/PLINKO/app/page.tsx",
                        lineNumber: 237,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/PLINKO/app/page.tsx",
                lineNumber: 227,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$AutoPlayModal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                open: showAutoPlayModal,
                onOpenChange: setShowAutoPlayModal,
                onStart: handleStartAutoPlay,
                currentBalance: gameState.balance
            }, void 0, false, {
                fileName: "[project]/PLINKO/app/page.tsx",
                lineNumber: 393,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$Footer$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                fileName: "[project]/PLINKO/app/page.tsx",
                lineNumber: 401,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0))
        ]
    }, void 0, true, {
        fileName: "[project]/PLINKO/app/page.tsx",
        lineNumber: 189,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
_s(Home, "SWqS1tYaU39CBNbURIkOgjcWozs=");
_c = Home;
const __TURBOPACK__default__export__ = Home;
var _c;
__turbopack_context__.k.register(_c, "Home");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=PLINKO_02a58a4a._.js.map