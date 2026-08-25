import { setUserStatus } from "@/src/server/services/admin-service";
import { handleAdminMutation } from "@/src/server/admin-route";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/users/[id]/status">) {
  const { id } = await context.params;
  return handleAdminMutation(request, (auth, body) => setUserStatus(auth, id, body));
}
