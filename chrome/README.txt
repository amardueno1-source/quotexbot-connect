quotexbot Chrome MV3 extension  v0.9.52-ext
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
Switch Time with realishClick (not el.click()). If Time stays wall-clock, skip
the trade. Enter only at 1m candle open (remaining 00:57–00:60). Mid-candle
00:08–00:56 logs Wait candle open and does not click Up/Down.
One open trade at a time. Skip Up/Down only if Trades badge ≥ 1, this-session
reserved balance, or a trades-list row (pair + CALL|PUT|Up|Down + $ + MM:SS).
Never treat the Time widget + Investment field as an open trade.
Pending journal is not an open trade after Trades=0. Auto takes the next
signal once the last trade expires (small 2–3s gap OK).
Auto skips until 21 dense bars (no 2-tick CALL). USD/BRL 0.14–0.32.
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
