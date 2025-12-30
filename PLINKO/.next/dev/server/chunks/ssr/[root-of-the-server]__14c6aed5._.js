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
const PEG_RADIUS = 3;
const BALL_RADIUS = 5;
const ROWS = 15;
const BUCKET_HEIGHT = 15;
const CHUTE_RADIUS = 6;
const COLORS = {
    PEG: 'rgb(2, 19, 34)',
    GREEN: 'rgb(22, 102, 6)',
    YELLOW: 'rgb(246, 242, 16)',
    RED: 'rgb(255, 0, 0)',
    BG_START: 'rgb(6, 19, 22)',
    BG_END: 'rgb(0, 191, 165)',
    UI_ACCENT: 'rgb(87, 250, 37)',
    UI_PANEL: 'rgb(5, 50, 57)',
    BALL_GREEN: 'rgb(16, 136, 8)',
    BALL_YELLOW: 'rgb(255, 238, 0)',
    BALL_RED: 'rgb(239, 27, 27)'
};
const PHYSICS = {
    GRAVITY: 1,
    ENGINE_ITERATIONS: 9,
    BALL_DENSITY: 0.5,
    BALL_RESTITUTION: 1.1,
    BALL_FRICTION: 0.5,
    BALL_FRICTION_STATIC: 0.05,
    BALL_FRICTION_AIR: 0.05,
    PEG_RESTITUTION: 2,
    PEG_FRICTION: 0,
    SPAWN_RANGE_X: 2,
    INITIAL_V_X_VARIANCE: 0.8,
    INITIAL_V_Y: 0,
    COLLISION_JITTER: 1.5,
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
// Collision categories to prevent ball-ball interactions (like online Plinko games)
const COLLISION_CATEGORIES = {
    BALL: 0x0001,
    PEG: 0x0002,
    BUCKET: 0x0004,
    WALL: 0x0008 // Category for walls (if any)
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
    // Dynamic board dimensions that scale with available space
    const BOARD_HEIGHT = Math.max(300, Math.min(dimensions.height * 0.9, dimensions.width * 1.2)); // 90% of height or proportional to width, increased initial size
    const BOARD_WIDTH = BOARD_HEIGHT; // Keep square aspect ratio
    const BOARD_START_Y = 0; // Adjusted starting position
    // Dynamic ball and peg sizes that scale with board (accounting for additional scaleFactor)
    const PEG_RADIUS = Math.max(1.5, Math.min(BOARD_WIDTH * 0.006, 1.0)); // 0.6% of board width, min 1.5, max 2.0 (scales to max 3px)
    const BALL_RADIUS = Math.max(3, Math.min(BOARD_WIDTH * 0.010, 3.0)); // 1.0% of board width, min 3, max 4.0 (scales to max 6px)
    // Store scaled values for use in other effects
    const scaledValuesRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])({
        ballRadius: BALL_RADIUS,
        pegRadius: PEG_RADIUS,
        chuteRadius: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CHUTE_RADIUS"],
        boardOffsetX: 0,
        boardWidth: 0,
        dropY: 0
    });
    // Sound effects with Web Audio API for smooth playback
    const audioContextRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const audioBuffers = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    // Initialize Web Audio API context and preload sounds
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const initAudio = async ()=>{
            try {
                // Create audio context
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
                // Load and decode audio files
                const loadAudio = async (url, key)=>{
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
                };
                await Promise.all([
                    loadAudio('/ui/sounds/positive.wav', 'bucket'),
                    loadAudio('/ui/sounds/nagative.wav', 'negative'),
                    loadAudio('/ui/sounds/drop.wav', 'drop')
                ]);
                console.log('Audio loading complete. Loaded buffers:', Array.from(audioBuffers.current.keys()));
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
                else if (soundKey === 'negative') audioPath = '/ui/sounds/nagative.wav';
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
    // Center the board in the available space, moved down by 300px
    const boardOffsetX = Math.max(0, (dimensions.width - BOARD_WIDTH) / 2);
    const boardOffsetY = Math.max(10, (dimensions.height - BOARD_HEIGHT) / 2) + 100;
    const startY = BOARD_START_Y + boardOffsetY;
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
    // Update scaled values when dimensions change
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        scaledValuesRef.current = {
            ballRadius: BALL_RADIUS,
            pegRadius: PEG_RADIUS,
            chuteRadius: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CHUTE_RADIUS"],
            boardOffsetX: Math.max(0, (dimensions.width - BOARD_WIDTH) / 2),
            boardWidth: BOARD_WIDTH,
            dropY: BOARD_START_Y - PEG_RADIUS - 1
        };
    }, [
        dimensions,
        BALL_RADIUS,
        PEG_RADIUS,
        BOARD_WIDTH
    ]);
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
        // Dynamic peg spacing that scales with board size
        const pegGapX = BOARD_WIDTH / 21.66; // Proportional horizontal spacing (24/260 ratio)
        const pegGapY = BOARD_HEIGHT / 28.88; // Proportional vertical spacing (18/260 ratio)
        // Scale radii proportionally with board size (base reference: 260px board)
        const scaleFactor = BOARD_HEIGHT / 260;
        const scaledPegRadius = PEG_RADIUS * scaleFactor;
        const scaledBallRadius = BALL_RADIUS * scaleFactor;
        const scaledChuteRadius = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CHUTE_RADIUS"] * scaleFactor;
        // Discs fall from above the top row (considering scaled peg radius)
        const dropY = startY - scaledPegRadius - 1;
        // Store scaled values in ref for use in other effects
        scaledValuesRef.current = {
            ballRadius: scaledBallRadius,
            pegRadius: scaledPegRadius,
            chuteRadius: scaledChuteRadius,
            boardOffsetX,
            boardWidth: BOARD_WIDTH,
            dropY
        };
        const pegs = [];
        for(let r = 0; r < __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ROWS"]; r++){
            const rowY = startY + r * pegGapY;
            const rowPegCount = r + 2;
            const rowWidth = (rowPegCount - 1) * pegGapX;
            const startX = boardOffsetX + (BOARD_WIDTH - rowWidth) / 2; // Center in fixed board
            for(let c = 0; c < rowPegCount; c++){
                const x = startX + c * pegGapX;
                pegs.push(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Bodies.circle(x, rowY, scaledPegRadius, {
                    isStatic: true,
                    label: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CollisionLabel"].PEG,
                    restitution: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].PEG_RESTITUTION,
                    friction: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].PEG_FRICTION,
                    slop: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].SLOP,
                    collisionFilter: {
                        category: COLLISION_CATEGORIES.PEG,
                        mask: COLLISION_CATEGORIES.BALL // Pegs only collide with balls
                    },
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
        const bucketsTotalWidth = bucketCount * bucketWidth;
        const bucketsStartX = boardOffsetX + (BOARD_WIDTH - bucketsTotalWidth) / 2;
        const bucketBaseY = startY + (__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ROWS"] + 1) * pegGapY - BOARD_HEIGHT / 28.88; // Scaled offset (24/260 ratio)
        // Create 3 rows of bucket sensors (one for each risk tier)
        const tiers = [
            'GREEN',
            'YELLOW',
            'RED'
        ];
        const tierHeight = BOARD_HEIGHT / 28.88; // Scaled bucket height (18/260 ratio)
        const tierGap = BOARD_HEIGHT / 130; // Scaled gap (2/260 ratio)
        tiers.forEach((tier, tierIdx)=>{
            const tierY = bucketBaseY + tierIdx * (tierHeight + tierGap);
            for(let i = 0; i < bucketCount; i++){
                const x = bucketsStartX + i * bucketWidth + bucketWidth / 2;
                const sensor = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Bodies.rectangle(x, tierY + tierHeight / 2, bucketWidth, tierHeight, {
                    isStatic: true,
                    isSensor: true,
                    label: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CollisionLabel"].BUCKET,
                    plugin: {
                        index: i,
                        tier: tier
                    },
                    collisionFilter: {
                        category: COLLISION_CATEGORIES.BUCKET,
                        mask: COLLISION_CATEGORIES.BALL // Buckets only collide with balls
                    },
                    render: {
                        fillStyle: 'transparent'
                    }
                });
                __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].World.add(engine.world, sensor);
            }
        });
        __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Events.on(engine, 'collisionStart', (event)=>{
            event.pairs.forEach((pair)=>{
                const { bodyA, bodyB } = pair;
                const ball = bodyA.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CollisionLabel"].BALL ? bodyA : bodyB.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CollisionLabel"].BALL ? bodyB : null;
                const peg = bodyA.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CollisionLabel"].PEG ? bodyA : bodyB.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CollisionLabel"].PEG ? bodyB : null;
                const bucket = bodyA.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CollisionLabel"].BUCKET ? bodyA : bodyB.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CollisionLabel"].BUCKET ? bodyB : null;
                if (ball && peg) {
                    // Track peg hit for animation - only if not already animating
                    const existingHitTime = pegHits.current.get(peg.id);
                    if (!existingHitTime) {
                        // First hit - start animation
                        pegHits.current.set(peg.id, Date.now());
                    }
                // Don't restart animation if peg is already glowing
                }
                if (ball && bucket && !ballsToRemove.current.has(ball)) {
                    const index = bucket.plugin.index;
                    const tier = bucket.plugin.tier; // Get tier from bucket sensor
                    const multiplier = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MULTIPLIERS"][tier][index];
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
            ctx.arc(chuteX, chuteY, scaledChuteRadius + 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fill();
            // Deep dark hole
            ctx.beginPath();
            ctx.arc(chuteX, chuteY, scaledChuteRadius, 0, Math.PI * 2);
            const grad = ctx.createRadialGradient(chuteX, chuteY, 0, chuteX, chuteY, scaledChuteRadius);
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
            // First pass: Clean up expired peg hits BEFORE drawing
            pegHits.current.forEach((hitTime, pegId)=>{
                const elapsed = now - hitTime;
                if (elapsed >= 2900) {
                    pegHits.current.delete(pegId);
                }
            });
            // Draw non-hit pegs in batch for better performance
            pegs.forEach((peg)=>{
                if (!pegHits.current.has(peg.id)) {
                    ctx.save();
                    // Add shadow for depth
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.76)';
                    ctx.shadowBlur = 4 * scaleFactor;
                    ctx.shadowOffsetX = 1 * scaleFactor;
                    ctx.shadowOffsetY = 1 * scaleFactor;
                    // Draw white peg
                    ctx.fillStyle = '#FFFFFF';
                    ctx.beginPath();
                    ctx.arc(peg.position.x, peg.position.y, scaledPegRadius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            });
            // Draw hit pegs with white glow animation
            pegs.forEach((peg)=>{
                const hitTime = pegHits.current.get(peg.id);
                if (!hitTime) return;
                const elapsed = now - hitTime;
                ctx.save();
                // Add shadow for depth
                ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
                ctx.shadowBlur = 4 * scaleFactor;
                ctx.shadowOffsetX = 1 * scaleFactor;
                ctx.shadowOffsetY = 1 * scaleFactor;
                // Draw base peg with white color
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.arc(peg.position.x, peg.position.y, scaledPegRadius, 0, Math.PI * 2);
                ctx.fill();
                // Reset shadow for glow
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                // Draw simple white glow with fade in/out
                // Calculate opacity with short fade in (150ms) and long fade out
                let glowOpacity = 0;
                if (elapsed < 150) {
                    // Quick fade in
                    glowOpacity = elapsed / 150;
                } else if (elapsed < 400) {
                    // Full opacity in the middle
                    glowOpacity = 1.0;
                } else if (elapsed < 2900) {
                    // Long fade out (2500ms)
                    glowOpacity = 1.0 - (elapsed - 400) / 2500;
                }
                // Clamp opacity to valid range
                glowOpacity = Math.max(0, Math.min(1, glowOpacity));
                // Apply white glow with opacity (only if visible)
                if (glowOpacity > 0.01) {
                    // Draw outer glow
                    ctx.shadowColor = `rgba(255, 255, 255, ${glowOpacity * 0.8})`;
                    ctx.shadowBlur = 1 * glowOpacity * scaleFactor;
                    ctx.fillStyle = `rgba(255, 255, 255, ${glowOpacity * 0.2})`;
                    ctx.beginPath();
                    ctx.arc(peg.position.x, peg.position.y, scaledPegRadius + 2 * scaleFactor, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            });
            // Draw balls with gradient fills
            const balls = engine.world.bodies.filter((body)=>body.label === __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CollisionLabel"].BALL);
            balls.forEach((ball)=>{
                ctx.save();
                // Create radial gradient for ball fill
                const gradient = ctx.createRadialGradient(ball.position.x - scaledBallRadius * 0.3, ball.position.y - scaledBallRadius * 0.3, 0, ball.position.x, ball.position.y, scaledBallRadius);
                // Get ball color and create gradient
                const ballColor = ball.plugin.risk === 'GREEN' ? __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["COLORS"].BALL_GREEN : ball.plugin.risk === 'YELLOW' ? __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["COLORS"].BALL_YELLOW : __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["COLORS"].BALL_RED;
                // Parse RGB values from ball color
                const rgbMatch = ballColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                if (rgbMatch) {
                    const [_, r, g, b] = rgbMatch;
                    // Create gradient: center (lighter), middle, edge (darker)
                    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.9)`); // Center - bright
                    gradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.7)`); // Middle
                    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.4)`); // Edge - darker
                }
                // Fill ball with gradient
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(ball.position.x, ball.position.y, scaledBallRadius, 0, Math.PI * 2);
                ctx.fill();
                // Add subtle stroke for definition
                ctx.strokeStyle = ballColor;
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.restore();
            });
            // Bucket Multipliers Rendering - Professional Clean Layout
            const tiers = [
                'GREEN',
                'YELLOW',
                'RED'
            ];
            const tierColors = {
                GREEN: {
                    normal: 'rgb(140, 185, 60)',
                    dark: 'rgb(130, 140, 45)'
                },
                YELLOW: {
                    normal: 'rgb(255, 240, 60)',
                    dark: 'rgb(200, 190, 30)'
                },
                RED: {
                    normal: 'rgb(210, 50, 50)',
                    dark: 'rgb(160, 35, 35)'
                }
            };
            tiers.forEach((tier, tIdx)=>{
                const tierHeight = BOARD_HEIGHT / 28.88; // Scaled bucket height
                const tierGap = BOARD_HEIGHT / 130; // Scaled gap
                const yBase = bucketBaseY + tIdx * (tierHeight + tierGap);
                const mults = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MULTIPLIERS"][tier];
                const tierColor = tierColors[tier];
                mults.forEach((m, i)=>{
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
                        ctx.shadowBlur = 1 * glowIntensity;
                        ctx.shadowColor = `rgba(255, 255, 255, ${glowIntensity * 0.8})`;
                    }
                    // Draw bucket - sharp corners, no rounding
                    ctx.fillStyle = bgColor;
                    ctx.fillRect(x - offsetX, yBase - offsetY, finalBW, finalBH);
                    // Draw multiplier text - clean and simple
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = '#000000'; // Black text for maximum legibility
                    ctx.font = `bold ${Math.min(9, bW / 2.5) * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(m.toString(), x + bW / 2, yBase + bH / 2);
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
        // Use scaled values from ref
        const { ballRadius, boardOffsetX, boardWidth, dropY } = scaledValuesRef.current;
        // Spawn centered within the fixed board with narrow spread
        const spawnX = boardOffsetX + boardWidth / 2 + (Math.random() * __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].SPAWN_RANGE_X - __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].SPAWN_RANGE_X / 2);
        const initialVelX = (Math.random() - 0.5) * __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].INITIAL_V_X_VARIANCE;
        const ball = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Bodies.circle(spawnX, dropY, ballRadius, {
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
            collisionFilter: {
                category: COLLISION_CATEGORIES.BALL,
                mask: COLLISION_CATEGORIES.PEG | COLLISION_CATEGORIES.BUCKET // Balls don't collide with other balls
            },
            render: {
                visible: false // We'll draw balls manually with gradients
            }
        });
        // Give them a downward velocity so they don't just sit on the top peg
        __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Body.setVelocity(ball, {
            x: initialVelX,
            y: __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PHYSICS"].INITIAL_V_Y
        });
        __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$matter$2d$js$2f$build$2f$matter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].World.add(engineRef.current.world, ball);
        // Play drop sound when ball is released
        playDropSound();
    }, [
        lastDrop
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: containerRef,
        className: "w-full h-full relative",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("canvas", {
            ref: canvasRef
        }, void 0, false, {
            fileName: "[project]/PLINKO/components/PlinkoGame.tsx",
            lineNumber: 669,
            columnNumber: 7
        }, ("TURBOPACK compile-time value", void 0))
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/PlinkoGame.tsx",
        lineNumber: 665,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
const __TURBOPACK__default__export__ = PlinkoGame;
}),
"[project]/PLINKO/lib/utils.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "cn",
    ()=>cn
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$clsx$2f$dist$2f$clsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/clsx/dist/clsx.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/tailwind-merge/dist/bundle-mjs.mjs [app-ssr] (ecmascript)");
;
;
function cn(...inputs) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["twMerge"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$clsx$2f$dist$2f$clsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["clsx"])(inputs));
}
}),
"[project]/PLINKO/components/ui/button.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Button",
    ()=>Button,
    "buttonVariants",
    ()=>buttonVariants
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/@radix-ui/react-slot/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/class-variance-authority/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/lib/utils.ts [app-ssr] (ecmascript)");
;
;
;
;
;
const buttonVariants = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cva"])("inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50", {
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
const Button = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"](({ className, variant, size, asChild = false, ...props }, ref)=>{
    const Comp = asChild ? __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Slot"] : "button";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Comp, {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])(buttonVariants({
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
Button.displayName = "Button";
;
}),
"[project]/PLINKO/components/ui/dialog.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/@radix-ui/react-dialog/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/lucide-react/dist/esm/icons/x.js [app-ssr] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/lib/utils.ts [app-ssr] (ecmascript)");
;
;
;
;
;
const Dialog = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Root"];
const DialogTrigger = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Trigger"];
const DialogPortal = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Portal"];
const DialogClose = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Close"];
const DialogOverlay = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"](({ className, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Overlay"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/dialog.tsx",
        lineNumber: 19,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
DialogOverlay.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Overlay"].displayName;
const DialogContent = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"](({ className, children, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(DialogPortal, {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(DialogOverlay, {}, void 0, false, {
                fileName: "[project]/PLINKO/components/ui/dialog.tsx",
                lineNumber: 35,
                columnNumber: 5
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Content"], {
                ref: ref,
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-lg", className),
                ...props,
                children: [
                    children,
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Close"], {
                        className: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                className: "h-4 w-4"
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/components/ui/dialog.tsx",
                                lineNumber: 46,
                                columnNumber: 9
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
DialogContent.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Content"].displayName;
const DialogHeader = ({ className, ...props })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex flex-col space-y-1.5 text-center sm:text-left", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/dialog.tsx",
        lineNumber: 58,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0));
DialogHeader.displayName = "DialogHeader";
const DialogFooter = ({ className, ...props })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/dialog.tsx",
        lineNumber: 72,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0));
DialogFooter.displayName = "DialogFooter";
const DialogTitle = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"](({ className, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Title"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("text-lg font-semibold leading-none tracking-tight", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/dialog.tsx",
        lineNumber: 86,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
DialogTitle.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Title"].displayName;
const DialogDescription = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"](({ className, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Description"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("text-sm text-muted-foreground", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/dialog.tsx",
        lineNumber: 101,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
DialogDescription.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Description"].displayName;
;
}),
"[project]/PLINKO/components/ui/tabs.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/@radix-ui/react-tabs/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/lib/utils.ts [app-ssr] (ecmascript)");
;
;
;
;
const Tabs = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Root"];
const TabsList = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"](({ className, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["List"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/tabs.tsx",
        lineNumber: 12,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
TabsList.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["List"].displayName;
const TabsTrigger = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"](({ className, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Trigger"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/tabs.tsx",
        lineNumber: 27,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
TabsTrigger.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Trigger"].displayName;
const TabsContent = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"](({ className, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Content"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/tabs.tsx",
        lineNumber: 42,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
TabsContent.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$tabs$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Content"].displayName;
;
}),
"[project]/PLINKO/components/HowToPlayModal.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>HowToPlayModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/dialog.tsx [app-ssr] (ecmascript)");
'use client';
;
;
function HowToPlayModal({ open, onOpenChange }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Dialog"], {
        open: open,
        onOpenChange: onOpenChange,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogContent"], {
            className: "sm:max-w-[700px] bg-white max-h-[80vh] overflow-y-auto",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogHeader"], {
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogTitle"], {
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
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-6 py-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                    className: "text-xl font-bold text-gray-900",
                                    children: "Welcome to Plinko!"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                    lineNumber: 29,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3 bg-green-50 rounded-lg p-4 border-2 border-green-600",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                    className: "text-xl font-bold text-gray-900",
                                    children: "Game Rules"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                    lineNumber: 38,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ol", {
                                    className: "list-decimal list-inside space-y-2 text-gray-700",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "leading-relaxed",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "leading-relaxed",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: "Select Risk Level:"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 44,
                                                    columnNumber: 17
                                                }, this),
                                                " Pick from three risk tiers:",
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    className: "ml-8 mt-1 space-y-1",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "leading-relaxed",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "leading-relaxed",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "leading-relaxed",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
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
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                    className: "text-xl font-bold text-gray-900",
                                    children: "Features"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                    lineNumber: 65,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "grid grid-cols-1 md:grid-cols-2 gap-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "bg-gray-50 rounded-lg p-3 border border-gray-200",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                                    className: "font-bold text-gray-900 mb-1",
                                                    children: "Auto-Drop"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 68,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "bg-gray-50 rounded-lg p-3 border border-gray-200",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                                    className: "font-bold text-gray-900 mb-1",
                                                    children: "Quick Wagers"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 74,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "bg-gray-50 rounded-lg p-3 border border-gray-200",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                                    className: "font-bold text-gray-900 mb-1",
                                                    children: "History Tracking"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 80,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "bg-gray-50 rounded-lg p-3 border border-gray-200",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                                    className: "font-bold text-gray-900 mb-1",
                                                    children: "Sound Effects"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 86,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3 bg-blue-50 rounded-lg p-4 border-2 border-blue-400",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                    className: "text-xl font-bold text-gray-900",
                                    children: "Pro Tips"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                    lineNumber: 96,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                    className: "space-y-2 text-gray-700",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "flex items-start",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-blue-600 font-bold mr-2",
                                                    children: "•"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 99,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "flex items-start",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-blue-600 font-bold mr-2",
                                                    children: "•"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 103,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "flex items-start",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-blue-600 font-bold mr-2",
                                                    children: "•"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 107,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "flex items-start",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-blue-600 font-bold mr-2",
                                                    children: "•"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/HowToPlayModal.tsx",
                                                    lineNumber: 111,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-center pt-4",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
}),
"[project]/PLINKO/components/MainNav.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>MainNav
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/dialog.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/tabs.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$HowToPlayModal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/HowToPlayModal.tsx [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
function MainNav() {
    const [settingsOpen, setSettingsOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [howToPlayOpen, setHowToPlayOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                className: "fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 backdrop-blur-sm border-b border-green-600 shadow-md",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "container mx-auto px-2 py-1",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center justify-between",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-sm font-bold text-green-600",
                                children: "PLINKO"
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/components/MainNav.tsx",
                                lineNumber: 27,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                                        variant: "ghost",
                                        className: "text-gray-700 hover:text-green-600 hover:bg-green-50 font-semibold text-xs h-7 px-2",
                                        children: "Home"
                                    }, void 0, false, {
                                        fileName: "[project]/PLINKO/components/MainNav.tsx",
                                        lineNumber: 33,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                                        onClick: ()=>setHowToPlayOpen(true),
                                        variant: "ghost",
                                        className: "text-gray-700 hover:text-green-600 hover:bg-green-50 font-semibold text-xs h-7 px-2",
                                        children: "How to Play"
                                    }, void 0, false, {
                                        fileName: "[project]/PLINKO/components/MainNav.tsx",
                                        lineNumber: 39,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                                        variant: "ghost",
                                        className: "text-gray-700 hover:text-green-600 hover:bg-green-50 font-semibold text-xs h-7 px-2",
                                        children: "Buy"
                                    }, void 0, false, {
                                        fileName: "[project]/PLINKO/components/MainNav.tsx",
                                        lineNumber: 46,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                                        onClick: ()=>setSettingsOpen(true),
                                        variant: "outline",
                                        className: "border border-green-600 text-green-600 hover:bg-green-600 hover:text-white font-semibold text-xs h-7 px-2",
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
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Dialog"], {
                open: settingsOpen,
                onOpenChange: setSettingsOpen,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogContent"], {
                    className: "sm:max-w-[600px] bg-white",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogHeader"], {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogTitle"], {
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
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Tabs"], {
                            defaultValue: "visual",
                            className: "w-full",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsList"], {
                                    className: "grid w-full grid-cols-3 bg-gray-100",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsTrigger"], {
                                            value: "visual",
                                            className: "data-[state=active]:bg-green-600 data-[state=active]:text-white font-semibold",
                                            children: "Visual"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/components/MainNav.tsx",
                                            lineNumber: 73,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsTrigger"], {
                                            value: "autodrop",
                                            className: "data-[state=active]:bg-green-600 data-[state=active]:text-white font-semibold",
                                            children: "Auto-drop"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/components/MainNav.tsx",
                                            lineNumber: 79,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsTrigger"], {
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
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsContent"], {
                                    value: "visual",
                                    className: "space-y-4 py-4",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "space-y-3",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                className: "text-lg font-semibold text-gray-900",
                                                children: "Visual Settings"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/components/MainNav.tsx",
                                                lineNumber: 97,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsContent"], {
                                    value: "autodrop",
                                    className: "space-y-4 py-4",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "space-y-3",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                className: "text-lg font-semibold text-gray-900",
                                                children: "Auto-drop Settings"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/components/MainNav.tsx",
                                                lineNumber: 105,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsContent"], {
                                    value: "agreement",
                                    className: "space-y-4 py-4",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "space-y-3",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                className: "text-lg font-semibold text-gray-900",
                                                children: "User Agreement"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/components/MainNav.tsx",
                                                lineNumber: 113,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$HowToPlayModal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
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
}),
"[project]/PLINKO/components/ui/label.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Label",
    ()=>Label
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$label$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/@radix-ui/react-label/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/class-variance-authority/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/lib/utils.ts [app-ssr] (ecmascript)");
;
;
;
;
;
const labelVariants = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cva"])("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70");
const Label = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"](({ className, ...props }, ref)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$label$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Root"], {
        ref: ref,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])(labelVariants(), className),
        ...props
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ui/label.tsx",
        lineNumber: 16,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0)));
Label.displayName = __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f40$radix$2d$ui$2f$react$2d$label$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Root"].displayName;
;
}),
"[project]/PLINKO/components/AutoPlayModal.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AutoPlayModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/dialog.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/label.tsx [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
function AutoPlayModal({ open, onOpenChange, onStart, currentBalance }) {
    const [showMoreOptions, setShowMoreOptions] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [settings, setSettings] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
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
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Dialog"], {
        open: open,
        onOpenChange: onOpenChange,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogContent"], {
            className: "sm:max-w-[600px] bg-gray-900 border-gray-700 max-h-[90vh] overflow-y-auto",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogHeader"], {
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogTitle"], {
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
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-6 py-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Label"], {
                                    className: "text-gray-400 text-sm mb-3 block",
                                    children: "Bet color"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                    lineNumber: 83,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "grid grid-cols-2 gap-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>updateSetting('riskLevel', 'GREEN'),
                                            className: `p-4 rounded-lg flex items-center gap-3 transition-all ${settings.riskLevel === 'GREEN' ? 'bg-gray-700 ring-2 ring-green-500' : 'bg-gray-800 hover:bg-gray-700'}`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: `w-3 h-3 rounded-full ${settings.riskLevel === 'GREEN' ? 'bg-green-500' : 'bg-gray-600'}`
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                    lineNumber: 93,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-white font-medium flex items-center gap-2",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>updateSetting('riskLevel', 'YELLOW'),
                                            className: `p-4 rounded-lg flex items-center gap-3 transition-all ${settings.riskLevel === 'YELLOW' ? 'bg-gray-700 ring-2 ring-yellow-500' : 'bg-gray-800 hover:bg-gray-700'}`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: `w-3 h-3 rounded-full ${settings.riskLevel === 'YELLOW' ? 'bg-yellow-500' : 'bg-gray-600'}`
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                    lineNumber: 107,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-white font-medium flex items-center gap-2",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    onClick: ()=>updateSetting('riskLevel', 'RED'),
                                    className: `w-full mt-3 p-4 rounded-lg flex items-center gap-3 transition-all ${settings.riskLevel === 'RED' ? 'bg-gray-700 ring-2 ring-red-500' : 'bg-gray-800 hover:bg-gray-700'}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: `w-3 h-3 rounded-full ${settings.riskLevel === 'RED' ? 'bg-red-500' : 'bg-gray-600'}`
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                            lineNumber: 122,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-white font-medium flex items-center gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Label"], {
                                    className: "text-gray-400 text-sm mb-3 block",
                                    children: "Number of rounds"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                    lineNumber: 132,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "grid grid-cols-2 gap-3",
                                    children: roundOptions.map((rounds)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>updateSetting('numberOfRounds', rounds),
                                            className: `p-4 rounded-lg transition-all ${settings.numberOfRounds === rounds ? 'bg-gray-700 ring-2 ring-green-500' : 'bg-gray-800 hover:bg-gray-700'}`,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-3",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: `w-3 h-3 rounded-full ${settings.numberOfRounds === rounds ? 'bg-green-500' : 'bg-gray-600'}`
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 145,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "bg-gray-800 rounded-lg p-4",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center justify-between",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-3 flex-1",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>updateSetting('stopOnLossEnabled', !settings.stopOnLossEnabled),
                                                        className: `w-12 h-6 rounded-full transition-colors relative ${settings.stopOnLossEnabled ? 'bg-green-500' : 'bg-gray-600'}`,
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-2",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>adjustValue('stopOnLossAmount', -10),
                                                        className: "w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center",
                                                        children: "−"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 172,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-white font-mono text-lg min-w-[80px] text-center",
                                                        children: settings.stopOnLossAmount.toFixed(2)
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 178,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "bg-gray-800 rounded-lg p-4",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center justify-between",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-3 flex-1",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>updateSetting('stopOnBigWinEnabled', !settings.stopOnBigWinEnabled),
                                                        className: `w-12 h-6 rounded-full transition-colors relative ${settings.stopOnBigWinEnabled ? 'bg-green-500' : 'bg-gray-600'}`,
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-2",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>adjustValue('stopOnBigWinAmount', -10),
                                                        className: "w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center",
                                                        children: "−"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 208,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-white font-mono text-lg min-w-[80px] text-center",
                                                        children: settings.stopOnBigWinAmount.toFixed(2)
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 214,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            onClick: ()=>setShowMoreOptions(!showMoreOptions),
                            className: "w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-white font-medium flex items-center justify-center gap-2 transition-colors",
                            children: [
                                "More options",
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                        showMoreOptions && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-4 animate-in slide-in-from-top-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "bg-gray-800 rounded-lg p-4",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center justify-between",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-3 flex-1",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>updateSetting('stopOnProfitEnabled', !settings.stopOnProfitEnabled),
                                                        className: `w-12 h-6 rounded-full transition-colors relative ${settings.stopOnProfitEnabled ? 'bg-green-500' : 'bg-gray-600'}`,
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-2",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>adjustValue('stopOnProfitAmount', -10),
                                                        className: "w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center",
                                                        children: "−"
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 257,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-white font-mono text-lg min-w-[80px] text-center",
                                                        children: settings.stopOnProfitAmount.toFixed(2)
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 263,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Label"], {
                                            className: "text-gray-400 text-sm mb-3 block text-center",
                                            children: "If I lost"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                            lineNumber: 278,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>updateSetting('onLossStrategy', 'reset'),
                                            className: `w-full p-4 rounded-lg mb-3 transition-all ${settings.onLossStrategy === 'reset' ? 'bg-gray-700 ring-2 ring-green-500' : 'bg-gray-800 hover:bg-gray-700'}`,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-3",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: `w-3 h-3 rounded-full ${settings.onLossStrategy === 'reset' ? 'bg-green-500' : 'bg-gray-600'}`
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 290,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "grid grid-cols-2 gap-3",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: `p-4 rounded-lg ${settings.onLossStrategy === 'increase' ? 'bg-gray-700 ring-2 ring-green-500' : 'bg-gray-800'}`,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            onClick: ()=>updateSetting('onLossStrategy', 'increase'),
                                                            className: "w-full text-left mb-2",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "flex items-center gap-3 mb-2",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: `w-3 h-3 rounded-full ${settings.onLossStrategy === 'increase' ? 'bg-green-500' : 'bg-gray-600'}`
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                        lineNumber: 309,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "flex items-center justify-center gap-2",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    onClick: ()=>adjustValue('onLossPercent', -5),
                                                                    className: "w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs",
                                                                    children: "−"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                    lineNumber: 314,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: `p-4 rounded-lg ${settings.onLossStrategy === 'decrease' ? 'bg-gray-700 ring-2 ring-green-500' : 'bg-gray-800'}`,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            onClick: ()=>updateSetting('onLossStrategy', 'decrease'),
                                                            className: "w-full text-left mb-2",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "flex items-center gap-3 mb-2",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: `w-3 h-3 rounded-full ${settings.onLossStrategy === 'decrease' ? 'bg-green-500' : 'bg-gray-600'}`
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                        lineNumber: 342,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "flex items-center justify-center gap-2",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    onClick: ()=>adjustValue('onLossPercent', -5),
                                                                    className: "w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs",
                                                                    children: "−"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                    lineNumber: 347,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Label"], {
                                            className: "text-gray-400 text-sm mb-3 block text-center",
                                            children: "If I win"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                            lineNumber: 367,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            onClick: ()=>updateSetting('onWinStrategy', 'reset'),
                                            className: `w-full p-4 rounded-lg mb-3 transition-all ${settings.onWinStrategy === 'reset' ? 'bg-gray-700 ring-2 ring-green-500' : 'bg-gray-800 hover:bg-gray-700'}`,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-3",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: `w-3 h-3 rounded-full ${settings.onWinStrategy === 'reset' ? 'bg-green-500' : 'bg-gray-600'}`
                                                    }, void 0, false, {
                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                        lineNumber: 379,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "grid grid-cols-2 gap-3",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: `p-4 rounded-lg ${settings.onWinStrategy === 'increase' ? 'bg-gray-700 ring-2 ring-green-500' : 'bg-gray-800'}`,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            onClick: ()=>updateSetting('onWinStrategy', 'increase'),
                                                            className: "w-full text-left mb-2",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "flex items-center gap-3 mb-2",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: `w-3 h-3 rounded-full ${settings.onWinStrategy === 'increase' ? 'bg-green-500' : 'bg-gray-600'}`
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                        lineNumber: 398,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "flex items-center justify-center gap-2",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    onClick: ()=>adjustValue('onWinPercent', -5),
                                                                    className: "w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs",
                                                                    children: "−"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                    lineNumber: 403,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: `p-4 rounded-lg ${settings.onWinStrategy === 'decrease' ? 'bg-gray-700 ring-2 ring-green-500' : 'bg-gray-800'}`,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            onClick: ()=>updateSetting('onWinStrategy', 'decrease'),
                                                            className: "w-full text-left mb-2",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "flex items-center gap-3 mb-2",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: `w-3 h-3 rounded-full ${settings.onWinStrategy === 'decrease' ? 'bg-green-500' : 'bg-gray-600'}`
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                        lineNumber: 431,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "flex items-center justify-center gap-2",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    onClick: ()=>adjustValue('onWinPercent', -5),
                                                                    className: "w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs",
                                                                    children: "−"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/PLINKO/components/AutoPlayModal.tsx",
                                                                    lineNumber: 436,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
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
}),
"[project]/PLINKO/components/PresetAmountsModal.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>PresetAmountsModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/dialog.tsx [app-ssr] (ecmascript)");
'use client';
;
;
const PRESET_AMOUNTS = [
    0.10,
    0.20,
    0.30,
    0.40,
    0.50,
    0.60,
    0.70,
    0.80,
    1.20,
    2.00,
    4.00,
    10.00,
    20.00,
    50.00,
    100.00
];
function PresetAmountsModal({ open, onOpenChange, onSelectAmount }) {
    const handleSelectAmount = (amount)=>{
        onSelectAmount(amount);
        onOpenChange(false);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Dialog"], {
        open: open,
        onOpenChange: onOpenChange,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogContent"], {
            className: "sm:max-w-[400px] bg-gradient-to-b from-gray-700 to-gray-800 border-gray-600",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogHeader"], {
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogTitle"], {
                        className: "text-xl font-bold text-white text-center",
                        children: "Bet USD"
                    }, void 0, false, {
                        fileName: "[project]/PLINKO/components/PresetAmountsModal.tsx",
                        lineNumber: 42,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/PLINKO/components/PresetAmountsModal.tsx",
                    lineNumber: 41,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "grid grid-cols-2 gap-2 p-4",
                    children: PRESET_AMOUNTS.map((amount)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            onClick: ()=>handleSelectAmount(amount),
                            className: "bg-gradient-to-b from-gray-600 to-gray-700 hover:from-green-500 hover:to-green-600 text-white font-bold py-3 px-4 rounded-lg shadow-md active:scale-95 transition-all border border-gray-500",
                            children: amount.toFixed(2)
                        }, amount, false, {
                            fileName: "[project]/PLINKO/components/PresetAmountsModal.tsx",
                            lineNumber: 47,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/PLINKO/components/PresetAmountsModal.tsx",
                    lineNumber: 45,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/PLINKO/components/PresetAmountsModal.tsx",
            lineNumber: 40,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/PresetAmountsModal.tsx",
        lineNumber: 39,
        columnNumber: 5
    }, this);
}
}),
"[project]/PLINKO/components/ExtendedHistoryModal.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ExtendedHistoryModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ui/dialog.tsx [app-ssr] (ecmascript)");
'use client';
;
;
function ExtendedHistoryModal({ open, onOpenChange, history }) {
    // Function to determine color based on risk level and multiplier
    const getMultiplierColor = (item)=>{
        const isDark = item.multiplier < 1;
        if (item.risk === 'GREEN') {
            return isDark ? 'bg-[rgb(100,140,45)]' : 'bg-[rgb(140,185,60)]';
        } else if (item.risk === 'YELLOW') {
            return isDark ? 'bg-[rgb(200,190,30)]' : 'bg-[rgb(255,240,60)]';
        } else if (item.risk === 'RED') {
            return isDark ? 'bg-[rgb(160,35,35)]' : 'bg-[rgb(210,50,50)]';
        }
        return 'bg-gray-500';
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Dialog"], {
        open: open,
        onOpenChange: onOpenChange,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogContent"], {
            className: "sm:max-w-[360px] bg-gradient-to-b from-teal-700 to-teal-800 border-2 border-teal-600 p-3",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogHeader"], {
                    className: "pb-2",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center justify-between",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogTitle"], {
                                className: "text-sm font-bold text-white uppercase tracking-wide",
                                children: "Last Results"
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/components/ExtendedHistoryModal.tsx",
                                lineNumber: 48,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: ()=>onOpenChange(false),
                                className: "w-8 h-8 rounded-full border-2 border-white/40 bg-white/10 hover:bg-white/20 text-white transition-all flex items-center justify-center",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                    className: "fas fa-sync-alt text-xs"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/components/ExtendedHistoryModal.tsx",
                                    lineNumber: 53,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/components/ExtendedHistoryModal.tsx",
                                lineNumber: 49,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/PLINKO/components/ExtendedHistoryModal.tsx",
                        lineNumber: 47,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/PLINKO/components/ExtendedHistoryModal.tsx",
                    lineNumber: 46,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "overflow-y-auto max-h-[400px] pr-1 custom-scrollbar",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-4 gap-1.5",
                        children: history.length > 0 ? history.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: `${getMultiplierColor(item)} rounded-lg px-2 py-1.5 text-center font-black text-xs shadow-[0_2px_4px_rgba(0,0,0,0.3)] border border-black/20 text-black transition-transform hover:scale-105`,
                                children: item.multiplier
                            }, item.id, false, {
                                fileName: "[project]/PLINKO/components/ExtendedHistoryModal.tsx",
                                lineNumber: 61,
                                columnNumber: 15
                            }, this)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "col-span-4 text-center text-white/60 py-4 text-xs",
                            children: "No results yet"
                        }, void 0, false, {
                            fileName: "[project]/PLINKO/components/ExtendedHistoryModal.tsx",
                            lineNumber: 68,
                            columnNumber: 15
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/PLINKO/components/ExtendedHistoryModal.tsx",
                        lineNumber: 59,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/PLINKO/components/ExtendedHistoryModal.tsx",
                    lineNumber: 58,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/PLINKO/components/ExtendedHistoryModal.tsx",
            lineNumber: 45,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/PLINKO/components/ExtendedHistoryModal.tsx",
        lineNumber: 44,
        columnNumber: 5
    }, this);
}
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
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$MainNav$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/MainNav.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$AutoPlayModal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/AutoPlayModal.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$PresetAmountsModal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/PresetAmountsModal.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ExtendedHistoryModal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/PLINKO/components/ExtendedHistoryModal.tsx [app-ssr] (ecmascript)");
'use client';
;
;
;
;
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
    const [showAutoPlayModal, setShowAutoPlayModal] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [showPresetModal, setShowPresetModal] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [showExtendedHistory, setShowExtendedHistory] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [autoPlaySettings, setAutoPlaySettings] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [remainingBalls, setRemainingBalls] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [isMobile, setIsMobile] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [winLossBadge, setWinLossBadge] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const lastRiskRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])('GREEN');
    const historyIdCounter = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(0);
    // AutoPlay state tracking
    const initialWagerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(0.30);
    const startingBalanceRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(755.37);
    const lastWinAmountRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(0);
    const handleScore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((multiplier)=>{
        const winAmount = wager * multiplier;
        const profit = winAmount - wager;
        lastWinAmountRef.current = winAmount;
        setGameState((prev)=>{
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
                    setWager((prev)=>+(prev * (1 + percent / 100)).toFixed(2));
                } else if (strategy === 'decrease') {
                    setWager((prev)=>Math.max(0.1, +(prev * (1 - percent / 100)).toFixed(2)));
                }
            }
            return {
                ...prev,
                balance: newBalance
            };
        });
        // Generate unique ID using counter to prevent duplicate keys
        historyIdCounter.current += 1;
        const uniqueId = Date.now() * 1000 + historyIdCounter.current;
        setHistory((prev)=>[
                {
                    id: uniqueId,
                    multiplier,
                    risk: lastRiskRef.current
                },
                ...prev
            ].slice(0, 15));
        // Show win/loss badge
        setWinLossBadge({
            amount: profit,
            key: Date.now()
        });
        // Clear badge after animation completes
        setTimeout(()=>{
            setWinLossBadge(null);
        }, 2000);
    }, [
        wager,
        isAutoDrop,
        autoPlaySettings
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
    // AutoPlay handler
    const handleStartAutoPlay = (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((settings)=>{
        setAutoPlaySettings(settings);
        setRemainingBalls(settings.numberOfRounds);
        initialWagerRef.current = wager;
        startingBalanceRef.current = gameState.balance;
        setIsAutoDrop(true);
    }, [
        wager,
        gameState.balance
    ]);
    // Auto Drop Logic
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        let interval = null;
        if (isAutoDrop && remainingBalls > 0 && autoPlaySettings) {
            interval = window.setInterval(()=>{
                dropBall(autoPlaySettings.riskLevel);
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
        autoPlaySettings
    ]);
    // Detect mobile devices for responsive background
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const checkMobile = ()=>{
            setIsMobile(window.innerWidth < 440); // Mobile breakpoint at 640px
        };
        checkMobile(); // Check on mount
        window.addEventListener('resize', checkMobile);
        return ()=>window.removeEventListener('resize', checkMobile);
    }, []);
    const adjustWager = (amount)=>{
        setWager((prev)=>Math.max(0.1, +(prev + amount).toFixed(2)));
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-col h-screen w-full transition-all duration-1000 overflow-hidden",
        style: {
            backgroundImage: `url("${isMobile ? '/ui/bg6.jpeg' : '/ui/pg.png'}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'fixed',
            backgroundColor: 'black'
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$MainNav$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                fileName: "[project]/PLINKO/app/page.tsx",
                lineNumber: 207,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                className: "flex justify-between items-center px-2 py-1 z-30 bg-white/10 backdrop-blur-sm border-b border-white/20 mt-[45px]",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-1 max-w-[60%] overflow-hidden",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: ()=>setShowExtendedHistory(true),
                                className: "w-8 h-8 rounded-full bg-gradient-to-b from-gray-500 via-gray-600 to-gray-800 border-b-4 border-gray-900 shadow-xl shadow-gray-900/80 hover:from-gray-400 hover:via-gray-500 hover:to-gray-700 hover:shadow-gray-900/90 hover:border-gray-800 active:shadow-inner active:shadow-gray-900/60 active:border-gray-900 active:scale-95 transition-all duration-75 text-white flex items-center justify-center flex-shrink-0",
                                title: "View extended history",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                    className: "fas fa-history text-xs"
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 218,
                                    columnNumber: 13
                                }, ("TURBOPACK compile-time value", void 0))
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/app/page.tsx",
                                lineNumber: 213,
                                columnNumber: 11
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex gap-0.5 overflow-x-auto no-scrollbar scroll-smooth",
                                children: history.length > 0 ? history.slice(0, 6).map((item, index)=>{
                                    // Determine color based on risk level and multiplier
                                    let bgColor = '';
                                    const isDark = item.multiplier < 1;
                                    if (item.risk === 'GREEN') {
                                        bgColor = isDark ? 'bg-[rgb(100,140,45)]' : 'bg-[rgb(140,185,60)]';
                                    } else if (item.risk === 'YELLOW') {
                                        bgColor = isDark ? 'bg-[rgb(200,190,30)]' : 'bg-[rgb(255,240,60)]';
                                    } else if (item.risk === 'RED') {
                                        bgColor = isDark ? 'bg-[rgb(160,35,35)]' : 'bg-[rgb(210,50,50)]';
                                    }
                                    // Responsive visibility classes
                                    let visibilityClass = '';
                                    if (index >= 5) visibilityClass = 'hidden lg:block'; // 6th item: lg only
                                    else if (index >= 3) visibilityClass = 'hidden md:block'; // 4th-5th items: md and lg
                                    // Items 0-2: always visible
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: `${bgColor} ${index === 0 ? 'history-item-enter' : ''} ${visibilityClass} hover:brightness-110 px-2 py-1 rounded text-[11px] font-black min-w-fit border-b-2 border-black/50 text-black shadow-lg shadow-black/60 transition-all duration-300 hover:scale-105 hover:shadow-black/80`,
                                        children: [
                                            item.multiplier,
                                            "x"
                                        ]
                                    }, item.id, true, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 241,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0));
                                }) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-[11px] text-white/60 font-bold uppercase tracking-widest px-1 italic",
                                    children: "Waiting for results..."
                                }, void 0, false, {
                                    fileName: "[project]/PLINKO/app/page.tsx",
                                    lineNumber: 249,
                                    columnNumber: 15
                                }, ("TURBOPACK compile-time value", void 0))
                            }, void 0, false, {
                                fileName: "[project]/PLINKO/app/page.tsx",
                                lineNumber: 220,
                                columnNumber: 11
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/PLINKO/app/page.tsx",
                        lineNumber: 212,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-[1px]",
                        children: [
                            winLossBadge && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: `win-loss-badge-enter px-1.5 py-0.5 rounded text-[8px] font-black ${winLossBadge.amount >= 0 ? 'bg-green-500 text-white' : 'bg-red-500 text-white'} shadow-md border border-black/20`,
                                children: [
                                    winLossBadge.amount >= 0 ? '+' : '',
                                    winLossBadge.amount.toFixed(2)
                                ]
                            }, winLossBadge.key, true, {
                                fileName: "[project]/PLINKO/app/page.tsx",
                                lineNumber: 258,
                                columnNumber: 13
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-1 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-2 py-1 rounded-lg border-b-4 border-gray-900 shadow-xl shadow-gray-900/80 hover:from-gray-400 hover:via-gray-500 hover:to-gray-700 hover:shadow-gray-900/90 hover:border-gray-800 transition-all duration-75",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-white font-black text-[10px] tracking-tight",
                                        children: gameState.balance.toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2
                                        })
                                    }, void 0, false, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 272,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-white/80 text-[7px] font-black",
                                        children: "USD"
                                    }, void 0, false, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 275,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/PLINKO/app/page.tsx",
                                lineNumber: 271,
                                columnNumber: 11
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/PLINKO/app/page.tsx",
                        lineNumber: 255,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/PLINKO/app/page.tsx",
                lineNumber: 210,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                className: "flex-1 flex flex-col gap-1 p-1 pb-1 overflow-hidden",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex-1 w-full flex justify-center items-start bg-black/5 rounded-lg border border-black/10 shadow-inner pt-1 overflow-auto",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$PlinkoGame$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            onScore: handleScore,
                            lastDrop: lastDrop
                        }, void 0, false, {
                            fileName: "[project]/PLINKO/app/page.tsx",
                            lineNumber: 284,
                            columnNumber: 11
                        }, ("TURBOPACK compile-time value", void 0))
                    }, void 0, false, {
                        fileName: "[project]/PLINKO/app/page.tsx",
                        lineNumber: 283,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex-shrink-0 bg-black/20 rounded-2xl",
                        style: {
                            backgroundColor: 'rgba(100, 95, 158, 0.64)'
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "hidden sm:flex items-center justify-center gap-2 p-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "bg-gradient-to-b from-slate-900 via-slate-600 to-slate-800 rounded-full px-5 py-2 shadow-xl shadow-gray-900/80 border-b-4 border-gray-900 min-w-[140px]",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-center",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-white/60 text-[9px] font-medium uppercase tracking-wide",
                                                    children: "Bet USD"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/app/page.tsx",
                                                    lineNumber: 302,
                                                    columnNumber: 17
                                                }, ("TURBOPACK compile-time value", void 0)),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-white font-bold text-lg font-mono",
                                                    children: wager.toFixed(2)
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/app/page.tsx",
                                                    lineNumber: 303,
                                                    columnNumber: 17
                                                }, ("TURBOPACK compile-time value", void 0))
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/PLINKO/app/page.tsx",
                                            lineNumber: 301,
                                            columnNumber: 15
                                        }, ("TURBOPACK compile-time value", void 0))
                                    }, void 0, false, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 300,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center gap-1.5",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>adjustWager(-0.1),
                                                className: "w-11 h-11 rounded-full bg-gradient-to-b from-slate-950 via-slate-600 to-slate-800 text-white font-bold text-xl shadow-xl shadow-gray-900/80 border-b-4 border-gray-900 hover:from-gray-400 hover:via-gray-500 hover:to-gray-700 hover:shadow-gray-900/90 hover:border-gray-800 active:shadow-inner active:shadow-gray-900/60 active:border-gray-900 active:scale-95 transition-all duration-75",
                                                children: "−"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 309,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>setShowPresetModal(true),
                                                className: "w-11 h-11 rounded-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white shadow-xl shadow-gray-900/80 border-b-4 border-gray-900 hover:from-gray-400 hover:via-gray-500 hover:to-gray-700 hover:shadow-gray-900/90 hover:border-gray-800 active:shadow-inner active:shadow-gray-900/60 active:border-gray-900 active:scale-95 transition-all duration-75 flex items-center justify-center",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                                    className: "fas fa-layer-group text-sm"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/app/page.tsx",
                                                    lineNumber: 319,
                                                    columnNumber: 17
                                                }, ("TURBOPACK compile-time value", void 0))
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 315,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>adjustWager(0.1),
                                                className: "w-8 h-8 rounded-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white font-bold text-xl shadow-xl shadow-gray-900/80 border-b-4 border-gray-900 hover:from-gray-400 hover:via-gray-500 hover:to-gray-700 hover:shadow-gray-900/90 hover:border-gray-800 active:shadow-inner active:shadow-gray-900/60 active:border-gray-900 active:scale-95 transition-all duration-75",
                                                children: "+"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 321,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 308,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: ()=>{
                                            if (isAutoDrop) {
                                                setIsAutoDrop(false);
                                                setRemainingBalls(0);
                                            } else {
                                                setShowAutoPlayModal(true);
                                            }
                                        },
                                        className: `w-12 h-12 rounded-full shadow-xl border-b-4 active:scale-95 transition-all duration-75 flex items-center justify-center ${isAutoDrop ? 'bg-gradient-to-b from-orange-400 via-orange-500 to-orange-700 text-white shadow-orange-900/80 border-orange-800 hover:from-orange-300 hover:via-orange-400 hover:to-orange-600 hover:shadow-orange-900/90 hover:border-orange-700 active:shadow-inner active:shadow-orange-900/60 active:border-orange-900' : 'bg-gradient-to-b from-blue-400 via-blue-500 to-blue-700 text-white shadow-blue-900/80 border-blue-800 hover:from-blue-300 hover:via-blue-400 hover:to-blue-600 hover:shadow-blue-900/90 hover:border-blue-700 active:shadow-inner active:shadow-blue-900/60 active:border-blue-900'}`,
                                        children: isAutoDrop ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "font-bold text-sm",
                                            children: remainingBalls
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/app/page.tsx",
                                            lineNumber: 346,
                                            columnNumber: 17
                                        }, ("TURBOPACK compile-time value", void 0)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                            className: "fas fa-sync-alt text-lg"
                                        }, void 0, false, {
                                            fileName: "[project]/PLINKO/app/page.tsx",
                                            lineNumber: 348,
                                            columnNumber: 17
                                        }, ("TURBOPACK compile-time value", void 0))
                                    }, void 0, false, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 330,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: ()=>dropBall('GREEN'),
                                        className: "h-12 px-6 rounded-full bg-gradient-to-b from-green-400 via-green-500 to-green-700 text-white font-bold text-sm shadow-xl shadow-green-900/80 border-b-4 border-green-800 hover:from-green-300 hover:via-green-400 hover:to-green-600 hover:shadow-green-900/90 hover:border-green-700 active:shadow-inner active:shadow-green-900/60 active:border-green-900 active:scale-95 transition-all duration-75 uppercase tracking-wider",
                                        children: "GREEN"
                                    }, void 0, false, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 353,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: ()=>dropBall('YELLOW'),
                                        className: "h-12 px-6 rounded-full bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-700 text-white font-bold text-sm shadow-xl shadow-yellow-900/80 border-b-4 border-yellow-800 hover:from-yellow-300 hover:via-yellow-400 hover:to-yellow-600 hover:shadow-yellow-900/90 hover:border-yellow-700 active:shadow-inner active:shadow-yellow-900/60 active:border-yellow-900 active:scale-95 transition-all duration-75 uppercase tracking-wider",
                                        children: "YELLOW"
                                    }, void 0, false, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 359,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: ()=>dropBall('RED'),
                                        className: "h-12 px-6 rounded-full bg-gradient-to-b from-red-400 via-red-500 to-red-700 text-white font-bold text-sm shadow-xl shadow-red-900/80 border-b-4 border-red-800 hover:from-red-300 hover:via-red-400 hover:to-red-600 hover:shadow-red-900/90 hover:border-red-700 active:shadow-inner active:shadow-red-900/60 active:border-red-900 active:scale-95 transition-all duration-75 uppercase tracking-wider",
                                        children: "RED"
                                    }, void 0, false, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 365,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/PLINKO/app/page.tsx",
                                lineNumber: 298,
                                columnNumber: 11
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "sm:hidden flex flex-col gap-1 p-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center justify-center gap-2",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>{
                                                    if (isAutoDrop) {
                                                        setIsAutoDrop(false);
                                                        setRemainingBalls(0);
                                                    } else {
                                                        setShowAutoPlayModal(true);
                                                    }
                                                },
                                                className: `w-12 h-12 rounded-full shadow-xl border-b-4 active:scale-95 transition-all duration-75 flex items-center justify-center ${isAutoDrop ? 'bg-gradient-to-b from-orange-400 via-orange-500 to-orange-700 text-white shadow-orange-900/80 border-orange-800 hover:from-orange-300 hover:via-orange-400 hover:to-orange-600 hover:shadow-orange-900/90 hover:border-orange-700 active:shadow-inner active:shadow-orange-900/60 active:border-orange-900' : 'bg-gradient-to-b from-blue-400 via-blue-500 to-blue-700 text-white shadow-blue-900/80 border-blue-800 hover:from-blue-300 hover:via-blue-400 hover:to-blue-600 hover:shadow-blue-900/90 hover:border-blue-700 active:shadow-inner active:shadow-blue-900/60 active:border-blue-900'}`,
                                                children: isAutoDrop ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "font-bold text-sm",
                                                    children: remainingBalls
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/app/page.tsx",
                                                    lineNumber: 393,
                                                    columnNumber: 19
                                                }, ("TURBOPACK compile-time value", void 0)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                                    className: "fas fa-sync-alt text-lg"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/app/page.tsx",
                                                    lineNumber: 395,
                                                    columnNumber: 19
                                                }, ("TURBOPACK compile-time value", void 0))
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 377,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>dropBall('GREEN'),
                                                className: "h-12 px-6 rounded-full bg-gradient-to-b from-green-400 via-green-500 to-green-700 text-white font-bold text-sm shadow-xl shadow-green-900/80 border-b-4 border-green-800 hover:from-green-300 hover:via-green-400 hover:to-green-600 hover:shadow-green-900/90 hover:border-green-700 active:shadow-inner active:shadow-green-900/60 active:border-green-900 active:scale-95 transition-all duration-75 uppercase tracking-wider",
                                                children: "GREEN"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 399,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>dropBall('YELLOW'),
                                                className: "h-12 px-6 rounded-full bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-700 text-white font-bold text-sm shadow-xl shadow-yellow-900/80 border-b-4 border-yellow-800 hover:from-yellow-300 hover:via-yellow-400 hover:to-yellow-600 hover:shadow-yellow-900/90 hover:border-yellow-700 active:shadow-inner active:shadow-yellow-900/60 active:border-yellow-900 active:scale-95 transition-all duration-75 uppercase tracking-wider",
                                                children: "YELLOW"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 405,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>dropBall('RED'),
                                                className: "h-12 px-6 rounded-full bg-gradient-to-b from-red-400 via-red-500 to-red-700 text-white font-bold text-sm shadow-xl shadow-red-900/80 border-b-4 border-red-800 hover:from-red-300 hover:via-red-400 hover:to-red-600 hover:shadow-red-900/90 hover:border-red-700 active:shadow-inner active:shadow-red-900/60 active:border-red-900 active:scale-95 transition-all duration-75 uppercase tracking-wider",
                                                children: "RED"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 411,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 376,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center justify-center gap-2",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "bg-gradient-to-b from-slate-500 via-slate-600 to-slate-800 rounded-full px-5 py-1.5 shadow-xl shadow-gray-900/80 border-b-4 border-gray-900 flex-1 max-w-[180px]",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-center",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "text-white/60 text-[8px] font-medium uppercase",
                                                            children: "Bet USD"
                                                        }, void 0, false, {
                                                            fileName: "[project]/PLINKO/app/page.tsx",
                                                            lineNumber: 423,
                                                            columnNumber: 19
                                                        }, ("TURBOPACK compile-time value", void 0)),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "text-white font-bold text-base font-mono",
                                                            children: wager.toFixed(2)
                                                        }, void 0, false, {
                                                            fileName: "[project]/PLINKO/app/page.tsx",
                                                            lineNumber: 424,
                                                            columnNumber: 19
                                                        }, ("TURBOPACK compile-time value", void 0))
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/PLINKO/app/page.tsx",
                                                    lineNumber: 422,
                                                    columnNumber: 17
                                                }, ("TURBOPACK compile-time value", void 0))
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 421,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>adjustWager(-0.1),
                                                className: "w-11 h-11 rounded-full bg-gradient-to-b from-slate-950 via-slate-600 to-slate-800 text-white font-bold text-xl shadow-xl shadow-gray-900/80 border-b-4 border-gray-900 hover:from-gray-400 hover:via-gray-500 hover:to-gray-700 hover:shadow-gray-900/90 hover:border-gray-800 active:shadow-inner active:shadow-gray-900/60 active:border-gray-900 active:scale-95 transition-all duration-75",
                                                children: "−"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 428,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>setShowPresetModal(true),
                                                className: "w-11 h-11 rounded-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white shadow-xl shadow-gray-900/80 border-b-4 border-gray-900 hover:from-gray-400 hover:via-gray-500 hover:to-gray-700 hover:shadow-gray-900/90 hover:border-gray-800 active:shadow-inner active:shadow-gray-900/60 active:border-gray-900 active:scale-95 transition-all duration-75 flex items-center justify-center",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                                    className: "fas fa-layer-group text-sm"
                                                }, void 0, false, {
                                                    fileName: "[project]/PLINKO/app/page.tsx",
                                                    lineNumber: 438,
                                                    columnNumber: 17
                                                }, ("TURBOPACK compile-time value", void 0))
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 434,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>adjustWager(0.1),
                                                className: "w-11 h-11 rounded-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white font-bold text-xl shadow-xl shadow-gray-900/80 border-b-4 border-gray-900 hover:from-gray-400 hover:via-gray-500 hover:to-gray-700 hover:shadow-gray-900/90 hover:border-gray-800 active:shadow-inner active:shadow-gray-900/60 active:border-gray-900 active:scale-95 transition-all duration-75",
                                                children: "+"
                                            }, void 0, false, {
                                                fileName: "[project]/PLINKO/app/page.tsx",
                                                lineNumber: 440,
                                                columnNumber: 15
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/PLINKO/app/page.tsx",
                                        lineNumber: 420,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/PLINKO/app/page.tsx",
                                lineNumber: 374,
                                columnNumber: 11
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/PLINKO/app/page.tsx",
                        lineNumber: 291,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/PLINKO/app/page.tsx",
                lineNumber: 281,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$AutoPlayModal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                open: showAutoPlayModal,
                onOpenChange: setShowAutoPlayModal,
                onStart: handleStartAutoPlay,
                currentBalance: gameState.balance
            }, void 0, false, {
                fileName: "[project]/PLINKO/app/page.tsx",
                lineNumber: 452,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$PresetAmountsModal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                open: showPresetModal,
                onOpenChange: setShowPresetModal,
                onSelectAmount: setWager
            }, void 0, false, {
                fileName: "[project]/PLINKO/app/page.tsx",
                lineNumber: 460,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$PLINKO$2f$components$2f$ExtendedHistoryModal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                open: showExtendedHistory,
                onOpenChange: setShowExtendedHistory,
                history: history
            }, void 0, false, {
                fileName: "[project]/PLINKO/app/page.tsx",
                lineNumber: 467,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0))
        ]
    }, void 0, true, {
        fileName: "[project]/PLINKO/app/page.tsx",
        lineNumber: 195,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
const __TURBOPACK__default__export__ = Home;
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__14c6aed5._.js.map