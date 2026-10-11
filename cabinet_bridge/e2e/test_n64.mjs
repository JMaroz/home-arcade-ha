import { chromium } from "@playwright/test";

async function run() {
  console.log("Launching Chromium browser for ROM 251 (N64)...");
  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--no-sandbox"]
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("console", (msg) => {
    console.log(`[BROWSER CONSOLE ${msg.type().toUpperCase()}]`, msg.text());
  });

  page.on("pageerror", (err) => {
    console.error("[BROWSER PAGE ERROR]", err.message);
  });

  page.on("requestfailed", (req) => {
    console.error("[BROWSER REQUEST FAILED]", req.url(), req.failure()?.errorText);
  });

  await page.addInitScript(() => {
    const OrigPC = window.RTCPeerConnection;
    window.RTCPeerConnection = function(...args) {
      const pc = new OrigPC(...args);
      window.__debug_pc = pc;
      return pc;
    };
  });

  const playerUrl = "http://192.168.1.67:5000/api/roms/251/stream-player?profile=1";
  console.log("Navigating to stream-player:", playerUrl);
  try {
    await page.goto(playerUrl, { timeout: 15000 });
    console.log("Page loaded. Waiting 8 seconds for WebRTC negotiation...");
    await page.waitForTimeout(8000);

    const hudState = await page.evaluate(() => {
      const hud = document.getElementById("status-hud");
      const title = document.getElementById("hud-title")?.textContent;
      const sub = document.getElementById("hud-sub")?.textContent;
      const video = document.getElementById("remote-video");
      const isHidden = hud?.classList.contains("is-hidden");
      return {
        hudHidden: isHidden,
        hudTitle: title,
        hudSub: sub,
        videoReadyState: video ? video.readyState : -1,
        videoSrcObject: !!video?.srcObject,
        videoPaused: video ? video.paused : true,
      };
    });
    console.log("HUD State:", JSON.stringify(hudState, null, 2));

    const stats = await page.evaluate(async () => {
      const pc = window.__debug_pc;
      if (!pc) return { error: "No __debug_pc" };
      const report = await pc.getStats();
      const items = [];
      report.forEach((v) => {
        items.push({
          type: v.type,
          kind: v.kind,
          packetsReceived: v.packetsReceived,
          bytesReceived: v.bytesReceived,
          framesDecoded: v.framesDecoded,
        });
      });
      return items;
    });
    console.log("WebRTC Stats:", JSON.stringify(stats, null, 2));
  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await browser.close();
  }
}

run();
