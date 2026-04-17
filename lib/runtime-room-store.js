const roomStore = global.runtimeRoomStore || new Map();

if (!global.runtimeRoomStore) {
  global.runtimeRoomStore = roomStore;
}

export function upsertRuntimeRoom(room) {
  roomStore.set(room.roomId, {
    ...room,
    messages: room.messages || []
  });
}

export function getRuntimeRoom(roomId) {
  return roomStore.get(roomId) || null;
}

export function appendRuntimeMessage(roomId, message) {
  const room = roomStore.get(roomId);

  if (!room) {
    return null;
  }

  room.messages.push(message);
  roomStore.set(roomId, room);

  return message;
}

export function closeRuntimeRoom(roomId) {
  const room = roomStore.get(roomId);

  if (!room) {
    return;
  }

  room.active = false;
  room.endedAt = new Date();
  roomStore.set(roomId, room);
}
