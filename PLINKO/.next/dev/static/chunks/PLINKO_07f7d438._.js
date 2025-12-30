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
    PEG: 'rgb(255, 254, 254)',
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
        2.5,
        2,
        1.5,
        1.3,
        1,
        0.5,
        1,
        1.3,
        1.5,
        2,
        2.5,
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
        2.5,
        1.2,
        0.5,
        0.2,
        0,
        0.2,
        0.5,
        1.2,
        2.5,
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
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$contexts$2f$SettingsContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/contexts/SettingsContext.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
;
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
    // Settings
    const { pegSound } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$contexts$2f$SettingsContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSettings"])();
    // Sound effects with Web Audio API for smooth playback
    const audioContextRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const audioBuffers = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const lastPegSoundTime = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    const activePegSounds = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    const MAX_CONCURRENT_PEG_SOUNDS = 3; // Limit simultaneous peg sounds
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
                            loadAudio('/ui/sounds/peghit2.mp3', 'peg-default'),
                            loadAudio('/ui/sounds/peghitalt.wav', 'peg-alt'),
                            loadAudio('/ui/sounds/bucketHit.wav', 'bucket'),
                            loadAudio('/ui/sounds/negative.mp3', 'negative')
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
            // Track when sound ends for peg sounds
            if (soundKey === 'peg-default' || soundKey === 'peg-alt') {
                activePegSounds.current++;
                source.onended = ()=>{
                    activePegSounds.current = Math.max(0, activePegSounds.current - 1);
                };
            }
            // Start and stop at specified duration
            source.start(0);
            if (duration) {
                source.stop(now + duration);
            }
        } catch (error) {
            // Fallback to simple Audio if Web Audio API fails
            console.warn('Web Audio API failed, using fallback');
            try {
                const audio = new Audio(`/ui/sounds/${soundKey === 'peg' ? 'peghit2.mp3' : soundKey === 'bucket' ? 'bucketHit.wav' : 'negative.mp3'}`);
                audio.volume = volume;
                audio.play().catch(()=>{});
            } catch (fallbackError) {
            // Silently fail
            }
        }
    };
    const playPegHitSound = (pegY)=>{
        // Don't play if sound is off
        if (pegSound === 'off') return;
        const now = Date.now();
        const timeSinceLastSound = now - lastPegSoundTime.current;
        // Throttle: Only play if 30ms has passed AND we're not already playing too many
        if (timeSinceLastSound >= 30 && activePegSounds.current < MAX_CONCURRENT_PEG_SOUNDS) {
            lastPegSoundTime.current = now;
            // Calculate pitch based on peg Y position (lower pegs = lower pitch)
            // Pegs range from startY (top) to startY + (ROWS-1) * pegGapY (bottom)
            const totalPegHeight = (__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ROWS"] - 1) * 18; // pegGapY = 18
            const normalizedY = (pegY - startY) / totalPegHeight; // 0 at top, 1 at bottom
            const pitch = 1.0 - normalizedY * 0.4; // Range from 1.0 (high) to 0.6 (low)
            // Play the selected sound - use longer duration for WAV file
            const soundKey = pegSound === 'default' ? 'peg-default' : 'peg-alt';
            const duration = pegSound === 'default' ? 0.08 : 0.15; // WAV file needs more time
            console.log(`Playing peg sound: ${soundKey}, pegSound setting: ${pegSound}, buffer exists: ${audioBuffers.current.has(soundKey)}`);
            playSound(soundKey, 0.12, duration, pitch); // Longer duration for WAV
        }
    };
    const playBucketHitSound = ()=>playSound('bucket', 0.4);
    const playNegativeSound = ()=>playSound('negative', 0.4);
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
            const bucketsTotalWidth = bucketCount * bucketWidth; // No gaps between buckets
            const bucketsStartX = boardOffsetX + (BOARD_WIDTH - bucketsTotalWidth) / 2; // Center in fixed board
            const bucketBaseY = startY + (__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ROWS"] + 1) * pegGapY - 24;
            const bucketStepY = pegGapY * 0.4; // Adjusted spacing for smaller board
            for(let i = 0; i < bucketCount; i++){
                const x = bucketsStartX + i * bucketWidth + bucketWidth / 2; // Center of each bucket
                const sensor = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].Bodies.rectangle(x, bucketBaseY + bucketStepY * 3.5, bucketWidth, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BUCKET_HEIGHT"] + 20, {
                    isStatic: true,
                    isSensor: true,
                    label: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CollisionLabel"].BUCKET,
                    plugin: {
                        index: i
                    },
                    render: {
                        fillStyle: 'transparent'
                    }
                });
                __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].World.add(engine.world, sensor);
            }
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
                                // Play peg hit sound with pitch based on Y position
                                playPegHitSound(peg.position.y);
                            }
                            if (ball && bucket && !ballsToRemove.current.has(ball)) {
                                const index = bucket.plugin.index;
                                const risk = ball.plugin.risk;
                                const multiplier = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MULTIPLIERS"][risk][index];
                                activeHits.current.set(`${risk}-${index}`, Date.now());
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
                    // Dividers
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
                    ctx.lineWidth = 1;
                    for(let i = 0; i <= bucketCount; i++){
                        const x = bucketsStartX + i * bucketWidth;
                        ctx.beginPath();
                        ctx.moveTo(x, bucketBaseY - 10);
                        ctx.lineTo(x, bucketBaseY + bucketStepY * 3 + __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BUCKET_HEIGHT"]);
                        ctx.stroke();
                    }
                    // Bucket Multipliers Rendering
                    const tiers = [
                        'GREEN',
                        'YELLOW',
                        'RED'
                    ];
                    tiers.forEach({
                        "PlinkoGame.useEffect": (tier, tIdx)=>{
                            const tierHeight = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BUCKET_HEIGHT"] + 8 + 0; // Bucket height + padding
                            const yBase = bucketBaseY + tIdx * tierHeight;
                            const mults = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MULTIPLIERS"][tier];
                            const ballColor = tier === 'GREEN' ? __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COLORS"].BALL_GREEN : tier === 'YELLOW' ? __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COLORS"].BALL_YELLOW : __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COLORS"].BALL_RED;
                            mults.forEach({
                                "PlinkoGame.useEffect": (m, i)=>{
                                    const x = bucketsStartX + i * bucketWidth + bucketWidth / 2; // Center of each bucket
                                    const bW = bucketWidth - 2;
                                    const bH = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BUCKET_HEIGHT"] + 8; // Taller for vertical text
                                    let scale = 1.0;
                                    let glowOpacity = 0;
                                    const hitKey = `${tier}-${i}`;
                                    const hitTime = activeHits.current.get(hitKey);
                                    if (hitTime) {
                                        const elapsed = now - hitTime;
                                        if (elapsed < 350) scale = 1.0 + Math.sin(elapsed / 350 * Math.PI) * 0.8; // Increased zoom effect
                                        if (elapsed < 1500) glowOpacity = 1.0 - elapsed / 3500; // Extended fade-out duration
                                        else activeHits.current.delete(hitKey);
                                    }
                                    const finalBW = bW * scale;
                                    const finalBH = bH * scale;
                                    // Extract RGB values from ball color for glow
                                    const colorMatch = ballColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                                    const [_, r, g, b] = colorMatch ? colorMatch : [
                                        null,
                                        '0',
                                        '255',
                                        '0'
                                    ];
                                    // No borders - just glow effect when hit
                                    if (glowOpacity > 0) {
                                        ctx.save();
                                        ctx.beginPath();
                                        ctx.roundRect(x - finalBW / 2, yBase - (finalBH - bH) / 2, finalBW, finalBH, 4);
                                        ctx.shadowBlur = 12 * glowOpacity;
                                        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${glowOpacity * 0.8})`;
                                        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${glowOpacity * 0.6})`;
                                        ctx.lineWidth = 2 * scale;
                                        ctx.stroke();
                                        ctx.restore();
                                    }
                                    // Draw vertical text for better readability - lights up when hit
                                    ctx.save();
                                    ctx.translate(x, yBase + bH / 2);
                                    ctx.rotate(-Math.PI / 2); // Rotate 90 degrees counterclockwise
                                    // Text color uses tier ball color, brighter when hit
                                    const textColor = glowOpacity > 0 ? `rgba(${r}, ${g}, ${b}, ${0.8 + glowOpacity * 0.2})` // Brighter tier color when glowing
                                     : ballColor; // Normal tier ball color
                                    ctx.fillStyle = textColor;
                                    ctx.font = `bold ${Math.max(8, pegGapX / 2.5) * scale}px Inter`;
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'middle';
                                    ctx.fillText(m.toString(), 0, 0);
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
        }
    }["PlinkoGame.useEffect"], [
        lastDrop
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: containerRef,
        className: "w-full h-full relative",
        style: {
            backgroundImage: backgroundLoaded ? `url('/ui/Pulse Branding/Banner/Dark/minimal.png')` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("canvas", {
            ref: canvasRef
        }, void 0, false, {
            fileName: "[project]/PLINKO/components/PlinkoGame.tsx",
            lineNumber: 602,
            columnNumber: 7
        }, ("TURBOPACK compile-time value", void 0))
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/PlinkoGame.tsx",
        lineNumber: 592,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
_s(PlinkoGame, "+Oe58T5dw+06pyRbN9X0mUB2lhI=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$contexts$2f$SettingsContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSettings"]
    ];
});
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
"[project]/PLINKO/components/ui/radio-group.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "RadioGroup",
    ()=>RadioGroup,
    "RadioGroupItem",
    ()=>RadioGroupItem
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$radio$2d$group$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/@radix-ui/react-radio-group/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Circle$3e$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/lucide-react/dist/esm/icons/circle.js [app-client] (ecmascript) <export default as Circle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/lib/utils.ts [app-client] (ecmascript)");
;
;
;
;
;
const RadioGroup = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["forwardRef"](_c = ({ className, ...props }, ref)=>{
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$radio$2d$group$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Root"], {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("grid gap-2", className),
        ...props,
        ref: ref
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/radio-group.tsx",
        lineNumber: 12,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
});
_c1 = RadioGroup;
RadioGroup.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$radio$2d$group$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Root"].displayName;
const RadioGroupItem = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["forwardRef"](_c2 = ({ className, ...props }, ref)=>{
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$radio$2d$group$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Item"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", className),
        ...props,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$radio$2d$group$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Indicator"], {
            className: "flex items-center justify-center",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Circle$3e$__["Circle"], {
                className: "h-2.5 w-2.5 fill-current text-current"
            }, void 0, false, {
                fileName: "[project]/PLINKO/components/ui/radio-group.tsx",
                lineNumber: 35,
                columnNumber: 9
            }, ("TURBOPACK compile-time value", void 0))
        }, void 0, false, {
            fileName: "[project]/PLINKO/components/ui/radio-group.tsx",
            lineNumber: 34,
            columnNumber: 7
        }, ("TURBOPACK compile-time value", void 0))
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/radio-group.tsx",
        lineNumber: 26,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
});
_c3 = RadioGroupItem;
RadioGroupItem.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$radio$2d$group$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Item"].displayName;
;
var _c, _c1, _c2, _c3;
__turbopack_context__.k.register(_c, "RadioGroup$React.forwardRef");
__turbopack_context__.k.register(_c1, "RadioGroup");
__turbopack_context__.k.register(_c2, "RadioGroupItem$React.forwardRef");
__turbopack_context__.k.register(_c3, "RadioGroupItem");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/PLINKO/components/SettingsNav.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>SettingsNav
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/lucide-react/dist/esm/icons/settings.js [app-client] (ecmascript) <export default as Settings>");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/dialog.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/label.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$radio$2d$group$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/radio-group.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$contexts$2f$SettingsContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/contexts/SettingsContext.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
;
;
function SettingsNav() {
    _s();
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const { pegSound, setPegSound } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$contexts$2f$SettingsContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSettings"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed top-4 right-4 z-50",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Dialog"], {
            open: open,
            onOpenChange: setOpen,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogTrigger"], {
                    asChild: true,
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                        variant: "outline",
                        size: "icon",
                        className: "bg-white hover:bg-white/90 border-2 border-green-600 text-green-600 hover:text-green-700",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__["Settings"], {
                            className: "h-5 w-5"
                        }, void 0, false, {
                            fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                            lineNumber: 30,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                        lineNumber: 25,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                    lineNumber: 24,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogContent"], {
                    className: "sm:max-w-[425px] bg-white",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogHeader"], {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogTitle"], {
                                className: "text-2xl font-bold text-gray-900",
                                children: "Settings"
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                                lineNumber: 35,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                            lineNumber: 34,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "max-h-[60vh] overflow-y-auto px-1",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "space-y-4 py-4",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "space-y-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                            className: "text-lg font-semibold text-gray-900",
                                            children: "Sounds"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                                            lineNumber: 41,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "space-y-3",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Label"], {
                                                    htmlFor: "peg-sound",
                                                    className: "text-sm font-medium text-gray-700",
                                                    children: "Peg Sound"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                                                    lineNumber: 45,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$radio$2d$group$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["RadioGroup"], {
                                                    id: "peg-sound",
                                                    value: pegSound,
                                                    onValueChange: (value)=>setPegSound(value),
                                                    className: "space-y-2",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "flex items-center space-x-3 rounded-lg border-2 border-gray-200 p-3 hover:border-green-600 transition-colors",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$radio$2d$group$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["RadioGroupItem"], {
                                                                    value: "default",
                                                                    id: "sound-default",
                                                                    className: "border-green-600 text-green-600"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                                                                    lineNumber: 55,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Label"], {
                                                                    htmlFor: "sound-default",
                                                                    className: "flex-1 cursor-pointer font-normal text-gray-900",
                                                                    children: "Default (peghit.mp3)"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                                                                    lineNumber: 60,
                                                                    columnNumber: 23
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                                                            lineNumber: 54,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "flex items-center space-x-3 rounded-lg border-2 border-gray-200 p-3 hover:border-green-600 transition-colors",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$radio$2d$group$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["RadioGroupItem"], {
                                                                    value: "alt",
                                                                    id: "sound-alt",
                                                                    className: "border-green-600 text-green-600"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                                                                    lineNumber: 68,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Label"], {
                                                                    htmlFor: "sound-alt",
                                                                    className: "flex-1 cursor-pointer font-normal text-gray-900",
                                                                    children: "Alternative (peghitalt.wav)"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                                                                    lineNumber: 73,
                                                                    columnNumber: 23
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                                                            lineNumber: 67,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "flex items-center space-x-3 rounded-lg border-2 border-gray-200 p-3 hover:border-green-600 transition-colors",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$radio$2d$group$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["RadioGroupItem"], {
                                                                    value: "off",
                                                                    id: "sound-off",
                                                                    className: "border-green-600 text-green-600"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                                                                    lineNumber: 81,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Label"], {
                                                                    htmlFor: "sound-off",
                                                                    className: "flex-1 cursor-pointer font-normal text-gray-900",
                                                                    children: "Off (No peg sound)"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                                                                    lineNumber: 86,
                                                                    columnNumber: 23
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                                                            lineNumber: 80,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                                                    lineNumber: 48,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                                            lineNumber: 44,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                                    lineNumber: 40,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                                lineNumber: 39,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                            lineNumber: 37,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/PLINKO/components/SettingsNav.tsx",
                    lineNumber: 33,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/PLINKO/components/SettingsNav.tsx",
            lineNumber: 23,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/SettingsNav.tsx",
        lineNumber: 22,
        columnNumber: 5
    }, this);
}
_s(SettingsNav, "Q14Kx2t7DqaOuhuF4uwJOgyIzpU=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$contexts$2f$SettingsContext$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSettings"]
    ];
});
_c = SettingsNav;
var _c;
__turbopack_context__.k.register(_c, "SettingsNav");
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
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$SettingsNav$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/SettingsNav.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
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
    const [showAutoDropModal, setShowAutoDropModal] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [autoDropSettings, setAutoDropSettings] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        ballCount: 10,
        riskLevel: 'GREEN',
        customBallCount: ''
    });
    const [remainingBalls, setRemainingBalls] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    const [backgroundIndex, setBackgroundIndex] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    const lastRiskRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])('GREEN');
    const historyIdCounter = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
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
            setGameState({
                "Home.useCallback[handleScore]": (prev)=>({
                        ...prev,
                        balance: prev.balance + wager * multiplier
                    })
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
        wager
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
    // Auto Drop Logic
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "Home.useEffect": ()=>{
            let interval = null;
            if (isAutoDrop && remainingBalls > 0) {
                interval = window.setInterval({
                    "Home.useEffect": ()=>{
                        dropBall(autoDropSettings.riskLevel);
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
        autoDropSettings.riskLevel
    ]);
    const adjustWager = (amount)=>{
        setWager((prev)=>Math.max(0.1, +(prev + amount).toFixed(2)));
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-col h-screen w-full overflow-hidden bg-white transition-all duration-1000",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$SettingsNav$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                fileName: "[project]/PLINKO/app/page.tsx",
                lineNumber: 116,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                className: "flex justify-between items-center px-4 py-3 z-30 bg-black/5 backdrop-blur-sm border-b border-black/20",
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
                                    lineNumber: 124,
                                    columnNumber: 15
                                }, ("TURBOPACK compile-time value", void 0))) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-[10px] text-black/50 font-bold uppercase tracking-widest px-1 italic",
                                children: "Waiting for results..."
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/app/page.tsx",
                                lineNumber: 135,
                                columnNumber: 15
                            }, ("TURBOPACK compile-time value", void 0))
                        }, void 0, false, {
                            fileName: "[project]/PLINKO/app/page.tsx",
                            lineNumber: 122,
                            columnNumber: 11
                        }, ("TURBOPACK compile-time value", void 0))
                    }, void 0, false, {
                        fileName: "[project]/PLINKO/app/page.tsx",
                        lineNumber: 121,
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
                                lineNumber: 142,
                                columnNumber: 11
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-black/80 text-[8px] font-black",
                                children: "USD"
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/app/page.tsx",
                                lineNumber: 145,
                                columnNumber: 11
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/PLINKO/app/page.tsx",
                        lineNumber: 141,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/PLINKO/app/page.tsx",
                lineNumber: 119,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                className: "flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-6 p-4 lg:p-6 overflow-hidden",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "order-1 lg:order-1 w-full h-full flex justify-center items-center bg-black/5 rounded-2xl border border-black/10 shadow-inner",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$PlinkoGame$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            onScore: handleScore,
                            lastDrop: lastDrop
                        }, void 0, false, {
                            fileName: "[project]/PLINKO/app/page.tsx",
                            lineNumber: 153,
                            columnNumber: 11
                        }, ("TURBOPACK compile-time value", void 0))
                    }, void 0, false, {
                        fileName: "[project]/PLINKO/app/page.tsx",
                        lineNumber: 152,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "order-2 lg:order-2 space-y-6",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex flex-col gap-4",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "bg-black/5 rounded-2xl p-3 border border-black/10 shadow-inner hover:bg-black/10 transition-colors duration-200",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "grid grid-cols-3 gap-3 items-center",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex flex-col items-start",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-black/70 text-[8px] font-black uppercase tracking-tighter",
                                                        children: "Wager USD"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/app/page.tsx",
                                                        lineNumber: 167,
                                                        columnNumber: 19
                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-black font-mono font-bold text-base",
                                                        children: wager.toFixed(2)
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/app/page.tsx",
                                                        lineNumber: 168,
                                                        columnNumber: 19
                                                    }, ("TURBOPACK compile-time value", void 0))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 166,
                                                columnNumber: 17
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex flex-col gap-1",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>setWager(Math.max(0.1, wager / 2)),
                                                        className: "w-full h-6 rounded-lg bg-black/10 backdrop-blur-sm flex items-center justify-center text-black border border-black/20 hover:bg-black/20 hover:border-black/30 active:scale-95 transition-all duration-200 text-[9px] font-bold shadow-md",
                                                        children: "½"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/app/page.tsx",
                                                        lineNumber: 175,
                                                        columnNumber: 19
                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>setWager(wager * 2),
                                                        className: "w-full h-6 rounded-lg bg-black/10 backdrop-blur-sm flex items-center justify-center text-black border border-black/20 hover:bg-black/20 hover:border-black/30 active:scale-95 transition-all duration-200 text-[9px] font-bold shadow-md",
                                                        children: "2×"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/app/page.tsx",
                                                        lineNumber: 181,
                                                        columnNumber: 19
                                                    }, ("TURBOPACK compile-time value", void 0))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 174,
                                                columnNumber: 17
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex flex-col gap-2",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex items-center gap-1 justify-center",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                onClick: ()=>adjustWager(-0.1),
                                                                className: "w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-black border border-black/20 hover:bg-black/10 hover:border-black/30 active:scale-90 transition-all duration-200 text-sm",
                                                                children: "-"
                                                            }, void 0, false, {
                                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                                lineNumber: 193,
                                                                columnNumber: 21
                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                onClick: ()=>adjustWager(0.1),
                                                                className: "w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-black border border-black/20 hover:bg-black/10 hover:border-black/30 active:scale-90 transition-all duration-200 text-sm",
                                                                children: "+"
                                                            }, void 0, false, {
                                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                                lineNumber: 194,
                                                                columnNumber: 21
                                                            }, ("TURBOPACK compile-time value", void 0))
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/PLINKO/app/page.tsx",
                                                        lineNumber: 192,
                                                        columnNumber: 19
                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>{
                                                            if (isAutoDrop) {
                                                                setIsAutoDrop(false);
                                                                setRemainingBalls(0);
                                                            } else {
                                                                setShowAutoDropModal(true);
                                                            }
                                                        },
                                                        className: `w-full h-8 rounded-lg transition-all duration-200 border backdrop-blur-sm shadow-md hover:shadow-lg relative overflow-hidden text-[8px] font-bold ${isAutoDrop ? 'bg-black/20 border-black/40 text-black shadow-black/10 laser-border' : 'bg-black/10 border-black/20 text-black/70 hover:text-black hover:bg-black/15'}`,
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "uppercase tracking-widest",
                                                            children: isAutoDrop ? `${remainingBalls}` : 'Auto'
                                                        }, void 0, false, {
                                                            fileName: "[project]/PLINKO/app/page.tsx",
                                                            lineNumber: 213,
                                                            columnNumber: 21
                                                        }, ("TURBOPACK compile-time value", void 0))
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/app/page.tsx",
                                                        lineNumber: 198,
                                                        columnNumber: 19
                                                    }, ("TURBOPACK compile-time value", void 0))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 190,
                                                columnNumber: 17
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 164,
                                        columnNumber: 15
                                    }, ("TURBOPACK compile-time value", void 0))
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 163,
                                    columnNumber: 13
                                }, ("TURBOPACK compile-time value", void 0)),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex gap-2 flex-1",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>dropBall('GREEN'),
                                            className: "bg-black/10 hover:bg-black/20 active:scale-95 transition-all duration-200 text-black font-black py-3 rounded-xl text-[10px] tracking-widest shadow-lg hover:shadow-xl border border-black/20 uppercase flex-1",
                                            children: "Low"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/app/page.tsx",
                                            lineNumber: 223,
                                            columnNumber: 15
                                        }, ("TURBOPACK compile-time value", void 0)),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>dropBall('YELLOW'),
                                            className: "bg-black/15 hover:bg-black/25 active:scale-95 transition-all duration-200 text-black font-black py-3 rounded-xl text-[10px] tracking-widest shadow-lg hover:shadow-xl border border-black/20 uppercase flex-1",
                                            children: "Medium"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/app/page.tsx",
                                            lineNumber: 229,
                                            columnNumber: 15
                                        }, ("TURBOPACK compile-time value", void 0)),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>dropBall('RED'),
                                            className: "bg-black/20 hover:bg-black/30 active:scale-95 transition-all duration-200 text-black font-black py-3 rounded-xl text-[10px] tracking-widest shadow-lg hover:shadow-xl border border-black/20 uppercase flex-1",
                                            children: "High"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/app/page.tsx",
                                            lineNumber: 235,
                                            columnNumber: 15
                                        }, ("TURBOPACK compile-time value", void 0))
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 222,
                                    columnNumber: 13
                                }, ("TURBOPACK compile-time value", void 0))
                            ]
                        }, void 0, true, {
                            fileName: "[project]/PLINKO/app/page.tsx",
                            lineNumber: 161,
                            columnNumber: 11
                        }, ("TURBOPACK compile-time value", void 0))
                    }, void 0, false, {
                        fileName: "[project]/PLINKO/app/page.tsx",
                        lineNumber: 160,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/PLINKO/app/page.tsx",
                lineNumber: 150,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            showAutoDropModal && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                            className: "text-xl font-bold text-black mb-6 text-center",
                            children: "Auto Drop Settings"
                        }, void 0, false, {
                            fileName: "[project]/PLINKO/app/page.tsx",
                            lineNumber: 250,
                            columnNumber: 13
                        }, ("TURBOPACK compile-time value", void 0)),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mb-6",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "block text-sm font-semibold text-black/80 mb-3",
                                    children: "Number of Balls"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 254,
                                    columnNumber: 15
                                }, ("TURBOPACK compile-time value", void 0)),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "grid grid-cols-3 gap-2 mb-3",
                                    children: [
                                        5,
                                        10,
                                        20
                                    ].map((count)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>setAutoDropSettings((prev)=>({
                                                        ...prev,
                                                        ballCount: count,
                                                        customBallCount: ''
                                                    })),
                                            className: `py-2 px-3 rounded-lg text-sm font-bold transition-all ${autoDropSettings.ballCount === count && autoDropSettings.customBallCount === '' ? 'bg-black text-white' : 'bg-black/10 text-black hover:bg-black/20'}`,
                                            children: count
                                        }, count, false, {
                                            fileName: "[project]/PLINKO/app/page.tsx",
                                            lineNumber: 257,
                                            columnNumber: 19
                                        }, ("TURBOPACK compile-time value", void 0)))
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 255,
                                    columnNumber: 15
                                }, ("TURBOPACK compile-time value", void 0)),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "grid grid-cols-2 gap-2",
                                    children: [
                                        [
                                            50,
                                            100
                                        ].map((count)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>setAutoDropSettings((prev)=>({
                                                            ...prev,
                                                            ballCount: count,
                                                            customBallCount: ''
                                                        })),
                                                className: `py-2 px-3 rounded-lg text-sm font-bold transition-all ${autoDropSettings.ballCount === count && autoDropSettings.customBallCount === '' ? 'bg-black text-white' : 'bg-black/10 text-black hover:bg-black/20'}`,
                                                children: count
                                            }, count, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 272,
                                                columnNumber: 19
                                            }, ("TURBOPACK compile-time value", void 0))),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            type: "number",
                                            placeholder: "Custom",
                                            value: autoDropSettings.customBallCount,
                                            onChange: (e)=>{
                                                const value = e.target.value;
                                                const numValue = parseInt(value) || 0;
                                                setAutoDropSettings((prev)=>({
                                                        ...prev,
                                                        customBallCount: value,
                                                        ballCount: numValue > 0 ? numValue : prev.ballCount
                                                    }));
                                            },
                                            className: "py-2 px-3 rounded-lg text-sm border border-black/20 bg-white text-black placeholder-black/50 focus:border-black focus:outline-none",
                                            min: "1",
                                            max: "1000"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/app/page.tsx",
                                            lineNumber: 284,
                                            columnNumber: 17
                                        }, ("TURBOPACK compile-time value", void 0))
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 270,
                                    columnNumber: 15
                                }, ("TURBOPACK compile-time value", void 0))
                            ]
                        }, void 0, true, {
                            fileName: "[project]/PLINKO/app/page.tsx",
                            lineNumber: 253,
                            columnNumber: 13
                        }, ("TURBOPACK compile-time value", void 0)),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mb-8",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "block text-sm font-semibold text-black/80 mb-3",
                                    children: "Risk Level"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 306,
                                    columnNumber: 15
                                }, ("TURBOPACK compile-time value", void 0)),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "space-y-2",
                                    children: [
                                        {
                                            key: 'GREEN',
                                            label: 'Low Risk',
                                            desc: 'Safer, lower rewards'
                                        },
                                        {
                                            key: 'YELLOW',
                                            label: 'Medium Risk',
                                            desc: 'Balanced risk/reward'
                                        },
                                        {
                                            key: 'RED',
                                            label: 'High Risk',
                                            desc: 'Higher risk, higher rewards'
                                        }
                                    ].map(({ key, label, desc })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>setAutoDropSettings((prev)=>({
                                                        ...prev,
                                                        riskLevel: key
                                                    })),
                                            className: `w-full p-3 rounded-lg text-left transition-all ${autoDropSettings.riskLevel === key ? 'bg-black text-white' : 'bg-black/10 text-black hover:bg-black/20'}`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "font-bold text-sm",
                                                    children: label
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/app/page.tsx",
                                                    lineNumber: 322,
                                                    columnNumber: 21
                                                }, ("TURBOPACK compile-time value", void 0)),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: `text-xs ${autoDropSettings.riskLevel === key ? 'text-white/80' : 'text-black/60'}`,
                                                    children: desc
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/app/page.tsx",
                                                    lineNumber: 323,
                                                    columnNumber: 21
                                                }, ("TURBOPACK compile-time value", void 0))
                                            ]
                                        }, key, true, {
                                            fileName: "[project]/PLINKO/app/page.tsx",
                                            lineNumber: 313,
                                            columnNumber: 19
                                        }, ("TURBOPACK compile-time value", void 0)))
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 307,
                                    columnNumber: 15
                                }, ("TURBOPACK compile-time value", void 0))
                            ]
                        }, void 0, true, {
                            fileName: "[project]/PLINKO/app/page.tsx",
                            lineNumber: 305,
                            columnNumber: 13
                        }, ("TURBOPACK compile-time value", void 0)),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex gap-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    onClick: ()=>setShowAutoDropModal(false),
                                    className: "flex-1 py-3 px-4 bg-black/10 text-black font-bold rounded-lg hover:bg-black/20 transition-all",
                                    children: "Cancel"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 333,
                                    columnNumber: 15
                                }, ("TURBOPACK compile-time value", void 0)),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    onClick: ()=>{
                                        const ballCount = autoDropSettings.customBallCount ? parseInt(autoDropSettings.customBallCount) || autoDropSettings.ballCount : autoDropSettings.ballCount;
                                        setRemainingBalls(ballCount);
                                        setIsAutoDrop(true);
                                        setShowAutoDropModal(false);
                                    },
                                    className: "flex-1 py-3 px-4 bg-black text-white font-bold rounded-lg hover:bg-black/80 transition-all",
                                    children: "Start Auto Drop"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 339,
                                    columnNumber: 15
                                }, ("TURBOPACK compile-time value", void 0))
                            ]
                        }, void 0, true, {
                            fileName: "[project]/PLINKO/app/page.tsx",
                            lineNumber: 332,
                            columnNumber: 13
                        }, ("TURBOPACK compile-time value", void 0))
                    ]
                }, void 0, true, {
                    fileName: "[project]/PLINKO/app/page.tsx",
                    lineNumber: 249,
                    columnNumber: 11
                }, ("TURBOPACK compile-time value", void 0))
            }, void 0, false, {
                fileName: "[project]/PLINKO/app/page.tsx",
                lineNumber: 248,
                columnNumber: 9
            }, ("TURBOPACK compile-time value", void 0))
        ]
    }, void 0, true, {
        fileName: "[project]/PLINKO/app/page.tsx",
        lineNumber: 112,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
_s(Home, "Wf9u33kWsUjp0tsk+xJqK5+4V5I=");
_c = Home;
const __TURBOPACK__default__export__ = Home;
var _c;
__turbopack_context__.k.register(_c, "Home");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=PLINKO_07f7d438._.js.map