import { healthPayload } from "@/src/server/health";

export async function GET() {
  return Response.json(healthPayload());
}
