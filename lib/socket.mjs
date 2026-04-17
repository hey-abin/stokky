import crypto from "crypto";
import { Server } from "socket.io";
import matchmakingEngine from "./matchmaking.js";

function emitQueueStats(io) {
  io.emit("queue:stats", {
    waiting: matchmakingEngine.getQueueSize()
  });
}

export function attachSocketServer(server) {
  if (server.io) {
    return server.io;
  }

  const io = new Server(server, {
    cors: {
      origin: true,
      methods: ["GET", "POST"]
    }
  });

  const peerRoomMap = new Map();

  io.on("connection", (socket) => {
    emitQueueStats(io);

    socket.on("queue:join", async (payload, callback) => {
      try {
        const result = await matchmakingEngine.enqueue({
          socketId: socket.id,
          nickname: payload?.nickname,
          interests: payload?.interests || [],
          mode: payload?.mode || "both"
        });

        if (!result.matched) {
          callback?.({
            ok: true,
            matched: false,
            position: result.position
          });
          emitQueueStats(io);
          return;
        }

        const [firstUser, secondUser] = result.participants;
        const otherParticipant =
          firstUser.socketId === socket.id ? secondUser : firstUser;

        peerRoomMap.set(firstUser.socketId, result.roomId);
        peerRoomMap.set(secondUser.socketId, result.roomId);

        // Ensure both users are immediately added to the socket room on the server
        const firstSocket = io.sockets.sockets.get(firstUser.socketId);
        const secondSocket = io.sockets.sockets.get(secondUser.socketId);
        if (firstSocket) firstSocket.join(result.roomId);
        if (secondSocket) secondSocket.join(result.roomId);

        const starterId = [firstUser.socketId, secondUser.socketId].sort()[0];

        // Ensure both users are matched and informed
        for (const participant of result.participants) {
          const stranger =
            participant.socketId === firstUser.socketId ? secondUser : firstUser;

          io.to(participant.socketId).emit("match:found", {
            roomId: result.roomId,
            you: {
              socketId: participant.socketId,
              nickname: participant.nickname,
              interests: participant.interests,
              mode: participant.mode
            },
            stranger: {
              socketId: stranger.socketId,
              nickname: stranger.nickname,
              interests: stranger.interests,
              mode: stranger.mode
            },
            sharedInterests: result.sharedInterests,
            initiator: participant.socketId === starterId
          });
        }

        callback?.({
          ok: true,
          matched: true,
          roomId: result.roomId,
          stranger: {
            socketId: otherParticipant.socketId,
            nickname: otherParticipant.nickname
          }
        });
        emitQueueStats(io);
      } catch (error) {
        callback?.({
          ok: false,
          error: "Unable to join queue."
        });
      }
    });

    socket.on("queue:leave", () => {
      matchmakingEngine.remove(socket.id);
      emitQueueStats(io);
    });

    socket.on("room:join", ({ roomId }) => {
      if (!roomId) return;
      socket.join(roomId);
      peerRoomMap.set(socket.id, roomId);
      console.log(`[Socket] ${socket.id} joined room ${roomId}`);
    });

    socket.on("chat:send", async (payload) => {
      const roomId = payload?.roomId || peerRoomMap.get(socket.id);
      const safeText = payload?.text?.trim();

      if (!roomId || !safeText) {
        console.warn(`[Chat] Failed to send message: missing roomId or text. Socket: ${socket.id}`);
        return;
      }

      // Ensure the socket is actually in the room before emitting
      socket.join(roomId);

      const saved = await matchmakingEngine.saveMessage(roomId, {
        senderId: socket.id,
        senderLabel: payload.senderLabel || "You",
        text: safeText
      });

      console.log(`[Chat] Message from ${socket.id} in ${roomId}`);

      io.to(roomId).emit("chat:message", {
        id: saved?._id?.toString() || crypto.randomUUID(),
        senderId: socket.id,
        senderLabel: payload.senderLabel || "Guest",
        text: safeText,
        createdAt: saved?.createdAt || new Date().toISOString()
      });
    });

    socket.on("webrtc:signal", ({ roomId, targetId, data }) => {
      const currentRoomId = roomId || peerRoomMap.get(socket.id);
      if (!currentRoomId || !targetId || !data) {
        return;
      }

      console.log(`[WebRTC] Signaling from ${socket.id} to ${targetId} (${data.type || "candidate"})`);
      io.to(targetId).emit("webrtc:signal", {
        roomId: currentRoomId,
        senderId: socket.id,
        data
      });
    });

    socket.on("room:leave", async ({ roomId }) => {
      const currentRoomId = roomId || peerRoomMap.get(socket.id);
      if (!currentRoomId) {
        return;
      }

      socket.leave(currentRoomId);
      socket.to(currentRoomId).emit("room:peer-left");
      await matchmakingEngine.closeRoom(currentRoomId);
      peerRoomMap.delete(socket.id);
    });

    socket.on("disconnect", async () => {
      const roomId = peerRoomMap.get(socket.id);
      matchmakingEngine.remove(socket.id);

      if (roomId) {
        socket.to(roomId).emit("room:peer-left");
        peerRoomMap.delete(socket.id);
        await matchmakingEngine.closeRoom(roomId);
      }

      emitQueueStats(io);
    });
  });


  server.io = io;

  return io;
}
