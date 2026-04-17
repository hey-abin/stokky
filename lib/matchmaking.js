import crypto from "crypto";
import dbConnect from "./db.js";
import Room from "./models/room.js";
import {
  appendRuntimeMessage,
  closeRuntimeRoom,
  getRuntimeRoom,
  upsertRuntimeRoom
} from "./runtime-room-store.js";

class MatchmakingEngine {
  constructor() {
    this.waitingUsers = new Map();
  }

  normalizeInterests(interests = []) {
    return [...new Set(interests.map((item) => item.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
  }

  scoreCandidate(user, candidate) {
    const sharedInterests = user.interests.filter((interest) => candidate.interests.includes(interest));
    const sameMode =
      user.mode === candidate.mode || user.mode === "both" || candidate.mode === "both";

    return {
      sharedInterests,
      score: sharedInterests.length * 5 + (sameMode ? 2 : 0)
    };
  }

  remove(socketId) {
    this.waitingUsers.delete(socketId);
  }

  getQueueSize() {
    return this.waitingUsers.size;
  }

  async enqueue(payload) {
    const user = {
      socketId: payload.socketId,
      nickname: payload.nickname || "Guest",
      interests: this.normalizeInterests(payload.interests),
      mode: payload.mode || "both",
      joinedAt: Date.now()
    };

    let bestMatch = null;
    let bestScore = -1;
    let sharedInterests = [];

    for (const candidate of this.waitingUsers.values()) {
      if (candidate.socketId === user.socketId) {
        continue;
      }

      const result = this.scoreCandidate(user, candidate);

      if (result.score > bestScore) {
        bestScore = result.score;
        bestMatch = candidate;
        sharedInterests = result.sharedInterests;
      }
    }

    if (bestMatch) {
      this.waitingUsers.delete(bestMatch.socketId);

      const roomId = crypto.randomUUID();
      const roomRecord = {
        roomId,
        participants: [
          {
            socketId: user.socketId,
            nickname: user.nickname,
            interests: user.interests,
            mode: user.mode
          },
          {
            socketId: bestMatch.socketId,
            nickname: bestMatch.nickname,
            interests: bestMatch.interests,
            mode: bestMatch.mode
          }
        ],
        sharedInterests,
        active: true,
        messages: [],
        startedAt: new Date()
      };

      upsertRuntimeRoom(roomRecord);

      try {
        await dbConnect();
        await Room.create(roomRecord);
      } catch (_error) {
        // Fall back to in-memory room state when MongoDB is unavailable.
      }

      return {
        matched: true,
        roomId,
        participants: [user, bestMatch],
        sharedInterests
      };
    }

    this.waitingUsers.set(user.socketId, user);

    return {
      matched: false,
      position: this.waitingUsers.size
    };
  }

  async closeRoom(roomId) {
    if (!roomId) {
      return;
    }

    closeRuntimeRoom(roomId);

    try {
      await dbConnect();
      await Room.findOneAndUpdate(
        { roomId },
        {
          active: false,
          endedAt: new Date()
        }
      );
    } catch (_error) {
      // Runtime fallback is already updated above.
    }
  }

  async saveMessage(roomId, message) {
    if (!roomId || !message?.text) {
      return null;
    }

    const runtimeMessage = {
      _id: crypto.randomUUID(),
      senderId: message.senderId,
      senderLabel: message.senderLabel,
      text: message.text,
      createdAt: new Date().toISOString()
    };
    appendRuntimeMessage(roomId, runtimeMessage);

    try {
      await dbConnect();

      const room = await Room.findOneAndUpdate(
        { roomId },
        {
          $push: {
            messages: {
              senderId: message.senderId,
              senderLabel: message.senderLabel,
              text: message.text
            }
          }
        },
        { new: true }
      );

      return room?.messages?.at(-1) || runtimeMessage;
    } catch (_error) {
      return runtimeMessage;
    }
  }

  getRuntimeRoom(roomId) {
    return getRuntimeRoom(roomId);
  }
}

const matchmakingEngine = global.matchmakingEngine || new MatchmakingEngine();

if (!global.matchmakingEngine) {
  global.matchmakingEngine = matchmakingEngine;
}

export default matchmakingEngine;
