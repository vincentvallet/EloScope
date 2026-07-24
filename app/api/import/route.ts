import { NextResponse } from "next/server";
import { z } from "zod";
import { FfeResultsAdapter } from "@/lib/importers/ffe";

const bodySchema = z.object({
  type: z.literal("url"),
  input: z.string().url().max(500),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const adapter = new FfeResultsAdapter();
    if (!adapter.canHandle(body.input)) return NextResponse.json({ error: "Source non reconnue" }, { status: 400 });
    const source = await adapter.fetchSource(body.input);
    const parsed = await adapter.parseSource(source);
    return NextResponse.json({ ok: true, data: adapter.normalize(parsed), fetchedAt: source.fetchedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import impossible";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
