import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema(
  {
    senderId: {
      type: String,
      required: true
    },
    senderLabel: {
      type: String,
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 700
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const ParticipantSchema = new mongoose.Schema(
  {
    socketId: {
      type: String,
      required: true
    },
    nickname: {
      type: String,
      default: "Guest"
    },
    interests: {
      type: [String],
      default: []
    },
    mode: {
      type: String,
      enum: ["text", "video", "both"],
      default: "both"
    }
  },
  { _id: false }
);

const RoomSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    participants: {
      type: [ParticipantSchema],
      default: []
    },
    sharedInterests: {
      type: [String],
      default: []
    },
    active: {
      type: Boolean,
      default: true
    },
    messages: {
      type: [MessageSchema],
      default: []
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    endedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

const Room = mongoose.models.Room || mongoose.model("Room", RoomSchema);

export default Room;
