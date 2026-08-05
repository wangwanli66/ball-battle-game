import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("界面提供消耗体型加速和好友房间入口", async () => {
  const [hud, partyPanel] = await Promise.all([
    readFile(new URL("../app/GameHud.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PartyPanel.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(hud, /按住加速/);
  assert.match(hud, /onPointerDown=\{startBoost\}/);
  assert.match(hud, /onPointerCancel=\{stopBoost\}/);
  assert.match(hud, /好友开黑/);
  assert.match(partyPanel, /创建房间/);
  assert.match(partyPanel, /加入房间/);
  assert.match(partyPanel, /window\.location\.hash/);
});

test("好友联机使用动态加载、加密房间和房主输入校验", async () => {
  const network = await readFile(new URL("../app/game-network.ts", import.meta.url), "utf8");

  assert.match(network, /import\("trystero"\)/);
  assert.match(network, /password: options\.secret/);
  assert.match(network, /MAX_ROOM_PLAYERS = 4/);
  assert.match(network, /validateMultiplayerInput/);
  assert.match(network, /onPeerLeave/);
  assert.match(network, /snapshot-v1/);
});

test("GitHub Pages 保持静态导出和仓库子路径配置", async () => {
  const [config, workflow] = await Promise.all([
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8"),
  ]);

  assert.match(config, /output: "export"/);
  assert.match(config, /basePath/);
  assert.match(workflow, /PAGES_BASE_PATH/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});
