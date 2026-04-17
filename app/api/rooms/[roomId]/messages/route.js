import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import matchmakingEngine from "@/lib/matchmaking";
import Room from "@/lib/models/room";

export async function GET(_request, { params }) {
  let room = null;

  try {
    await dbConnect();
    room = await Room.findOne({ roomId: params.roomId }).lean();
  } catch (_error) {
    room = matchmakingEngine.getRuntimeRoom(params.roomId);
  }

  const messages = (room?.messages || []).map((message) => ({
    id: message._id?.toString?.() || message._id,
    senderId: message.senderId,
    senderLabel: message.senderLabel,
    text: message.text,
    createdAt: message.createdAt
  }));

  return NextResponse.json({
    roomId: params.roomId,
    messages
  });
}
