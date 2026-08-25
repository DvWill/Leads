import { createLossReason } from "@/src/server/services/admin-service";
import { handleAdminMutation } from "@/src/server/admin-route";

export function POST(request: Request) {
  return handleAdminMutation(request, createLossReason, 201);
}
