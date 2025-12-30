module.exports = [
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[project]/PLINKO/constants.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
}),
"[project]/PLINKO/types.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
}),
"[project]/PLINKO/components/PlinkoGame.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/matter-js/build/matter.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/constants.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/types.ts [app-ssr] (ecmascript)");
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
    const containerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const canvasRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const engineRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const renderRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [dimensions, setDimensions] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        width: 0,
        height: 0
    });
    const ballsToRemove = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(new Set());
    const activeHits = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const pegHits = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(new Map()); // Track single hits
    const [backgroundLoaded, setBackgroundLoaded] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [gradientImage, setGradientImage] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    // Sound effects with Web Audio API for smooth playback
    const audioContextRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const audioBuffers = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const lastPegSoundTime = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(0);
    const activePegSounds = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(0);
    const MAX_CONCURRENT_PEG_SOUNDS = 3; // Limit simultaneous peg sounds
    // Initialize Web Audio API context and preload sounds
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const initAudio = async ()=>{
            try {
                // Create audio context
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
                // Load and decode audio files
                const loadAudio = async (url, key)=>{
                    const response = await fetch(url);
                    const arrayBuffer = await response.arrayBuffer();
                    const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
                    audioBuffers.current.set(key, audioBuffer);
                };
                await Promise.all([
                    loadAudio('/ui/sounds/peghit2.mp3', 'peg'),
                    loadAudio('/ui/sounds/bucketHit.wav', 'bucket'),
                    loadAudio('/ui/sounds/negative.mp3', 'negative')
                ]);
                console.log('Audio files loaded successfully');
            } catch (error) {
                console.warn('Audio initialization failed:', error);
            }
        };
        initAudio();
        // Resume audio context on user interaction
        const resumeAudio = ()=>{
            if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume();
            }
        };
        document.addEventListener('click', resumeAudio);
        document.addEventListener('keydown', resumeAudio);
        return ()=>{
            document.removeEventListener('click', resumeAudio);
            document.removeEventListener('keydown', resumeAudio);
        };
    }, []);
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
            // Add slight fade in/out to prevent clicks
            const now = audioContextRef.current.currentTime;
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(volume, now + 0.01); // 10ms fade in
            gainNode.gain.setValueAtTime(volume, now + playDuration - 0.02);
            gainNode.gain.linearRampToValueAtTime(0, now + playDuration); // Fade out at end
            source.connect(gainNode);
            gainNode.connect(audioContextRef.current.destination);
            // Track when sound ends for peg sounds
            if (soundKey === 'peg') {
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
        const now = Date.now();
        const timeSinceLastSound = now - lastPegSoundTime.current;
        // Throttle: Only play if 30ms has passed AND we're not already playing too many
        if (timeSinceLastSound >= 30 && activePegSounds.current < MAX_CONCURRENT_PEG_SOUNDS) {
            lastPegSoundTime.current = now;
            // Calculate pitch based on peg Y position (lower pegs = lower pitch)
            // Pegs range from startY (top) to startY + (ROWS-1) * pegGapY (bottom)
            const totalPegHeight = (__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ROWS"] - 1) * 18; // pegGapY = 18
            const normalizedY = (pegY - startY) / totalPegHeight; // 0 at top, 1 at bottom
            const pitch = 1.0 - normalizedY * 0.4; // Range from 1.0 (high) to 0.6 (low)
            playSound('peg', 0.12, 0.08, pitch); // Reduced volume, cut to 80ms, variable pitch
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
    const dropY = startY - __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PEG_RADIUS"] - 1;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver((entries)=>{
            for (const entry of entries){
                const { width, height } = entry.contentRect;
                setDimensions({
                    width,
                    height
                });
            }
        });
        resizeObserver.observe(containerRef.current);
        return ()=>resizeObserver.disconnect();
    }, []);
    // Load background image
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const img = new Image();
        img.src = '/ui/Pulse Branding/Banner/Dark/minimal.png';
        img.onload = ()=>{
            setBackgroundLoaded(true);
            console.log('Background image loaded successfully');
        };
        img.onerror = ()=>{
            console.error('Failed to load background image');
        };
    }, []);
    // Load gradient image for peg hit effects
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const img = new Image();
        img.src = '/ui/Pulse Branding/Logo/gradient.png';
        img.onload = ()=>{
            cacheGradientData(img);
            setGradientImage(img);
            console.log('Gradient image loaded and cached successfully');
        };
        img.onerror = ()=>{
            console.error('Failed to load gradient image');
        };
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!canvasRef.current || dimensions.width === 0) return;
        const engine = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Engine.create({
            gravity: {
                x: 0,
                y: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].GRAVITY
            },
            positionIterations: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].ENGINE_ITERATIONS,
            velocityIterations: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].ENGINE_ITERATIONS
        });
        engineRef.current = engine;
        const render = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Render.create({
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
        for(let r = 0; r < __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ROWS"]; r++){
            const rowY = startY + r * pegGapY;
            const rowPegCount = r + 2;
            const rowWidth = (rowPegCount - 1) * pegGapX;
            const startX = boardOffsetX + (BOARD_WIDTH - rowWidth) / 2; // Center in fixed board
            for(let c = 0; c < rowPegCount; c++){
                const x = startX + c * pegGapX;
                pegs.push(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Bodies.circle(x, rowY, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PEG_RADIUS"], {
                    isStatic: true,
                    label: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CollisionLabel"].PEG,
                    restitution: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].PEG_RESTITUTION,
                    friction: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].PEG_FRICTION,
                    slop: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].SLOP,
                    render: {
                        fillStyle: 'transparent',
                        strokeStyle: 'transparent',
                        lineWidth: 0
                    }
                }));
            }
        }
        __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].World.add(engine.world, pegs);
        const bucketCount = 15;
        const bucketWidth = pegGapX; // Same spacing as pegs for consistent look
        const bucketsTotalWidth = bucketCount * bucketWidth; // No gaps between buckets
        const bucketsStartX = boardOffsetX + (BOARD_WIDTH - bucketsTotalWidth) / 2; // Center in fixed board
        const bucketBaseY = startY + (__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ROWS"] + 1) * pegGapY - 24;
        const bucketStepY = pegGapY * 0.4; // Adjusted spacing for smaller board
        for(let i = 0; i < bucketCount; i++){
            const x = bucketsStartX + i * bucketWidth + bucketWidth / 2; // Center of each bucket
            const sensor = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Bodies.rectangle(x, bucketBaseY + bucketStepY * 3.5, bucketWidth, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BUCKET_HEIGHT"] + 20, {
                isStatic: true,
                isSensor: true,
                label: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CollisionLabel"].BUCKET,
                plugin: {
                    index: i
                },
                render: {
                    fillStyle: 'transparent'
                }
            });
            __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].World.add(engine.world, sensor);
        }
        __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Events.on(engine, 'collisionStart', (event)=>{
            event.pairs.forEach((pair)=>{
                const { bodyA, bodyB } = pair;
                const ball = bodyA.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CollisionLabel"].BALL ? bodyA : bodyB.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CollisionLabel"].BALL ? bodyB : null;
                const peg = bodyA.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CollisionLabel"].PEG ? bodyA : bodyB.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CollisionLabel"].PEG ? bodyB : null;
                const bucket = bodyA.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CollisionLabel"].BUCKET ? bodyA : bodyB.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CollisionLabel"].BUCKET ? bodyB : null;
                if (ball && peg) {
                    // Track peg hit for animation
                    pegHits.current.set(peg.id, Date.now());
                    // Play peg hit sound with pitch based on Y position
                    playPegHitSound(peg.position.y);
                }
                if (ball && bucket && !ballsToRemove.current.has(ball)) {
                    const index = bucket.plugin.index;
                    const risk = ball.plugin.risk;
                    const multiplier = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MULTIPLIERS"][risk][index];
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
            });
        });
        // Draw background and elements "Behind" the balls
        __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Events.on(render, 'beforeRender', ()=>{
            const ctx = render.context;
            if (!ctx) return;
            const chuteX = boardOffsetX + BOARD_WIDTH / 2;
            const chuteY = dropY - 2; // Offset slightly for aesthetics
            ctx.save();
            // Outer rim
            ctx.beginPath();
            ctx.arc(chuteX, chuteY, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CHUTE_RADIUS"] + 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.fill();
            // Deep dark hole
            ctx.beginPath();
            ctx.arc(chuteX, chuteY, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CHUTE_RADIUS"], 0, Math.PI * 2);
            const grad = ctx.createRadialGradient(chuteX, chuteY, 0, chuteX, chuteY, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CHUTE_RADIUS"]);
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
        });
        __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Events.on(render, 'afterRender', ()=>{
            const ctx = render.context;
            if (!ctx) return;
            const now = Date.now();
            // Draw all pegs
            const pegs = engine.world.bodies.filter((body)=>body.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CollisionLabel"].PEG);
            // Draw non-hit pegs in batch for better performance
            ctx.fillStyle = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["COLORS"].PEG;
            pegs.forEach((peg)=>{
                if (!pegHits.current.has(peg.id)) {
                    ctx.beginPath();
                    ctx.arc(peg.position.x, peg.position.y, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PEG_RADIUS"], 0, Math.PI * 2);
                    ctx.fill();
                }
            });
            // Draw hit pegs with gradient animation
            pegs.forEach((peg)=>{
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
                ctx.fillStyle = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["COLORS"].PEG;
                ctx.beginPath();
                ctx.arc(peg.position.x, peg.position.y, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PEG_RADIUS"], 0, Math.PI * 2);
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
                        ctx.arc(peg.position.x, peg.position.y, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PEG_RADIUS"], 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                ctx.restore();
            });
            // Dividers
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            for(let i = 0; i <= bucketCount; i++){
                const x = bucketsStartX + i * bucketWidth;
                ctx.beginPath();
                ctx.moveTo(x, bucketBaseY - 10);
                ctx.lineTo(x, bucketBaseY + bucketStepY * 3 + __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BUCKET_HEIGHT"]);
                ctx.stroke();
            }
            // Bucket Multipliers Rendering
            const tiers = [
                'GREEN',
                'YELLOW',
                'RED'
            ];
            tiers.forEach((tier, tIdx)=>{
                const tierHeight = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BUCKET_HEIGHT"] + 8 + 0; // Bucket height + padding
                const yBase = bucketBaseY + tIdx * tierHeight;
                const mults = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MULTIPLIERS"][tier];
                const ballColor = tier === 'GREEN' ? __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["COLORS"].BALL_GREEN : tier === 'YELLOW' ? __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["COLORS"].BALL_YELLOW : __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["COLORS"].BALL_RED;
                mults.forEach((m, i)=>{
                    const x = bucketsStartX + i * bucketWidth + bucketWidth / 2; // Center of each bucket
                    const bW = bucketWidth - 2;
                    const bH = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BUCKET_HEIGHT"] + 8; // Taller for vertical text
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
                });
            });
            if (ballsToRemove.current.size > 0) {
                ballsToRemove.current.forEach((ball)=>__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].World.remove(engine.world, ball));
                ballsToRemove.current.clear();
            }
        });
        const runner = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Runner.create();
        __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Runner.run(runner, engine);
        __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Render.run(render);
        return ()=>{
            __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Render.stop(render);
            __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Runner.stop(runner);
            __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Engine.clear(engine);
        };
    }, [
        dimensions
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!lastDrop || !engineRef.current) return;
        const risk = lastDrop.risk;
        const ballColor = risk === 'GREEN' ? __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["COLORS"].BALL_GREEN : risk === 'YELLOW' ? __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["COLORS"].BALL_YELLOW : __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["COLORS"].BALL_RED;
        // Spawn centered within the fixed board with narrow spread
        const spawnX = boardOffsetX + BOARD_WIDTH / 2 + (Math.random() * __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].SPAWN_RANGE_X - __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].SPAWN_RANGE_X / 2);
        const initialVelX = (Math.random() - 0.5) * __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].INITIAL_V_X_VARIANCE;
        const ball = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Bodies.circle(spawnX, dropY, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BALL_RADIUS"], {
            restitution: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].BALL_RESTITUTION,
            friction: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].BALL_FRICTION,
            frictionStatic: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].BALL_FRICTION_STATIC,
            frictionAir: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].BALL_FRICTION_AIR,
            density: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].BALL_DENSITY,
            label: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CollisionLabel"].BALL,
            slop: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].SLOP,
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
        __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Body.setVelocity(ball, {
            x: initialVelX,
            y: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].INITIAL_V_Y
        });
        __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].World.add(engineRef.current.world, ball);
    }, [
        lastDrop
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: containerRef,
        className: "w-full h-full relative",
        style: {
            backgroundImage: backgroundLoaded ? `url('/ui/Pulse Branding/Banner/Dark/minimal.png')` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("canvas", {
            ref: canvasRef
        }, void 0, false, {
            fileName: "[project]/PLINKO/components/PlinkoGame.tsx",
            lineNumber: 570,
            columnNumber: 7
        }, ("TURBOPACK compile-time value", void 0))
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/PlinkoGame.tsx",
        lineNumber: 560,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
const __TURBOPACK__default__export__ = PlinkoGame;
}),
"[project]/PLINKO/app/page.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$PlinkoGame$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/PlinkoGame.tsx [app-ssr] (ecmascript)");
'use client';
;
;
;
const Home = ()=>{
    const [gameState, setGameState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        balance: 755.37,
        ballCount: 0
    });
    const [wager, setWager] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0.30);
    const [lastDrop, setLastDrop] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [history, setHistory] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [isAutoDrop, setIsAutoDrop] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [showAutoDropModal, setShowAutoDropModal] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [autoDropSettings, setAutoDropSettings] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        ballCount: 10,
        riskLevel: 'GREEN',
        customBallCount: ''
    });
    const [remainingBalls, setRemainingBalls] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [backgroundIndex, setBackgroundIndex] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const lastRiskRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])('GREEN');
    // Background images array
    const backgrounds = [
        '/ui/bg1.jpg',
        '/ui/bg2.jpg',
        '/ui/bg3.jpg',
        '/ui/bg4.jpg'
    ];
    // Cycle through backgrounds every 8 seconds
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const interval = setInterval(()=>{
            setBackgroundIndex((prev)=>(prev + 1) % backgrounds.length);
        }, 8000);
        return ()=>clearInterval(interval);
    }, [
        backgrounds.length
    ]);
    const handleScore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((multiplier)=>{
        setGameState((prev)=>({
                ...prev,
                balance: prev.balance + wager * multiplier
            }));
        setHistory((prev)=>[
                {
                    id: Date.now(),
                    multiplier,
                    risk: lastRiskRef.current
                },
                ...prev
            ].slice(0, 15));
    }, [
        wager
    ]);
    const dropBall = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((risk)=>{
        setGameState((prev)=>{
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
        });
    }, [
        wager
    ]);
    // Auto Drop Logic
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        let interval = null;
        if (isAutoDrop && remainingBalls > 0) {
            interval = window.setInterval(()=>{
                dropBall(autoDropSettings.riskLevel);
                setRemainingBalls((prev)=>{
                    const newCount = prev - 1;
                    if (newCount <= 0) {
                        setIsAutoDrop(false);
                        setRemainingBalls(0);
                    }
                    return newCount;
                });
            }, 1000); // Fixed 1 second interval
        }
        return ()=>{
            if (interval) clearInterval(interval);
        };
    }, [
        isAutoDrop,
        dropBall,
        remainingBalls,
        autoDropSettings.riskLevel
    ]);
    const adjustWager = (amount)=>{
        setWager((prev)=>Math.max(0.1, +(prev + amount).toFixed(2)));
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-col h-screen w-full overflow-hidden bg-white transition-all duration-1000",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                className: "flex justify-between items-center px-4 py-3 z-30 bg-black/5 backdrop-blur-sm border-b border-black/20",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2 max-w-[60%] overflow-hidden",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex gap-1 overflow-x-auto no-scrollbar scroll-smooth",
                            children: history.length > 0 ? history.map((item, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                                    lineNumber: 115,
                                    columnNumber: 15
                                }, ("TURBOPACK compile-time value", void 0))) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-[10px] text-black/50 font-bold uppercase tracking-widest px-1 italic",
                                children: "Waiting for results..."
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/app/page.tsx",
                                lineNumber: 126,
                                columnNumber: 15
                            }, ("TURBOPACK compile-time value", void 0))
                        }, void 0, false, {
                            fileName: "[project]/PLINKO/app/page.tsx",
                            lineNumber: 113,
                            columnNumber: 11
                        }, ("TURBOPACK compile-time value", void 0))
                    }, void 0, false, {
                        fileName: "[project]/PLINKO/app/page.tsx",
                        lineNumber: 112,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2 bg-black/10 px-4 py-1.5 rounded-xl border border-black/20 shadow-inner hover:bg-black/15 transition-colors duration-200",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-black font-black text-sm tracking-tight",
                                children: gameState.balance.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                })
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/app/page.tsx",
                                lineNumber: 133,
                                columnNumber: 11
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-black/80 text-[8px] font-black",
                                children: "USD"
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/app/page.tsx",
                                lineNumber: 136,
                                columnNumber: 11
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/PLINKO/app/page.tsx",
                        lineNumber: 132,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/PLINKO/app/page.tsx",
                lineNumber: 110,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                className: "flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-6 p-4 lg:p-6 overflow-hidden",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "order-1 lg:order-1 w-full h-full flex justify-center items-center bg-black/5 rounded-2xl border border-black/10 shadow-inner",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$PlinkoGame$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            onScore: handleScore,
                            lastDrop: lastDrop
                        }, void 0, false, {
                            fileName: "[project]/PLINKO/app/page.tsx",
                            lineNumber: 144,
                            columnNumber: 11
                        }, ("TURBOPACK compile-time value", void 0))
                    }, void 0, false, {
                        fileName: "[project]/PLINKO/app/page.tsx",
                        lineNumber: 143,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "order-2 lg:order-2 space-y-6",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex flex-col gap-4",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "bg-black/5 rounded-2xl p-3 border border-black/10 shadow-inner hover:bg-black/10 transition-colors duration-200",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "grid grid-cols-3 gap-3 items-center",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex flex-col items-start",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-black/70 text-[8px] font-black uppercase tracking-tighter",
                                                        children: "Wager USD"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/app/page.tsx",
                                                        lineNumber: 158,
                                                        columnNumber: 19
                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-black font-mono font-bold text-base",
                                                        children: wager.toFixed(2)
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/app/page.tsx",
                                                        lineNumber: 159,
                                                        columnNumber: 19
                                                    }, ("TURBOPACK compile-time value", void 0))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 157,
                                                columnNumber: 17
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex flex-col gap-1",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>setWager(Math.max(0.1, wager / 2)),
                                                        className: "w-full h-6 rounded-lg bg-black/10 backdrop-blur-sm flex items-center justify-center text-black border border-black/20 hover:bg-black/20 hover:border-black/30 active:scale-95 transition-all duration-200 text-[9px] font-bold shadow-md",
                                                        children: "½"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/app/page.tsx",
                                                        lineNumber: 166,
                                                        columnNumber: 19
                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>setWager(wager * 2),
                                                        className: "w-full h-6 rounded-lg bg-black/10 backdrop-blur-sm flex items-center justify-center text-black border border-black/20 hover:bg-black/20 hover:border-black/30 active:scale-95 transition-all duration-200 text-[9px] font-bold shadow-md",
                                                        children: "2×"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/app/page.tsx",
                                                        lineNumber: 172,
                                                        columnNumber: 19
                                                    }, ("TURBOPACK compile-time value", void 0))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 165,
                                                columnNumber: 17
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex flex-col gap-2",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex items-center gap-1 justify-center",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                onClick: ()=>adjustWager(-0.1),
                                                                className: "w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-black border border-black/20 hover:bg-black/10 hover:border-black/30 active:scale-90 transition-all duration-200 text-sm",
                                                                children: "-"
                                                            }, void 0, false, {
                                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                                lineNumber: 184,
                                                                columnNumber: 21
                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                onClick: ()=>adjustWager(0.1),
                                                                className: "w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-black border border-black/20 hover:bg-black/10 hover:border-black/30 active:scale-90 transition-all duration-200 text-sm",
                                                                children: "+"
                                                            }, void 0, false, {
                                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                                lineNumber: 185,
                                                                columnNumber: 21
                                                            }, ("TURBOPACK compile-time value", void 0))
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/PLINKO/app/page.tsx",
                                                        lineNumber: 183,
                                                        columnNumber: 19
                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>{
                                                            if (isAutoDrop) {
                                                                setIsAutoDrop(false);
                                                                setRemainingBalls(0);
                                                            } else {
                                                                setShowAutoDropModal(true);
                                                            }
                                                        },
                                                        className: `w-full h-8 rounded-lg transition-all duration-200 border backdrop-blur-sm shadow-md hover:shadow-lg relative overflow-hidden text-[8px] font-bold ${isAutoDrop ? 'bg-black/20 border-black/40 text-black shadow-black/10 laser-border' : 'bg-black/10 border-black/20 text-black/70 hover:text-black hover:bg-black/15'}`,
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "uppercase tracking-widest",
                                                            children: isAutoDrop ? `${remainingBalls}` : 'Auto'
                                                        }, void 0, false, {
                                                            fileName: "[project]/PLINKO/app/page.tsx",
                                                            lineNumber: 204,
                                                            columnNumber: 21
                                                        }, ("TURBOPACK compile-time value", void 0))
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/app/page.tsx",
                                                        lineNumber: 189,
                                                        columnNumber: 19
                                                    }, ("TURBOPACK compile-time value", void 0))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 181,
                                                columnNumber: 17
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 155,
                                        columnNumber: 15
                                    }, ("TURBOPACK compile-time value", void 0))
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 154,
                                    columnNumber: 13
                                }, ("TURBOPACK compile-time value", void 0)),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex gap-2 flex-1",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>dropBall('GREEN'),
                                            className: "bg-black/10 hover:bg-black/20 active:scale-95 transition-all duration-200 text-black font-black py-3 rounded-xl text-[10px] tracking-widest shadow-lg hover:shadow-xl border border-black/20 uppercase flex-1",
                                            children: "Low"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/app/page.tsx",
                                            lineNumber: 214,
                                            columnNumber: 15
                                        }, ("TURBOPACK compile-time value", void 0)),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>dropBall('YELLOW'),
                                            className: "bg-black/15 hover:bg-black/25 active:scale-95 transition-all duration-200 text-black font-black py-3 rounded-xl text-[10px] tracking-widest shadow-lg hover:shadow-xl border border-black/20 uppercase flex-1",
                                            children: "Medium"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/app/page.tsx",
                                            lineNumber: 220,
                                            columnNumber: 15
                                        }, ("TURBOPACK compile-time value", void 0)),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>dropBall('RED'),
                                            className: "bg-black/20 hover:bg-black/30 active:scale-95 transition-all duration-200 text-black font-black py-3 rounded-xl text-[10px] tracking-widest shadow-lg hover:shadow-xl border border-black/20 uppercase flex-1",
                                            children: "High"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/app/page.tsx",
                                            lineNumber: 226,
                                            columnNumber: 15
                                        }, ("TURBOPACK compile-time value", void 0))
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 213,
                                    columnNumber: 13
                                }, ("TURBOPACK compile-time value", void 0))
                            ]
                        }, void 0, true, {
                            fileName: "[project]/PLINKO/app/page.tsx",
                            lineNumber: 152,
                            columnNumber: 11
                        }, ("TURBOPACK compile-time value", void 0))
                    }, void 0, false, {
                        fileName: "[project]/PLINKO/app/page.tsx",
                        lineNumber: 151,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/PLINKO/app/page.tsx",
                lineNumber: 141,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            showAutoDropModal && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                            className: "text-xl font-bold text-black mb-6 text-center",
                            children: "Auto Drop Settings"
                        }, void 0, false, {
                            fileName: "[project]/PLINKO/app/page.tsx",
                            lineNumber: 241,
                            columnNumber: 13
                        }, ("TURBOPACK compile-time value", void 0)),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mb-6",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "block text-sm font-semibold text-black/80 mb-3",
                                    children: "Number of Balls"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 245,
                                    columnNumber: 15
                                }, ("TURBOPACK compile-time value", void 0)),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "grid grid-cols-3 gap-2 mb-3",
                                    children: [
                                        5,
                                        10,
                                        20
                                    ].map((count)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>setAutoDropSettings((prev)=>({
                                                        ...prev,
                                                        ballCount: count,
                                                        customBallCount: ''
                                                    })),
                                            className: `py-2 px-3 rounded-lg text-sm font-bold transition-all ${autoDropSettings.ballCount === count && autoDropSettings.customBallCount === '' ? 'bg-black text-white' : 'bg-black/10 text-black hover:bg-black/20'}`,
                                            children: count
                                        }, count, false, {
                                            fileName: "[project]/PLINKO/app/page.tsx",
                                            lineNumber: 248,
                                            columnNumber: 19
                                        }, ("TURBOPACK compile-time value", void 0)))
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 246,
                                    columnNumber: 15
                                }, ("TURBOPACK compile-time value", void 0)),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "grid grid-cols-2 gap-2",
                                    children: [
                                        [
                                            50,
                                            100
                                        ].map((count)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>setAutoDropSettings((prev)=>({
                                                            ...prev,
                                                            ballCount: count,
                                                            customBallCount: ''
                                                        })),
                                                className: `py-2 px-3 rounded-lg text-sm font-bold transition-all ${autoDropSettings.ballCount === count && autoDropSettings.customBallCount === '' ? 'bg-black text-white' : 'bg-black/10 text-black hover:bg-black/20'}`,
                                                children: count
                                            }, count, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 263,
                                                columnNumber: 19
                                            }, ("TURBOPACK compile-time value", void 0))),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
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
                                            lineNumber: 275,
                                            columnNumber: 17
                                        }, ("TURBOPACK compile-time value", void 0))
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 261,
                                    columnNumber: 15
                                }, ("TURBOPACK compile-time value", void 0))
                            ]
                        }, void 0, true, {
                            fileName: "[project]/PLINKO/app/page.tsx",
                            lineNumber: 244,
                            columnNumber: 13
                        }, ("TURBOPACK compile-time value", void 0)),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mb-8",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                    className: "block text-sm font-semibold text-black/80 mb-3",
                                    children: "Risk Level"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 297,
                                    columnNumber: 15
                                }, ("TURBOPACK compile-time value", void 0)),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                                    ].map(({ key, label, desc })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>setAutoDropSettings((prev)=>({
                                                        ...prev,
                                                        riskLevel: key
                                                    })),
                                            className: `w-full p-3 rounded-lg text-left transition-all ${autoDropSettings.riskLevel === key ? 'bg-black text-white' : 'bg-black/10 text-black hover:bg-black/20'}`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "font-bold text-sm",
                                                    children: label
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/app/page.tsx",
                                                    lineNumber: 313,
                                                    columnNumber: 21
                                                }, ("TURBOPACK compile-time value", void 0)),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: `text-xs ${autoDropSettings.riskLevel === key ? 'text-white/80' : 'text-black/60'}`,
                                                    children: desc
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/app/page.tsx",
                                                    lineNumber: 314,
                                                    columnNumber: 21
                                                }, ("TURBOPACK compile-time value", void 0))
                                            ]
                                        }, key, true, {
                                            fileName: "[project]/PLINKO/app/page.tsx",
                                            lineNumber: 304,
                                            columnNumber: 19
                                        }, ("TURBOPACK compile-time value", void 0)))
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 298,
                                    columnNumber: 15
                                }, ("TURBOPACK compile-time value", void 0))
                            ]
                        }, void 0, true, {
                            fileName: "[project]/PLINKO/app/page.tsx",
                            lineNumber: 296,
                            columnNumber: 13
                        }, ("TURBOPACK compile-time value", void 0)),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex gap-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    onClick: ()=>setShowAutoDropModal(false),
                                    className: "flex-1 py-3 px-4 bg-black/10 text-black font-bold rounded-lg hover:bg-black/20 transition-all",
                                    children: "Cancel"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 324,
                                    columnNumber: 15
                                }, ("TURBOPACK compile-time value", void 0)),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                                    lineNumber: 330,
                                    columnNumber: 15
                                }, ("TURBOPACK compile-time value", void 0))
                            ]
                        }, void 0, true, {
                            fileName: "[project]/PLINKO/app/page.tsx",
                            lineNumber: 323,
                            columnNumber: 13
                        }, ("TURBOPACK compile-time value", void 0))
                    ]
                }, void 0, true, {
                    fileName: "[project]/PLINKO/app/page.tsx",
                    lineNumber: 240,
                    columnNumber: 11
                }, ("TURBOPACK compile-time value", void 0))
            }, void 0, false, {
                fileName: "[project]/PLINKO/app/page.tsx",
                lineNumber: 239,
                columnNumber: 9
            }, ("TURBOPACK compile-time value", void 0))
        ]
    }, void 0, true, {
        fileName: "[project]/PLINKO/app/page.tsx",
        lineNumber: 106,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
const __TURBOPACK__default__export__ = Home;
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__315c1cae._.js.map