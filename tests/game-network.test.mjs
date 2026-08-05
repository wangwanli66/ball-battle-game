import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInviteHash,
  parseInviteHash,
  validateMultiplayerInput,
} from "../app/game-network.ts";

test("好友邀请链接可还原房间码与密钥", () => {
  const invite = { roomCode: "abc234", secret: "a".repeat(64) };
  const hash = buildInviteHash(invite);

  assert.ok(hash.startsWith("#room=ABC234&key="));
  assert.deepEqual(parseInviteHash(hash), { ...invite, roomCode: "ABC234" });
  assert.equal(parseInviteHash("#room=BAD&key=short"), null);
});

test("联机输入会拒绝异常值并将方向限制为单位向量", () => {
  const normalized = validateMultiplayerInput({ x: 2, y: 2, boost: true, splitSeq: 3 });

  assert.ok(normalized);
  assert.ok(Math.abs(Math.hypot(normalized.x, normalized.y) - 1) < 1e-12);
  assert.deepEqual(
    { boost: normalized.boost, splitSeq: normalized.splitSeq },
    { boost: true, splitSeq: 3 },
  );
  assert.equal(validateMultiplayerInput({ x: Number.NaN, y: 0, boost: false, splitSeq: 0 }), null);
  assert.equal(validateMultiplayerInput({ x: 0, y: 0, boost: "yes", splitSeq: 0 }), null);
  assert.equal(validateMultiplayerInput({ x: 0, y: 0, boost: false, splitSeq: 1.5 }), null);
});
