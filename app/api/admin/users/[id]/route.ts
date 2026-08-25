import { updateUser } from "@/src/server/services/admin-service";
import { handleAdminMutation } from "@/src/server/admin-route";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/users/[id]">) {
  const { id } = await context.params;
  return handleAdminMutation(request, (auth, body) => updateUser(auth, id, body));
}
