# Stream background music

Kyle's own Suno tracks (Suno account `sultryproducers748`, tagged "made with suno"), instrumental only:

| File | Title | Suno clip id |
|---|---|---|
| lo-fi-daydream.mp3 | Lo-Fi Daydream | edc18ebf-06cd-4dca-9b07-16c9c72fff5a |
| lo-fi-catchy-beat.mp3 | Lo-fi Catchy Beat | 067f7026-0479-492d-b548-6aa4133a51cb |
| in-my-head.mp3 | In My Head | 9ab3010d-d791-42c8-a2bc-422285049470 |
| midnight-pulse.mp3 | Midnight Pulse | 29dd8cfa-72c4-4238-81a6-283492b27535 |

("Glossy Lift" from the same account was left out because it has vocals.)

License note: Suno grants commercial-use rights only for songs generated while on a paid
(Pro/Premier) plan. Songs made on the free plan are non-commercial. Confirm these were made on a
paid plan before relying on them for a monetized stream.

The worker shuffles every file in `MUSIC_DIR` (default this folder) and loops it at `MUSIC_VOLUME`
(default 0.18). Drop more tracks here, or set `MUSIC_URL`, or `MUSIC_ENABLED=0` for silence.
