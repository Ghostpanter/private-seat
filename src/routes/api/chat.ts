import { createFileRoute } from "@tanstack/react-router";
import { handleChatPost } from "@/lib/seat/chat.server";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: ({ request }) => handleChatPost(request),
    },
  },
});
