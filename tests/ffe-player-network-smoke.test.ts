import { describe, expect, it } from "vitest";
import { FfePlayersClient } from "@/lib/ffe-players/client";

const network = process.env.FFE_NETWORK_SMOKE === "1" ? describe : describe.skip;

network("smoke réseau annuaire FFE", () => {
  it("retrouve le profil attendu par son code réel sans conserver la réponse brute", async () => {
    const items = await new FfePlayersClient().search("W16194", 5);
    const profile = items.find((item) => item.ffeCode === "W16194");
    expect(profile).toBeDefined();
    expect(profile?.displayName).toBe("Vincent VALLET");
  }, 20_000);
});
