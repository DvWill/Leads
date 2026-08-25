import { resetUserPassword } from "@/src/server/services/admin-service";
import { handleAdminMutation } from "@/src/server/admin-route";

export async function POST(request: Request, context: RouteContext<"/api/admin/users/[id]/password">) {
  const { id } = await context.params;
  return handleAdminMutation(request, (auth, body) => resetUserPassword(auth, id, body));
}
