import { io } from "socket.io-client";

let socket;

export function getSocket() {
  if (!socket) {
    const url =
      typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_BASE_URL || undefined;

    socket = io(url, {
      transports: ["websocket", "polling"]
    });
  }

  return socket;
}
