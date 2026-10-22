import { connection } from "next/server";

/** The visitor's country from the hosting platform's IP geolocation header, if any. */
export async function GET(req: Request) {
  await connection();
  const country = req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry") ?? null;
  return Response.json({ country });
}
