import { getCurrentUser, handleError, toUserDTO } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ user: null }, { status: 401, headers: noStore });
    return Response.json({ user: toUserDTO(user) }, { headers: noStore });
  } catch (e) {
    return handleError(e);
  }
}
