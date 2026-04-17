const roomStore = global.runtimeRoomStore || new Map();

if (!global.runtimeRoomStore) {
  global.runtimeRoomStore = roomStore;
}

export function upsertRuntimeRoom(room) {
  purgeExpiredRooms();
  roomStore.set(room.roomId, {
    ...room,
    messages: room.messages || []
  });
}

export function getRuntimeRoom(roomId) {
  purgeExpiredRooms();
  return roomStore.get(roomId) || null;
}

export function appendRuntimeMessage(roomId, message) {
  purgeExpiredRooms();
  const room = roomStore.get(roomId);

  if (!room) {
    return null;
  }

  room.messages.push(message);
  roomStore.set(roomId, room);

  return message;
}

export function closeRuntimeRoom(roomId) {
  purgeExpiredRooms();
  const room = roomStore.get(roomId);

  if (!room) {
    return;
  }

  room.active = false;
  room.endedAt = new Date();
  room.deleteAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  roomStore.set(roomId, room);
}

function purgeExpiredRooms() {
  const now = Date.now();

  for (const [roomId, room] of roomStore.entries()) {
    if (room.deleteAt && new Date(room.deleteAt).getTime() <= now) {
      roomStore.delete(roomId);
    }
  }
}
