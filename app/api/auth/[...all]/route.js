import { getAuth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Variable pour stocker le handler initialisé
let handlerCache = null;

async function getHandler() {
  if (!handlerCache) {
    const auth = await getAuth();
    handlerCache = toNextJsHandler(auth);
  }
  return handlerCache;
}

export async function GET(request) {
  const { GET } = await getHandler();
  return GET(request);
}

export async function POST(request) {
  const { POST } = await getHandler();
  return POST(request);
}
