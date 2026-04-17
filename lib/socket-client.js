import { io } from "socket.io-client";

let socket;

export function getSocket() {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_BASE_URL || undefined, {
      transports: ["websocket", "polling"]
    });
  }

  return socket;
}
