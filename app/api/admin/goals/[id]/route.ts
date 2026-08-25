import { updateGoal } from "@/src/server/services/admin-service";
import { handleAdminMutation } from "@/src/server/admin-route";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/goals/[id]">) {
  const { id } = await context.params;
  return handleAdminMutation(request, (auth, body) => updateGoal(auth, id, body));
}
