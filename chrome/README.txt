quotexbot Chrome MV3 extension  v0.9.60-ext
=======================================

Load unpacked
-------------
1. Open chrome://extensions
2. Turn on Developer mode (top-right)
3. Click "Load unpacked"
4. Select the chrome folder (the folder that contains manifest.json)
5. Open your Quotex DEMO trade tab. The HUD pins bottom-left ON the chart.
6. Disable Tampermonkey quotexbot so two HUDs do not stack.

The HUD is English. Pair names, CALL/PUT, and DEMO stay as-is.

DEMO only. Visible DOM. No cookies / SSID / unofficial APIs.
Stay on the open chart. Auto clicks Up/Down on DEMO only.
Auto ON only from a trusted Start auto click this session.
Dashboard / mini / restore clicks must not start Auto.
HUD Up / Dashboard must not start Auto.
SWITCH TIME / Time chip at most once per page boot (or once on Start auto).
If Time stays clock, give up and never click SWITCH TIME again this session
(log: Time left on clock). Idle does not retry every 8s. Candle-open click
never opens SWITCH TIME. If a duration dropdown is open: Escape once, then stop.
Candle open is wall-clock seconds 0-4, not Time leftover 00:51. Clock HH:MM at
open still allows the click.
Mid-candle seconds 5-51 logs Wait candle open and does not click Up/Down.
One open trade at a time. Skip Up/Down only if Trades badge ≥ 1, this-session
reserved balance, or a trades-list row (pair + CALL|PUT|Up|Down + $ + MM:SS).
Never treat the Time widget + Investment field as an open trade.
Pending journal is not an open trade after Trades=0. Auto takes the next
signal once the last trade expires (small 2–3s gap OK).
Auto NEVER clicks if stored bars n>=1 < 21 (hard gate on the Up/Down click).
Stay on the already-open chart. Never click another pair tab/row.
If (i) opens the asset list or changes the pair: close it and ban further (i).
Up/Down scrape click only when getSeconds()<=4 (fail closed). No Time/SWITCH
TIME inside clickDir. No 8s idle SWITCH TIME retry.
Auto skips until 21 stored bars n>=1 (no 2-tick CALL). USD/BRL 0.14–0.32.
Price Now must pass ok() on the first tick (no lastGoodPx-null bypass).

Live price: Price Now first (Pair Information panel quote). Skip screenshot
only when that quote is live (finite v that changed, or last change < 2.5s).
If the same Price Now number is unchanged >2.5s, OCR the cyan last-price
pill. Frozen Price Now (same v >7s) is not used as live. If XfvzC is visible
but Price Now has no number, OCR the cyan last-price pill. Never click that
heading.
If closed, click only svg.icon-pair-information on the right-panel active
pair (not the pair name). If that opens the asset list, close it and do
not retry. Else screenshot, crop the chart-canvas right-edge cyan/blue
last-price pill (~3x), Tesseract.js OCR offscreen. Capture waits for the
previous OCR, then ~1500ms. After SWITCH TIME, press Escape so the
duration list does not stay open.

otcBars persist in chrome.storage.local (quotexbot_otc_bars) plus localStorage
fallback. Boot merges both; never save empty otcBars over a nonempty store.
Version bump does not clear otcBars. History HUD says "bars · kept" only when
denseBars of the visible pair > 0 AND those bars came from storage restore.
If the current pair is 0, HUD shows "0/21 bars" (not a lying "kept").
Price Now DOM wins when in range, not payout, 4+ decimals for v<2. Cyan
tag/OCR only if Price Now is missing, frozen, payout-like, or out of range.
correctOcr ±0.1 only for quotes in [0.9, 2) (1.032↔1.132), never CAD/CHF 0.58.
CAD/CHF range is 0.55–0.64. Payout is never live price.
History: denseBars n>=3 even if flat; never replace a longer pair array
with a shorter snapshot. HUD n/21; "kept" only if n >= restored count.
Trade HUD only while journal is open (settled/SKIP → —).
Account net is sum of settled journal pnl (win +, loss −stake).
OCR junk pairs (CGI/CHA) are ignored: not a pair change, not a History key.
HUD keeps lastGood price up to 60s on the same chart (no invented price).
History does not fall while idle: OCR miss / livePxHeld still ingest lastGoodPx
(flat OK). HUD and Auto/clickDir 21-bar gate count stored bars n>=1, not
denseBars n>=3. minBarsForEma stays 21. sessionHighWater per pair is monotonic
this session except a real pair change.
