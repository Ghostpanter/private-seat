export type SeatRole = "host" | "guest" | "pending" | "revoked";

export type GrokLink = "saved" | "env" | "none";

export type SeatState = {
  role: SeatRole;
  name: string;
  todayUsed: number;
  dailyCap: number;
  globalUsed: number;
  globalCap: number;
  grok: GrokLink;
};

export type ThreadRow = {
  id: string;
  title: string;
  updatedAt: string;
};

export type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type InviteRow = {
  id: string;
  code: string;
  label: string;
  maxUses: number;
  uses: number;
  revoked: boolean;
};

export type GuestRow = {
  id: string;
  name: string;
  joinedAt: string;
  today: number;
  revoked: boolean;
};
