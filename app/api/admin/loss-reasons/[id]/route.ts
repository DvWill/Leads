import { updateLossReason } from "@/src/server/services/admin-service";
import { handleAdminMutation } from "@/src/server/admin-route";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/loss-reasons/[id]">) {
  const { id } = await context.params;
  return handleAdminMutation(request, (auth, body) => updateLossReason(auth, id, body));
}
