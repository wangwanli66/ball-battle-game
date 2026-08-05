"use client";

import { useEffect, useState, type FormEvent } from "react";

export type PartyState = {
  role: "offline" | "host" | "guest";
  status: "offline" | "connecting" | "waiting" | "connected" | "error";
  roomCode: string;
  inviteUrl: string;
  peerCount: number;
  message: string;
};

export type PartyPanelProps = {
  party: PartyState;
  onCreate: (name: string) => void;
  onJoin: (request: { name: string; roomCode: string; secret: string }) => void;
  onLeave: () => void;
};

const STATUS_TEXT: Record<PartyState["status"], string> = {
  offline: "尚未连接好友房间",
  connecting: "正在建立连接…",
  waiting: "房间已创建，等待好友加入",
  connected: "好友已连接，可以一起游戏",
  error: "连接失败，请检查房间信息后重试",
};

function normalizeRoomCode(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6);
}

export default function PartyPanel({ party, onCreate, onJoin, onLeave }: PartyPanelProps) {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [secret, setSecret] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    const prefillFromHash = () => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const invitedRoom = params.get("room");
      const invitedKey = params.get("key");
      if (invitedRoom) setRoomCode(normalizeRoomCode(invitedRoom));
      if (invitedKey) setSecret(invitedKey);
    };
    prefillFromHash();
    window.addEventListener("hashchange", prefillFromHash);
    return () => window.removeEventListener("hashchange", prefillFromHash);
  }, []);

  const statusMessage = party.message || STATUS_TEXT[party.status];
  const isConnecting = party.status === "connecting";
  const isInRoom = party.role !== "offline";
  const canCreate = name.trim().length > 0 && !isConnecting;
  const canJoin = canCreate && roomCode.length === 6 && secret.trim().length > 0;

  const joinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canJoin) return;
    onJoin({ name: name.trim(), roomCode, secret: secret.trim() });
  };

  const copyInvite = async () => {
    if (!party.inviteUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(party.inviteUrl);
      } else {
        const field = document.createElement("textarea");
        field.value = party.inviteUrl;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        document.execCommand("copy");
        field.remove();
      }
      setCopyMessage("邀请链接已复制");
    } catch {
      setCopyMessage("复制失败，请手动复制链接");
    }
  };

  if (isInRoom) {
    return (
      <section className="party-panel party-panel-room" aria-labelledby="party-panel-title" aria-busy={isConnecting}>
        <header className="party-panel-header">
          <div>
            <p className="party-panel-kicker">FRIEND ROOM</p>
            <h2 id="party-panel-title">好友房间</h2>
          </div>
          <span className={`party-role party-role-${party.role}`}>
            {party.role === "host" ? "房主" : "成员"}
          </span>
        </header>

        <p
          className={`party-status party-status-${party.status}`}
          role={party.status === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          <span className="party-status-dot" aria-hidden="true" />
          {statusMessage}
        </p>

        <dl className="party-room-details">
          <div><dt>房间码</dt><dd><code>{party.roomCode || "------"}</code></dd></div>
          <div><dt>在线人数</dt><dd>{party.peerCount}</dd></div>
        </dl>

        <div className="party-invite-row">
          <label htmlFor="party-invite-url">邀请链接</label>
          <div className="party-invite-control">
            <input id="party-invite-url" value={party.inviteUrl} readOnly />
            <button type="button" onClick={() => void copyInvite()} disabled={!party.inviteUrl}>
              复制链接
            </button>
          </div>
          {copyMessage && <p className="party-copy-message" role="status" aria-live="polite">{copyMessage}</p>}
        </div>

        <button className="party-leave-button" type="button" onClick={onLeave}>离开房间</button>
      </section>
    );
  }

  return (
    <section className="party-panel party-panel-offline" aria-labelledby="party-panel-title" aria-busy={isConnecting}>
      <header className="party-panel-header">
        <div>
          <p className="party-panel-kicker">FRIEND ROOM</p>
          <h2 id="party-panel-title">好友房间</h2>
        </div>
      </header>

      <p
        className={`party-status party-status-${party.status}`}
        role={party.status === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        <span className="party-status-dot" aria-hidden="true" />
        {statusMessage}
      </p>

      <form className="party-form" onSubmit={joinRoom}>
        <label className="party-field">
          <span>昵称</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="输入你的昵称"
            autoComplete="nickname"
            maxLength={20}
            required
            disabled={isConnecting}
          />
        </label>

        <div className="party-join-fields">
          <label className="party-field">
            <span>6 位房间码</span>
            <input
              type="text"
              value={roomCode}
              onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))}
              placeholder="ABC123"
              autoCapitalize="characters"
              autoComplete="off"
              minLength={6}
              maxLength={6}
              pattern="[A-Za-z0-9]{6}"
              required
              disabled={isConnecting}
            />
          </label>
          <label className="party-field">
            <span>房间密钥</span>
            <input
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="输入邀请密钥"
              autoComplete="off"
              required
              disabled={isConnecting}
            />
          </label>
        </div>

        <div className="party-actions">
          <button type="button" onClick={() => onCreate(name.trim())} disabled={!canCreate}>
            创建房间
          </button>
          <button type="submit" disabled={!canJoin}>加入房间</button>
        </div>
      </form>
    </section>
  );
}
